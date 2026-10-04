// ─────────────────────────────────────────
// Geração das ocorrências de lançamentos recorrentes (cron diário)
// ─────────────────────────────────────────
// Regras (decisões em recorrencia.ts):
//  • a ocorrência só nasce quando o DIA chega (Brasília);
//  • cada lançamento-fonte gera no máximo UMA cópia — a fonte é marcada com
//    uma linha de LancamentoAuditoria (acao "RECORRENCIA"), sem coluna nova
//    no banco. Apagar a cópia encerra a série; editar a cópia vale pra série
//    dali pra frente (a cópia vira a fonte do mês seguinte);
//  • não duplica: se o cliente já lançou à mão algo equivalente naquele mês
//    (mesmo tipo + descrição + cartão), só marca a fonte como atendida.

import { prisma } from "@/lib/prisma";
import { limitesDoMes } from "./motor";
import {
  TIPOS_RECORRENTES,
  decidirRecorrencia,
  normalizarDescricaoRecorrencia,
  podeRepetir,
} from "./recorrencia";

const ACAO_RECORRENCIA = "RECORRENCIA";

async function marcarFonteAtendida(
  tx: Pick<typeof prisma, "lancamentoAuditoria">,
  fonte: { id: string; clienteId: string },
  copiaId: string | null
): Promise<void> {
  await tx.lancamentoAuditoria.create({
    data: {
      lancamentoId: fonte.id,
      clienteId: fonte.clienteId,
      acao: ACAO_RECORRENCIA,
      canal: "CRON",
      antes: undefined,
      depois: copiaId ? { copiaId } : { jaExistia: true },
    },
  });
}

/** Fonte mais antiga considerada: evita ressuscitar lançamento esquecido de
 * muitos meses atrás quando a coluna nova ainda estava vazia. */
const JANELA_FONTES_DIAS = 100;
/** Teto de meses gerados por fonte numa mesma execução (cliente sumido). */
const MAX_MESES_POR_EXECUCAO = 4;

function anoMesBrasil(data: Date): { ano: number; mes: number } {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(data)
    .split("-")
    .map(Number);
  return { ano, mes };
}

export interface ResultadoRecorrencias {
  fontesAvaliadas: number;
  criados: number;
  jaExistiam: number;
}

export async function gerarRecorrenciasPendentes(
  agora: Date = new Date(),
  clienteId?: string
): Promise<ResultadoRecorrencias> {
  const desde = new Date(agora.getTime() - JANELA_FONTES_DIAS * 86_400_000);
  const fontes = await prisma.lancamento.findMany({
    where: {
      ...(clienteId ? { clienteId } : {}),
      recorrente: true,
      auditoria: { none: { acao: ACAO_RECORRENCIA } },
      tipo: { in: [...TIPOS_RECORRENTES] },
      data: { gte: desde, lt: agora },
    },
    orderBy: { data: "asc" },
  });

  const resultado: ResultadoRecorrencias = { fontesAvaliadas: 0, criados: 0, jaExistiam: 0 };

  for (const original of fontes) {
    if (!podeRepetir(original)) continue;
    resultado.fontesAvaliadas++;

    let fonte = {
      id: original.id,
      clienteId: original.clienteId,
      tipo: original.tipo,
      descricao: original.descricao,
      categoria: original.categoria,
      valor: original.valor,
      data: original.data,
      cartaoId: original.cartaoId,
      origem: original.origem,
    };

    for (let i = 0; i < MAX_MESES_POR_EXECUCAO; i++) {
      const { aguardar, proxima } = decidirRecorrencia(fonte.data, agora);
      if (aguardar) break;

      const { ano, mes } = anoMesBrasil(proxima);
      const periodo = limitesDoMes(ano, mes);
      const doMes = await prisma.lancamento.findMany({
        where: {
          clienteId: fonte.clienteId,
          tipo: fonte.tipo,
          cartaoId: fonte.cartaoId,
          data: { gte: periodo.inicio, lt: periodo.fim },
        },
        select: { id: true, descricao: true },
      });
      const alvo = normalizarDescricaoRecorrencia(fonte.descricao);
      const equivalente = doMes.find((l) => normalizarDescricaoRecorrencia(l.descricao) === alvo);

      if (equivalente) {
        // Já existe (lançado à mão): só encerra a fonte; a série continua a
        // partir do que o cliente lançou, se ele marcou como recorrente.
        await marcarFonteAtendida(prisma, fonte, null);
        resultado.jaExistiam++;
        break;
      }

      const copia = await prisma.$transaction(async (tx) => {
        const criada = await tx.lancamento.create({
          data: {
            clienteId: fonte.clienteId,
            tipo: fonte.tipo,
            descricao: fonte.descricao,
            categoria: fonte.categoria,
            valor: fonte.valor,
            data: proxima,
            recorrente: true,
            cartaoId: fonte.cartaoId,
            origem: "RECORRENCIA",
          },
        });
        await marcarFonteAtendida(tx, fonte, criada.id);
        return criada;
      });
      resultado.criados++;

      // A cópia é a fonte do mês seguinte (se esse mês também já chegou).
      fonte = {
        id: copia.id,
        clienteId: copia.clienteId,
        tipo: copia.tipo,
        descricao: copia.descricao,
        categoria: copia.categoria,
        valor: copia.valor,
        data: copia.data,
        cartaoId: copia.cartaoId,
        origem: copia.origem,
      };
    }
  }

  return resultado;
}
