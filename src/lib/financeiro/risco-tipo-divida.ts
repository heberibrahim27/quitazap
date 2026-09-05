// ─────────────────────────────────────────
// QuitaZAP Controle — Peso de risco por tipo de dívida
// ─────────────────────────────────────────
// Decisão de produto (default alinhado entre Ibrahim/ChatGPT em
// 2026-09-05, pode ser ajustado depois): moradia/serviços essenciais >
// cartão de crédito (risco de bloqueio) > empréstimo/consignado > outros.
//
// Limitação conhecida, documentada de propósito: "OUTRO" é usado tanto
// pra contas recorrentes de casa (água/luz/internet — ver comentário em
// ai-bot.ts sobre registrar essas contas em Divida com tipo "OUTRO" pra
// ativar lembretes) quanto pra qualquer dívida genérica sem categoria
// melhor. Não dá pra distinguir as duas só pelo tipo hoje — fica em
// risco MÉDIO (nem crítico, nem baixo) até existir uma categoria própria
// pra conta de casa recorrente.

export type NivelRisco = "CRITICO" | "ALTO" | "MEDIO" | "BAIXO";

const PESO_NIVEL: Record<NivelRisco, number> = { CRITICO: 4, ALTO: 3, MEDIO: 2, BAIXO: 1 };

const RISCO_POR_TIPO: Record<string, NivelRisco> = {
  ALUGUEL: "CRITICO",
  IMPOSTO: "CRITICO",
  CARTAO: "ALTO",
  CHEQUE_ESPECIAL: "ALTO",
  EMPRESTIMO: "MEDIO",
  FINANCIAMENTO: "MEDIO",
  CONSIGNADO: "MEDIO",
  CREDIARIO: "MEDIO",
  LOJA: "BAIXO",
  ASSOCIACAO: "BAIXO",
  OUTRO: "MEDIO",
};

export function nivelRiscoPorTipo(tipo: string): NivelRisco {
  return RISCO_POR_TIPO[tipo] ?? "MEDIO";
}

export function pesoRisco(tipo: string): number {
  return PESO_NIVEL[nivelRiscoPorTipo(tipo)];
}

export function riscoCritico(tipo: string): boolean {
  const nivel = nivelRiscoPorTipo(tipo);
  return nivel === "CRITICO" || nivel === "ALTO";
}
