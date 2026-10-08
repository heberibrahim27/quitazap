// Regra pura (sem banco) de "assinatura vencida" — IDÊNTICA à do webhook do WhatsApp:
// cortesia (`gratuito`) e conta de teste (`isTeste`) nunca bloqueiam; sem data de vencimento não
// bloqueia; vencida bloqueia. Usada pelo layout do app e pelas rotas de API (assinatura-acesso.ts).

export interface ClienteParaAssinatura {
  gratuito: boolean;
  isTeste?: boolean | null;
  assinaturaVenceEm: Date | null;
}

export function assinaturaVencida(c: ClienteParaAssinatura, agora: Date = new Date()): boolean {
  if (c.gratuito || c.isTeste) return false;
  return c.assinaturaVenceEm != null && c.assinaturaVenceEm.getTime() < agora.getTime();
}

export const MENSAGEM_ASSINATURA_VENCIDA =
  "Sua assinatura do QuitaZAP venceu. Renove pelo link para voltar a usar — seus dados continuam guardados.";
