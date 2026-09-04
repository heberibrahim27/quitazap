// ─────────────────────────────────────────
// QuitaZAP Controle — "Vazamentos do salário" (Skill Analista)
// ─────────────────────────────────────────
// Detecta gastos recorrentes no histórico (mesmo estabelecimento, valor
// estável, todo mês — o perfil de uma assinatura tipo Netflix/Spotify) e
// mostra o total mensal JUNTO com o anualizado, porque a virada pra valor
// anual costuma pesar mais na percepção do que ver só o valor do mês.
//
// "Recorrente" aqui é 100% determinístico: mesma descrição normalizada
// aparecendo em pelo menos 2 dos últimos N meses (o mês corrente fica de
// fora — pode estar incompleto), com valor variando no máximo 15% em
// torno da média — separa assinatura (valor estável) de gasto genérico
// que só por coincidência tem o mesmo nome de estabelecimento em mais de
// um mês (ex: "Mercado", cujo valor varia muito de compra pra compra).

import { prisma } from "@/lib/prisma";
import { limitesDoMes, anoMesAtualBrasil } from "./motor";

export interface VazamentoDetectado {
  descricao: string;
  valorMensal: number;
  valorAnualizado: number;
  ocorrencias: number;
  mesesAnalisados: number;
}

const TIPOS_ALLOWLIST = ["DESPESA_FIXA", "DESPESA_VARIAVEL", "COMPRA_CARTAO"] as const;
const TOLERANCIA_VALOR = 0.15;

function normalizarDescricaoVazamento(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function detectarVazamentosSalario(
  clienteId: string,
  referencia: Date = new Date(),
  mesesAnalisados = 3,
): Promise<VazamentoDetectado[]> {
  const { ano, mes } = anoMesAtualBrasil(referencia);
  let anoIter = ano;
  let mesIter = mes;

  const porDescricao = new Map<string, { descricaoOriginal: string; valoresPorMes: number[] }>();

  for (let i = 0; i < mesesAnalisados; i++) {
    const anterior = mesIter === 1 ? { ano: anoIter - 1, mes: 12 } : { ano: anoIter, mes: mesIter - 1 };
    anoIter = anterior.ano;
    mesIter = anterior.mes;
    const periodo = limitesDoMes(anoIter, mesIter);

    const lancamentos = await prisma.lancamento.findMany({
      where: {
        clienteId,
        data: { gte: periodo.inicio, lt: periodo.fim },
        tipo: { in: [...TIPOS_ALLOWLIST] },
        categoria: { not: "Metas" },
      },
      select: { descricao: true, valor: true },
    });

    // Duas cobranças do mesmo estabelecimento no mesmo mês somam (evita
    // subestimar), em vez de virar duas ocorrências separadas.
    const somaNoMes = new Map<string, { descricaoOriginal: string; total: number }>();
    for (const l of lancamentos) {
      if (!l.descricao) continue;
      const chave = normalizarDescricaoVazamento(l.descricao);
      if (!chave) continue;
      const atual = somaNoMes.get(chave);
      somaNoMes.set(chave, { descricaoOriginal: atual?.descricaoOriginal ?? l.descricao, total: (atual?.total ?? 0) + l.valor });
    }

    for (const [chave, { descricaoOriginal, total }] of somaNoMes) {
      const acumulado = porDescricao.get(chave) ?? { descricaoOriginal, valoresPorMes: [] };
      acumulado.valoresPorMes.push(total);
      porDescricao.set(chave, acumulado);
    }
  }

  const minimoOcorrencias = Math.min(2, mesesAnalisados);
  const vazamentos: VazamentoDetectado[] = [];

  for (const { descricaoOriginal, valoresPorMes } of porDescricao.values()) {
    if (valoresPorMes.length < minimoOcorrencias) continue;
    const media = valoresPorMes.reduce((soma, v) => soma + v, 0) / valoresPorMes.length;
    if (media <= 0) continue;
    const estavel = valoresPorMes.every((v) => Math.abs(v - media) / media <= TOLERANCIA_VALOR);
    if (!estavel) continue;

    vazamentos.push({
      descricao: descricaoOriginal,
      valorMensal: media,
      valorAnualizado: media * 12,
      ocorrencias: valoresPorMes.length,
      mesesAnalisados,
    });
  }

  return vazamentos.sort((a, b) => b.valorAnualizado - a.valorAnualizado);
}
