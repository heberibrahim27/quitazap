import { parseMoneyBR } from "../money";

export const MENSAGEM_FORA_ESCOPO_FINANCEIRO =
  "Eu sou o assistente financeiro do QuitaZAP. Posso te ajudar a registrar gastos, receitas, despesas fixas, renda, cartões, faturas, dívidas, pagamentos, metas e organizar sua vida financeira pelo WhatsApp.";

export type TipoItemFinanceiro =
  | "renda"
  | "receita"
  | "despesa_fixa"
  | "despesa_variavel"
  | "cartao"
  | "fatura"
  | "boleto"
  | "divida"
  // Pagar uma parcela/dívida JÁ existente — distinto de "divida" (que é
  // CADASTRAR uma dívida nova). Precisa ser um tipo à parte porque a
  // persistência é completamente diferente: "divida" cria Divida+Parcela,
  // "pagamento_divida" só baixa uma que já existe (marcarDividaComoPaga).
  | "pagamento_divida"
  | "meta"
  | "aposta"
  | "transferencia"
  | "correcao"
  | "remocao"
  | "consulta"
  | "desconhecido";

export type RecorrenciaFinanceira = "mensal" | "semanal" | "anual" | "unica" | null;
export type OrigemFinanceira = "saldo" | "cartao" | "conta" | null;

/** Tipos de Divida aceitos pelo schema (ver prisma/schema.prisma, model
 * Divida) — não existe "FINANCIAMENTO" como valor próprio hoje, financiamento
 * entra como "EMPRESTIMO". */
export type TipoDividaFinanceiro = "CARTAO" | "EMPRESTIMO" | "BOLETO" | "ACORDO" | "OUTRO";

export type ItemFinanceiroInterpretado = {
  tipo: TipoItemFinanceiro;
  descricaoOriginal: string;
  descricaoNormalizada: string;
  categoria: string;
  valor: number | null;
  quantidade?: number | null;
  valorUnitario?: number | null;
  recorrencia?: RecorrenciaFinanceira;
  origem?: OrigemFinanceira;
  cartao?: string | null;
  dataVencimento?: string | null;
  observacao?: string | null;

  // ── Cartão (tipo "cartao"/"fatura") ──
  /** Dia de fechamento/vencimento da fatura, quando o cliente informa
   * configuração de cartão (não confundir com dataVencimento, que é usado
   * pra um vencimento pontual de conta/parcela). */
  diaFechamentoCartao?: number | null;
  diaVencimentoCartao?: number | null;

  // ── Dívida/empréstimo NOVO (tipo "divida") ──
  /** credor vive em descricaoNormalizada. `valor` (quando presente) é a
   * parcela mensal — `valorTotalDivida` é o saldo/valor total da dívida,
   * sempre que o cliente informar os dois separados ("devo 3 mil, pago
   * 450 por mês" → valorTotalDivida=3000, valor=450). */
  tipoDivida?: TipoDividaFinanceiro | null;
  valorTotalDivida?: number | null;
  totalParcelas?: number | null;
  diaVencimentoDivida?: number | null;

  // ── Pagamento de dívida existente (tipo "pagamento_divida") ──
  // credor (pra achar a dívida certa) vive em descricaoNormalizada; valor
  // é quanto foi pago agora.

  // ── Meta (tipo "meta") ──
  /** "criar" = meta nova (nome em descricaoNormalizada, alvo em
   * valorAlvoMeta); "depositar" = guardar dinheiro numa meta já existente
   * (nome em descricaoNormalizada, quantia em `valor`). */
  acaoMeta?: "criar" | "depositar" | null;
  valorAlvoMeta?: number | null;
};

export type FinanceiroIntent = {
  emEscopo: boolean;
  intencao: string;
  confianca: number;
  precisaConfirmacao: boolean;
  motivoConfirmacao?: string;
  mensagemForaEscopo?: string;
  itens: ItemFinanceiroInterpretado[];
  perguntasEsclarecimento?: string[];
};

export function criarIntentForaEscopo(): FinanceiroIntent {
  return {
    emEscopo: false,
    intencao: "fora_escopo",
    confianca: 1,
    precisaConfirmacao: false,
    mensagemForaEscopo: MENSAGEM_FORA_ESCOPO_FINANCEIRO,
    itens: [],
  };
}

// Rede de segurança independente do prompt: a IA remota às vezes devolve
// valor como string ("50,00", "R$ 50", "50 reais") mesmo quando instruída a
// sempre mandar número puro. Em vez de derrubar o item inteiro (e cair no
// "não consegui classificar"), tenta reaproveitar o mesmo parser usado nos
// fluxos determinísticos (parseMoneyBR) antes de desistir.
function numeroOuNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parseado = parseMoneyBR(v);
    if (typeof parseado === "number" && Number.isFinite(parseado)) return parseado;
  }
  return null;
}

const TIPOS_ITEM_VALIDOS = new Set<TipoItemFinanceiro>([
  "renda",
  "receita",
  "despesa_fixa",
  "despesa_variavel",
  "cartao",
  "fatura",
  "boleto",
  "divida",
  "pagamento_divida",
  "meta",
  "aposta",
  "transferencia",
  "correcao",
  "remocao",
  "consulta",
  "desconhecido",
]);

// Mesma ideia do numeroOuNull acima: a IA remota ocasionalmente usa um
// sinônimo plausível em vez do valor exato do enum (ex.: "gasto" ou
// "despesa" em vez de "despesa_variavel"). Normaliza os sinônimos mais
// comuns em vez de descartar o item inteiro por causa do nome do tipo.
function normalizarTipoItem(tipo: unknown): TipoItemFinanceiro {
  if (typeof tipo === "string") {
    const normalizado = tipo.trim().toLowerCase();
    if (TIPOS_ITEM_VALIDOS.has(normalizado as TipoItemFinanceiro)) {
      return normalizado as TipoItemFinanceiro;
    }
    const SINONIMOS: Record<string, TipoItemFinanceiro> = {
      gasto: "despesa_variavel",
      despesa: "despesa_variavel",
      "despesa_variável": "despesa_variavel",
      "despesa variavel": "despesa_variavel",
      "despesa fixa": "despesa_fixa",
      "conta fixa": "despesa_fixa",
      entrada: "receita",
      renda_avulsa: "receita",
      "dívida": "divida",
      emprestimo: "divida",
      "empréstimo": "divida",
      pagamento: "pagamento_divida",
      "pagamento_dívida": "pagamento_divida",
    };
    if (SINONIMOS[normalizado]) return SINONIMOS[normalizado];
  }
  return "desconhecido";
}

function categoriaOuOutros(v: unknown): string {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : "Outros";
}

export function validarFinanceiroIntent(valor: unknown): FinanceiroIntent | null {
  if (!valor || typeof valor !== "object") return null;
  const raw = valor as Partial<FinanceiroIntent>;
  if (typeof raw.emEscopo !== "boolean") return null;
  if (typeof raw.intencao !== "string") return null;
  if (typeof raw.confianca !== "number" || !Number.isFinite(raw.confianca)) return null;
  if (typeof raw.precisaConfirmacao !== "boolean") return null;
  if (!Array.isArray(raw.itens)) return null;

  return {
    emEscopo: raw.emEscopo,
    intencao: raw.intencao,
    confianca: Math.max(0, Math.min(1, raw.confianca)),
    precisaConfirmacao: raw.precisaConfirmacao,
    motivoConfirmacao: typeof raw.motivoConfirmacao === "string" ? raw.motivoConfirmacao : undefined,
    mensagemForaEscopo: typeof raw.mensagemForaEscopo === "string" ? raw.mensagemForaEscopo : undefined,
    itens: raw.itens
      .filter((item): item is ItemFinanceiroInterpretado => Boolean(item && typeof item === "object"))
      .map((item) => ({
        tipo: normalizarTipoItem(item.tipo),
        descricaoOriginal: item.descricaoOriginal ?? "",
        descricaoNormalizada: item.descricaoNormalizada ?? "",
        categoria: categoriaOuOutros(item.categoria),
        valor: numeroOuNull(item.valor),
        quantidade: numeroOuNull(item.quantidade),
        valorUnitario: numeroOuNull(item.valorUnitario),
        recorrencia: item.recorrencia ?? null,
        origem: item.origem ?? null,
        cartao: item.cartao ?? null,
        dataVencimento: item.dataVencimento ?? null,
        observacao: item.observacao ?? null,
        diaFechamentoCartao: numeroOuNull(item.diaFechamentoCartao),
        diaVencimentoCartao: numeroOuNull(item.diaVencimentoCartao),
        tipoDivida: item.tipoDivida ?? null,
        valorTotalDivida: numeroOuNull(item.valorTotalDivida),
        totalParcelas: numeroOuNull(item.totalParcelas),
        diaVencimentoDivida: numeroOuNull(item.diaVencimentoDivida),
        acaoMeta: item.acaoMeta ?? null,
        valorAlvoMeta: numeroOuNull(item.valorAlvoMeta),
      })),
    perguntasEsclarecimento: Array.isArray(raw.perguntasEsclarecimento)
      ? raw.perguntasEsclarecimento.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}
