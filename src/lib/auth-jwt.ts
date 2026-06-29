// ─────────────────────────────────────────
// QuitaZAP — Auth JWT (crypto nativo)
// Token = base64url(usuarioId:timestamp:hmac)
// Válido por 30 dias
// ─────────────────────────────────────────

import { createHmac, timingSafeEqual } from "crypto";

const SECRET =
  process.env.NEXTAUTH_SECRET ??
  process.env.CRON_SECRET ??
  "quitazap-receber-secret-2024";

export function criarToken(usuarioId: string): string {
  const payload = `${usuarioId}:${Date.now()}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verificarToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon === -1) return null;

    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const colonIdx = payload.indexOf(":");
    if (colonIdx === -1) return null;

    const usuarioId = payload.slice(0, colonIdx);
    const timestamp = parseInt(payload.slice(colonIdx + 1), 10);
    if (isNaN(timestamp)) return null;

    // Verifica assinatura
    const expectedSig = createHmac("sha256", SECRET).update(payload).digest("hex");
    if (
      sig.length !== expectedSig.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
    )
      return null;

    // Expira em 30 dias
    if (Date.now() - timestamp > 30 * 24 * 60 * 60 * 1000) return null;

    return usuarioId;
  } catch {
    return null;
  }
}

/** Renova token se estiver próximo de expirar (< 7 dias restantes) */
export function renovarSeNecessario(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const payload = decoded.slice(0, decoded.lastIndexOf(":"));
    const colonIdx = payload.indexOf(":");
    const usuarioId = payload.slice(0, colonIdx);
    const timestamp = parseInt(payload.slice(colonIdx + 1), 10);
    const restante = 30 * 24 * 60 * 60 * 1000 - (Date.now() - timestamp);
    if (restante < 7 * 24 * 60 * 60 * 1000) {
      return criarToken(usuarioId);
    }
    return null; // não precisa renovar
  } catch {
    return null;
  }
}
