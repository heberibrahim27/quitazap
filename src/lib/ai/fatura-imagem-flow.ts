// Porta única dos dois canais (chat nativo e WhatsApp) pra PRINT de fatura:
// leitura em alta resolução → hash anti-reenvio → montagem do pendente com
// deduplicação (mesmo motor do PDF). Nunca grava dívida — quem chama guarda
// o pendente em BotSessao.faturaCartaoPendente e pede confirmação.

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { analisarImagem, type TelemetriaIA } from "@/lib/ai/openai-client";
import { PROMPT_FATURA_IMAGEM, interpretarDocumentoImagem, interpretarFaturaImagem } from "@/lib/ai/fatura-imagem";
import { emprestimoJaCadastrado } from "@/lib/emprestimo-previa";
import type { EmprestimoDetectado } from "@/lib/emprestimo-imagem";
import { montarFaturaCartaoPendente, type FaturaCartaoPendente } from "@/lib/fatura-cartao-flow";

/** Texto da primeira leitura indica fatura de cartão? (gatilho barato antes da 2ª leitura) */
export function pareceFaturaCartao(texto: string): boolean {
  return /fatura|cart[aã]o|parcela|vencimento|nubank|inter|c6/i.test(texto);
}

export type ResultadoPrintFatura =
  | { tipo: "nao_fatura" }
  | { tipo: "ja_processada" }
  | { tipo: "pendente"; pendente: FaturaCartaoPendente }
  | { tipo: "emprestimo"; emprestimo: EmprestimoDetectado }
  | { tipo: "emprestimo_ja_cadastrado"; credor: string };

export async function processarPrintFatura(opts: {
  clienteId: string;
  /** URL pública ou data URL da imagem, como aceita pela visão. */
  imagem: string;
  bytes: Buffer;
  telemetria: TelemetriaIA;
}): Promise<ResultadoPrintFatura> {
  const json = await analisarImagem(opts.imagem, PROMPT_FATURA_IMAGEM, opts.telemetria, {
    detail: "high",
    maxTokens: 6000,
    json: true,
  });
  // Empréstimo (tela do app com parcelas pagas/agendadas) — lançado como empréstimo.
  const doc = interpretarDocumentoImagem(json);
  if (doc?.tipo === "EMPRESTIMO") {
    if (await emprestimoJaCadastrado(opts.clienteId, doc.emprestimo)) {
      return { tipo: "emprestimo_ja_cadastrado", credor: doc.emprestimo.credor };
    }
    return { tipo: "emprestimo", emprestimo: doc.emprestimo };
  }

  const fatura = await interpretarComEmissorDoCliente(json, opts.clienteId);
  if (!fatura) return { tipo: "nao_fatura" };

  const hash = crypto.createHash("sha256").update(opts.bytes).digest("hex");
  // Print reenviado NÃO é bloqueado pelo hash (diferente do PDF): a
  // deduplicação por compra/parcelamento já evita duplicar, e o cliente
  // pode reenviar depois de uma leitura incompleta.

  return { tipo: "pendente", pendente: await montarFaturaCartaoPendente(opts.clienteId, hash, fatura) };
}

/** Print de app costuma não mostrar o nome do banco. Sem emissor na leitura,
 * usa o cartão do cliente quando ele só tem um — nunca chuta entre vários. */
async function interpretarComEmissorDoCliente(json: string, clienteId: string) {
  const direto = interpretarFaturaImagem(json);
  if (direto) return direto;
  const semEmissor = interpretarFaturaImagem(json, "__sem_emissor__");
  if (!semEmissor) return null;
  const cartoes = await prisma.cartao.findMany({ where: { clienteId }, select: { nome: true }, take: 2 });
  if (cartoes.length !== 1) return null;
  return { ...semEmissor, emissor: cartoes[0].nome };
}
