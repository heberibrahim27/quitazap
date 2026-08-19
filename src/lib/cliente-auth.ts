// ─────────────────────────────────────────
// QuitaZAP Controle — Login do Cliente (sem senha)
// Reaproveita o mesmo princípio de src/lib/cobrador-token.ts e
// src/lib/auth-jwt.ts: token assinado por HMAC, sem sessão guardada
// no banco. Duas variantes:
//   - Link de acesso: mandado por WhatsApp, válido por 15 minutos.
//   - Sessão: cookie do navegador depois do login, válido por 30 dias.
// O tipo ("cliente-sessao" / "cliente-acesso") entra na própria
// assinatura pra um token de um tipo nunca ser aceito como o outro,
// mesmo usando o mesmo segredo.
// ─────────────────────────────────────────

import { createHmac, timingSafeEqual } from "crypto";

// Sem fallback pra segredo público: diferente de auth-jwt.ts/cobrador-token.ts
// (que têm um literal fixo de fallback, dívida técnica pré-existente e fora
// de escopo aqui), este é login de conta de cliente — um segredo previsível
// permitiria forjar sessão de qualquer cliente. Falha alto e cedo (erro claro
// só nas rotas novas de /minha-conta, não derruba o resto do site) em vez de
// aceitar silenciosamente um segredo conhecido.
function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    throw new Error(
      "NEXTAUTH_SECRET (ou CRON_SECRET) precisa estar configurado pra login de cliente funcionar com segurança."
    );
  }
  return secret;
}

const VALIDADE_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const VALIDADE_ACESSO_MS = 15 * 60 * 1000; // 15 minutos

function assinar(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function criarToken(tipo: string, clienteId: string): string {
  const payload = `${tipo}:${clienteId}:${Date.now()}`;
  const sig = assinar(payload);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verificarToken(tipo: string, token: string, validadeMs: number): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const partes = decoded.split(":");
    if (partes.length !== 4) return null;

    const [tipoLido, clienteId, timestampTexto, sig] = partes;
    if (tipoLido !== tipo || !clienteId) return null;

    const timestamp = parseInt(timestampTexto, 10);
    if (isNaN(timestamp)) return null;

    const payload = `${tipoLido}:${clienteId}:${timestampTexto}`;
    const esperado = assinar(payload);
    if (sig.length !== esperado.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) {
      return null;
    }

    if (Date.now() - timestamp > validadeMs) return null;

    return clienteId;
  } catch {
    return null;
  }
}

/** Cookie de sessão do cliente, criado depois que ele confirma o link de acesso. Válido por 30 dias. */
export function criarSessaoCliente(clienteId: string): string {
  return criarToken("cliente-sessao", clienteId);
}

export function verificarSessaoCliente(token: string): string | null {
  return verificarToken("cliente-sessao", token, VALIDADE_SESSAO_MS);
}

/** Link enviado por WhatsApp pra confirmar o acesso. Válido por só 15 minutos. */
export function criarLinkAcessoCliente(clienteId: string): string {
  return criarToken("cliente-acesso", clienteId);
}

export function verificarLinkAcessoCliente(token: string): string | null {
  return verificarToken("cliente-acesso", token, VALIDADE_ACESSO_MS);
}

/** Monta a URL completa do link de acesso a mandar por WhatsApp. Aponta pra
 * página de confirmação (não pra uma rota que já loga sozinha no GET). */
export function urlLinkAcessoCliente(clienteId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://www.quitazap.com.br";
  const token = criarLinkAcessoCliente(clienteId);
  return `${base}/minha-conta/entrar?token=${token}`;
}
