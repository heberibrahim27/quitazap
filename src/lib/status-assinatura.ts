// ─────────────────────────────────────────
// QuitaZAP Admin — Status de assinatura do cliente (gestão financeira)
// ─────────────────────────────────────────
// Decisão de escopo do admin (Ibrahim, 2026-09-05): o painel de clientes
// serve só pra gestão de conta/assinatura do SaaS — nome, WhatsApp,
// plano e status de pagamento. Nada de dívida/renda/despesa pessoal do
// cliente aparece mais em nenhuma tela daqui. Este é o único "status"
// que o admin mostra agora, substituindo o antigo funil de negociação
// de dívida (Cliente.statusAtendimento).
//
// Não existe coluna própria pra isso — é computado a partir de dois
// campos que já existiam (Cliente.gratuito e Cliente.assinaturaVenceEm),
// os mesmos já usados pelo DRE em financeiro-admin/motor.ts.

export type StatusAssinatura = "PAGO" | "CANCELADO" | "INATIVO";

export const LABEL_STATUS_ASSINATURA: Record<StatusAssinatura, string> = {
  PAGO: "Pago",
  CANCELADO: "Cancelado",
  INATIVO: "Inativo",
};

export const COR_STATUS_ASSINATURA: Record<StatusAssinatura, { bg: string; color: string; border: string }> = {
  PAGO: { bg: "rgba(16,185,129,0.12)", color: "#6ee7b7", border: "rgba(16,185,129,0.25)" },
  CANCELADO: { bg: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "rgba(239,68,68,0.25)" },
  INATIVO: { bg: "rgba(255,255,255,0.06)", color: "#9ca3af", border: "rgba(255,255,255,0.12)" },
};

/** Versão parametrizada por instante — usada pra reconstruir status
 * histórico (ex: "estava pago no fim de julho?") sem duplicar a regra.
 * calcularStatusAssinatura (abaixo) é só esta função fixada em "agora". */
export function calcularStatusAssinaturaEm(
  cliente: { gratuito: boolean; assinaturaVenceEm: Date | null },
  instante: Date
): StatusAssinatura {
  if (cliente.gratuito) return "INATIVO";
  if (cliente.assinaturaVenceEm && cliente.assinaturaVenceEm < instante) return "CANCELADO";
  return "PAGO";
}

export function calcularStatusAssinatura(cliente: { gratuito: boolean; assinaturaVenceEm: Date | null }): StatusAssinatura {
  return calcularStatusAssinaturaEm(cliente, new Date());
}

/** Cláusula `where` do Prisma equivalente a `calcularStatusAssinatura`, pra
 * filtrar direto no banco (ver /assinaturas) em vez de buscar tudo e
 * filtrar em memória.
 *
 * PAGO nunca inclui cliente marcado `isTeste` (Ibrahim, 2026-09-06) — um
 * cadastro de teste interno (ex: assinatura de teste com familiar/equipe,
 * sem pagamento real na Cakto) nunca deve contar como assinante pagante em
 * nenhum contador do admin, mesmo com `gratuito=false` e assinatura
 * "ativa" no cadastro. Não filtra em CANCELADO/INATIVO — um cadastro de
 * teste ainda aparece no histórico quando alguém filtra por esses status,
 * só nunca conta como PAGO. */
export function whereStatusAssinatura(status: StatusAssinatura) {
  const hoje = new Date();
  if (status === "INATIVO") return { gratuito: true };
  if (status === "CANCELADO") return { gratuito: false, assinaturaVenceEm: { lt: hoje } };
  return { gratuito: false, isTeste: false, OR: [{ assinaturaVenceEm: null }, { assinaturaVenceEm: { gte: hoje } }] };
}
