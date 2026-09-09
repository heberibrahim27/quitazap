// ─────────────────────────────────────────
// QuitaZAP — Cadastro de dívida/empréstimo (Divida + Parcela)
// ─────────────────────────────────────────
// Extraído da Server Action de /minha-conta/emprestimos/novo (era lógica
// inline só daquela página) pra virar reaproveitável — o rescue parser do
// WhatsApp (financeiro-intent-resolver.ts, via salvarItensConfirmadosIA)
// agora cria dívida pelo mesmo caminho, em vez de duplicar o cálculo de
// parcela/arredondamento.

import { prisma } from "./prisma";
import { adicionarMeses } from "./calculos";

export type TipoDividaService = "CARTAO" | "EMPRESTIMO" | "BOLETO" | "ACORDO" | "OUTRO";

export interface CriarDividaParcelaParams {
  clienteId: string;
  credor: string;
  totalParcelas: number;
  primeiraData: Date;
  valorTotal?: number | null;
  valorParcela?: number | null;
  descontadoEmFolha?: boolean;
  tipo?: TipoDividaService;
}

export type ResultadoCriarDivida = { ok: true; dividaId: string } | { ok: false; erro: string };

/** Cria uma Divida com cronograma de Parcela — mesma regra de sempre: se o
 * valor da parcela vier informado, ele manda (contrato já embute juros,
 * não recalcula); sem ele, rateia o valor total igualmente pelas parcelas,
 * absorvendo o resto do arredondamento na última. */
export async function criarDividaComParcelas(params: CriarDividaParcelaParams): Promise<ResultadoCriarDivida> {
  const {
    clienteId,
    credor,
    totalParcelas,
    primeiraData,
    valorTotal: valorTotalInformado,
    valorParcela: valorParcelaInformado,
    descontadoEmFolha = false,
    tipo = "EMPRESTIMO",
  } = params;

  if (!credor.trim()) return { ok: false, erro: "Digite quem emprestou." };
  if (!Number.isInteger(totalParcelas) || totalParcelas <= 0 || totalParcelas > 360) {
    return { ok: false, erro: "Quantidade de parcelas inválida." };
  }
  if (Number.isNaN(primeiraData.getTime())) return { ok: false, erro: "Data da primeira parcela inválida." };
  if (valorTotalInformado != null && (!Number.isFinite(valorTotalInformado) || valorTotalInformado <= 0)) {
    return { ok: false, erro: "O valor total tomado emprestado é inválido." };
  }
  if (valorParcelaInformado != null && (!Number.isFinite(valorParcelaInformado) || valorParcelaInformado <= 0)) {
    return { ok: false, erro: "O valor da parcela é inválido." };
  }
  if (valorTotalInformado == null && valorParcelaInformado == null) {
    return { ok: false, erro: "Preciso do valor total ou do valor da parcela." };
  }

  let valorPorParcela: number;
  let valorTotalFinal: number;
  if (valorParcelaInformado != null) {
    valorPorParcela = Math.round(valorParcelaInformado * 100) / 100;
    valorTotalFinal = valorTotalInformado ?? Math.round(valorPorParcela * totalParcelas * 100) / 100;
  } else {
    valorTotalFinal = valorTotalInformado as number;
    valorPorParcela = Math.floor((valorTotalFinal / totalParcelas) * 100) / 100;
  }

  const restoUltimaParcela =
    valorParcelaInformado != null ? 0 : Math.round((valorTotalFinal - valorPorParcela * totalParcelas) * 100) / 100;

  try {
    const divida = await prisma.divida.create({
      data: {
        clienteId,
        credor: credor.trim(),
        tipo,
        status: "ATIVA",
        valorTotal: valorTotalFinal,
        totalParcelas,
        diaVencimento: primeiraData.getDate(),
        descontadoEmFolha,
      },
    });

    const parcelasData = Array.from({ length: totalParcelas }, (_, i) => {
      // adicionarMeses (não d.setMonth direto) — bug achado em teste ao
      // vivo 09/09/2026: setMonth cru estoura pro mês seguinte quando
      // primeiraData cai em 29/30/31 e o mês alvo tem menos dias, gerando
      // duas parcelas no mesmo mês e pulando um mês inteiro sem nenhuma.
      const vencimento = adicionarMeses(primeiraData, i);
      const ehUltima = i === totalParcelas - 1;
      return {
        dividaId: divida.id,
        numero: i + 1,
        valor: ehUltima ? Math.round((valorPorParcela + restoUltimaParcela) * 100) / 100 : valorPorParcela,
        vencimento,
        status: "PENDENTE",
      };
    });
    await prisma.parcela.createMany({ data: parcelasData });

    return { ok: true, dividaId: divida.id };
  } catch (err) {
    console.error("[DIVIDA-SERVICE] Erro ao criar dívida:", err);
    return { ok: false, erro: "Não foi possível salvar a dívida. Tente de novo." };
  }
}

/** Resolve o nome de um credor pra uma Divida ATIVA existente do cliente por
 * correspondência aproximada — mesmo padrão de encontrarMetaPorNome
 * (meta-service.ts). Usado quando o rescue parser do WhatsApp só tem o nome
 * dito pelo cliente ("paguei a parcela do Carlos"), não o id. Retorna null
 * se não achar exatamente uma. */
export async function encontrarDividaAtivaPorCredor(clienteId: string, credorAproximado: string) {
  const dividas = await prisma.divida.findMany({ where: { clienteId, status: "ATIVA" } });
  const normalizar = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const alvo = normalizar(credorAproximado);
  const encontradas = dividas.filter((d) => normalizar(d.credor).includes(alvo) || alvo.includes(normalizar(d.credor)));
  return encontradas.length === 1 ? encontradas[0] : null;
}
