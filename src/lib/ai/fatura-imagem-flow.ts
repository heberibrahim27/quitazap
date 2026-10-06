// Porta única dos dois canais (chat nativo e WhatsApp) pra PRINT de fatura:
// leitura em alta resolução → hash anti-reenvio → montagem do pendente com
// deduplicação (mesmo motor do PDF). Nunca grava dívida — quem chama guarda
// o pendente em BotSessao.faturaCartaoPendente e pede confirmação.

import crypto from "crypto";
import { analisarImagem, type TelemetriaIA } from "@/lib/ai/openai-client";
import { PROMPT_FATURA_IMAGEM, interpretarFaturaImagem } from "@/lib/ai/fatura-imagem";
import { montarFaturaCartaoPendente, type FaturaCartaoPendente } from "@/lib/fatura-cartao-flow";

/** Texto da primeira leitura indica fatura de cartão? (gatilho barato antes da 2ª leitura) */
export function pareceFaturaCartao(texto: string): boolean {
  return /fatura|cart[aã]o|parcela|vencimento|nubank|inter|c6/i.test(texto);
}

export type ResultadoPrintFatura =
  | { tipo: "nao_fatura" }
  | { tipo: "ja_processada" }
  | { tipo: "pendente"; pendente: FaturaCartaoPendente };

export async function processarPrintFatura(opts: {
  clienteId: string;
  /** URL pública ou data URL da imagem, como aceita pela visão. */
  imagem: string;
  bytes: Buffer;
  telemetria: TelemetriaIA;
}): Promise<ResultadoPrintFatura> {
  const json = await analisarImagem(opts.imagem, PROMPT_FATURA_IMAGEM, opts.telemetria, {
    detail: "high",
    maxTokens: 2500,
    json: true,
  });
  const fatura = interpretarFaturaImagem(json);
  if (!fatura) return { tipo: "nao_fatura" };

  const hash = crypto.createHash("sha256").update(opts.bytes).digest("hex");
  // Print reenviado NÃO é bloqueado pelo hash (diferente do PDF): a
  // deduplicação por compra/parcelamento já evita duplicar, e o cliente
  // pode reenviar depois de uma leitura incompleta.

  return { tipo: "pendente", pendente: await montarFaturaCartaoPendente(opts.clienteId, hash, fatura) };
}
