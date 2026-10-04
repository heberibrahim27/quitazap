// ─────────────────────────────────────────
// QuitaZAP Controle — Link de primeiro acesso / redefinição de senha
// ─────────────────────────────────────────
// Cliente que compra pela Cakto nasce sem senha, e antes só o fundador podia
// defini-la (/clientes/[id]/editar) — venda não escalava. Este link permite
// que o próprio cliente crie a senha, sem tabela nova no banco:
//
// - token assinado por HMAC (mesmo segredo de cliente-auth.ts, tipo próprio
//   "primeiro-acesso" no payload — nunca vale como sessão nem vice-versa);
// - expira em 7 dias;
// - amarrado ao estado atual da senha do cliente: o payload carrega uma
//   impressão curta do senhaHash ("sem-senha" enquanto não existe). Depois
//   que a senha é criada/trocada, a impressão muda e o link morre sozinho —
//   uso único na prática, sem precisar guardar nada.
//
// Nunca vai telefone nem dado financeiro na URL, só o token opaco.

import { createHash, timingSafeEqual } from "crypto";
import { assinarPayloadCliente } from "./cliente-auth";

export const VALIDADE_PRIMEIRO_ACESSO_MS = 7 * 24 * 60 * 60 * 1000;
export const TAMANHO_MIN_SENHA = 8;
// bcrypt só considera os 72 primeiros bytes — acima disso a senha seria
// silenciosamente truncada.
export const TAMANHO_MAX_SENHA = 72;

const TIPO = "primeiro-acesso";

function impressaoDaSenha(senhaHash: string | null): string {
  if (!senhaHash) return "sem-senha";
  return createHash("sha256").update(senhaHash).digest("hex").slice(0, 12);
}

export function gerarTokenPrimeiroAcesso(
  clienteId: string,
  senhaHash: string | null,
  agora: number = Date.now()
): string {
  const payload = `${TIPO}:${clienteId}:${agora}:${impressaoDaSenha(senhaHash)}`;
  const sig = assinarPayloadCliente(payload);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

type TokenLido = { clienteId: string; timestamp: number; impressao: string; payload: string; sig: string };

function lerToken(token: string): TokenLido | null {
  try {
    const partes = Buffer.from(token, "base64url").toString("utf-8").split(":");
    if (partes.length !== 5) return null;
    const [tipo, clienteId, ts, impressao, sig] = partes;
    if (tipo !== TIPO || !clienteId || !impressao || !sig) return null;
    const timestamp = parseInt(ts, 10);
    if (isNaN(timestamp)) return null;
    return { clienteId, timestamp, impressao, payload: `${tipo}:${clienteId}:${ts}:${impressao}`, sig };
  } catch {
    return null;
  }
}

/**
 * Passo 1: descobrir de qual cliente é o token, SEM confiar nele ainda — só
 * serve pra buscar o cliente no banco e então chamar
 * `verificarTokenPrimeiroAcesso` com o senhaHash atual.
 */
export function clienteIdDoTokenPrimeiroAcesso(token: string): string | null {
  return lerToken(token)?.clienteId ?? null;
}

export type ResultadoToken = "ok" | "invalido" | "expirado" | "ja-usado";

/** Passo 2: validação de verdade (assinatura, validade e senha ainda inalterada). */
export function verificarTokenPrimeiroAcesso(
  token: string,
  clienteId: string,
  senhaHashAtual: string | null,
  agora: number = Date.now()
): ResultadoToken {
  const lido = lerToken(token);
  if (!lido || lido.clienteId !== clienteId) return "invalido";

  const esperado = assinarPayloadCliente(lido.payload);
  if (lido.sig.length !== esperado.length || !timingSafeEqual(Buffer.from(lido.sig), Buffer.from(esperado))) {
    return "invalido";
  }

  if (agora - lido.timestamp > VALIDADE_PRIMEIRO_ACESSO_MS) return "expirado";
  if (lido.impressao !== impressaoDaSenha(senhaHashAtual)) return "ja-usado";
  return "ok";
}

export function urlPrimeiroAcesso(clienteId: string, senhaHash: string | null): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://www.quitazap.com.br";
  return `${base}/minha-conta/primeiro-acesso?t=${gerarTokenPrimeiroAcesso(clienteId, senhaHash)}`;
}

const PEDIDO_LINK_ACESSO =
  /^(esqueci|perdi)( a| minha| de)? ?senha|^(redefinir|recuperar|trocar|alterar|criar|nova)( a| minha| uma)? ?senha|^(meu )?link de acesso|^(link|acesso) (do|ao|pro|para o) (site|app)|^como (acesso|entro) (no|o) (site|app)/;

/**
 * Mensagem de WhatsApp pedindo o link de acesso/senha do site. Ancorada no
 * começo da frase de propósito: "gastei 50 e esqueci a senha do wifi" não
 * pode disparar nada.
 */
export function pareceEsqueciSenha(mensagem: string): boolean {
  const m = mensagem
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  return PEDIDO_LINK_ACESSO.test(m);
}

/** Regra única de senha — usada pela API e pela tela. Devolve a mensagem de erro, ou null se válida. */
export function validarNovaSenha(senha: string): string | null {
  if (senha.length < TAMANHO_MIN_SENHA) return `A senha precisa ter pelo menos ${TAMANHO_MIN_SENHA} caracteres.`;
  if (Buffer.byteLength(senha, "utf-8") > TAMANHO_MAX_SENHA) return "A senha é longa demais (máximo 72 caracteres).";
  return null;
}
