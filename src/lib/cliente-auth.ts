// ─────────────────────────────────────────
// QuitaZAP Controle — Login do Cliente (telefone + senha)
// Reaproveita o mesmo princípio de src/lib/cobrador-token.ts e
// src/lib/auth-jwt.ts: sessão é um token assinado por HMAC, sem nada
// guardado no banco além do hash da senha. O tipo ("cliente-sessao") entra
// na própria assinatura pra um token desse fluxo nunca ser aceito por outro,
// mesmo usando o mesmo segredo.
//
// Antes disso o acesso era por link mandado no WhatsApp — trocado porque
// depende do Z-API estar conectado (não está). Login agora é direto na tela,
// com telefone + senha; a senha é definida pelo fundador em
// /clientes/[id]/editar (src/app/api/clientes/[id]/senha/route.ts).
// ─────────────────────────────────────────

import { createHmac, timingSafeEqual } from "crypto";
import { hashSync, compareSync } from "bcryptjs";

// Sem fallback pra segredo público: um segredo previsível permitiria forjar
// sessão de qualquer cliente. Falha alto e cedo (erro claro só nas rotas de
// /minha-conta, não derruba o resto do site) em vez de aceitar silenciosamente
// um segredo conhecido.
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

/** Cookie de sessão do cliente, criado depois de um login bem-sucedido. Válido por 30 dias. */
export function criarSessaoCliente(clienteId: string): string {
  return criarToken("cliente-sessao", clienteId);
}

export function verificarSessaoCliente(token: string): string | null {
  return verificarToken("cliente-sessao", token, VALIDADE_SESSAO_MS);
}

// ── Senha do cliente ──────────────────────

export function hashSenhaCliente(senha: string): string {
  return hashSync(senha, 12);
}

// Hash "morto" pré-computado (senha aleatória, sem nenhum uso real), só pra
// gastar o mesmo tempo de bcrypt quando o cliente não tem senha definida
// ainda — sem isso, essa checagem seria bem mais rápida do que a de um
// cliente que tem senha e errou, o que já foi achado de auditoria uma vez
// neste projeto (vazamento de tempo de resposta no login por link).
const HASH_MORTO = "$2b$12$5BjfCAmizRfAUWkqkKYQgeUHU4GxnzbqYKR7fZCzLae3jxHvVbyBS";

/** Compara em tempo (aproximadamente) constante, mesmo quando `hash` é nulo. */
export function verificarSenhaCliente(senhaDigitada: string, hash: string | null): boolean {
  if (!hash) {
    compareSync(senhaDigitada, HASH_MORTO);
    return false;
  }
  return compareSync(senhaDigitada, hash);
}
