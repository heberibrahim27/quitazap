// ─────────────────────────────────────────
// QuitaZAP — Token mágico para painel /cobrador
// HMAC-SHA256(clienteId, secret) → hex[0..31]
// Não expira; não precisa de banco de dados.
// ─────────────────────────────────────────

import { createHmac } from "crypto";

// Falha fechado: sem nenhuma das env vars configuradas, lança erro em vez
// de cair num valor fixo conhecido publicamente no código-fonte (achado de
// auditoria — o fallback hardcoded permitia forjar token de cliente/painel
// do Cobrador só lendo o repositório).
function getSecret(): string {
  const secret =
    process.env.COBRADOR_TOKEN_SECRET ??
    process.env.CRON_SECRET ??
    process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Nenhuma env var de secret configurada para o Cobrador (COBRADOR_TOKEN_SECRET / CRON_SECRET / NEXTAUTH_SECRET)."
    );
  }
  return secret;
}

/** Gera token para um clienteId. */
export function gerarTokenCobrador(clienteId: string): string {
  return createHmac("sha256", getSecret())
    .update(clienteId)
    .digest("hex")
    .slice(0, 32);
}

/** Verifica se token é válido para este clienteId. */
export function verificarTokenCobrador(clienteId: string, token: string): boolean {
  if (!clienteId || !token) return false;
  const esperado = gerarTokenCobrador(clienteId);
  // Comparação constante para evitar timing attacks
  if (esperado.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) {
    diff |= esperado.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}

/** Monta a URL completa do painel de um cliente. */
export function urlPainelCobrador(clienteId: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://www.quitazap.com.br";
  const token = gerarTokenCobrador(clienteId);
  return `${base}/cobrador?id=${clienteId}&token=${token}`;
}
