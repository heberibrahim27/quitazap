export const MENSAGEM_FORA_ESCOPO_FINANCEIRO =
  "Eu sou o assistente financeiro do QuitaZAP. Posso te ajudar a registrar gastos, receitas, despesas fixas, renda, cartões, faturas, dívidas, metas e organizar sua vida financeira pelo WhatsApp.";

export type TipoItemFinanceiro =
  | "renda"
  | "receita"
  | "despesa_fixa"
  | "despesa_variavel"
  | "cartao"
  | "fatura"
  | "boleto"
  | "divida"
  | "meta"
  | "aposta"
  | "transferencia"
  | "correcao"
  | "remocao"
  | "consulta"
  | "desconhecido";

export type RecorrenciaFinanceira = "mensal" | "semanal" | "anual" | "unica" | null;
export type OrigemFinanceira = "saldo" | "cartao" | "conta" | null;

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
        tipo: item.tipo ?? "desconhecido",
        descricaoOriginal: item.descricaoOriginal ?? "",
        descricaoNormalizada: item.descricaoNormalizada ?? "",
        categoria: item.categoria ?? "Outros",
        valor: typeof item.valor === "number" && Number.isFinite(item.valor) ? item.valor : null,
        quantidade: typeof item.quantidade === "number" && Number.isFinite(item.quantidade) ? item.quantidade : null,
        valorUnitario: typeof item.valorUnitario === "number" && Number.isFinite(item.valorUnitario) ? item.valorUnitario : null,
        recorrencia: item.recorrencia ?? null,
        origem: item.origem ?? null,
        cartao: item.cartao ?? null,
        dataVencimento: item.dataVencimento ?? null,
        observacao: item.observacao ?? null,
      })),
    perguntasEsclarecimento: Array.isArray(raw.perguntasEsclarecimento)
      ? raw.perguntasEsclarecimento.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}
