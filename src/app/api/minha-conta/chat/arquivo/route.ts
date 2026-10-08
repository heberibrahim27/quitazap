// ─────────────────────────────────────────
// QuitaZAP — Chat nativo: envio de ARQUIVO de fatura (OFX/CSV exportado do banco)
// POST /api/minha-conta/chat/arquivo — leitura por regra (sem IA quando o formato
// é conhecido), mesma prévia e mesma confirmação do print de fatura. Nunca grava
// nada sozinho: só guarda o pendente até o cliente confirmar.
// clienteId sempre vem do cookie de sessão, nunca do corpo da requisição.
// ─────────────────────────────────────────

import { respostaSeAssinaturaVencida } from "@/lib/assinatura-acesso";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterOuCriarSessaoControle } from "@/lib/controle-orquestrador";
import { extrairPDFBytes } from "@/lib/ai/extrair-pdf";
import { pendenteDeFaturaPdf } from "@/lib/ai/fatura-pdf";
import { boletoValido, type BoletoDetectado } from "@/lib/boleto-flow";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { processarArquivoFatura, MENSAGEM_ARQUIVO_NAO_RECONHECIDO, MENSAGEM_ARQUIVO_SEM_CARTAO } from "@/lib/ai/fatura-arquivo";
import { registrarPreviaFaturaNoChat, responderNoChat } from "@/lib/fatura-previa-chat";

// Leitura de PDF por IA pode passar de 10s.
export const maxDuration = 60;

const TAMANHO_MAX_BYTES = 8 * 1024 * 1024; // OFX/CSV têm poucos KB; PDF de fatura pode ter alguns MB

// PDF: mesmo leitor do WhatsApp (extrairPDFBytes) — fatura de cartão e boleto, sempre com
// prévia e confirmação. Contracheque segue pausado (mesmo motivo do WhatsApp).
async function tratarPdf(
  cliente: Parameters<typeof obterOuCriarSessaoControle>[0],
  bytes: Buffer
): Promise<{ resposta: string; dadosEstruturados?: unknown }> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const resultado = await extrairPDFBytes(buffer);

  if (resultado.tipo === "BOLETO") {
    const boleto: BoletoDetectado = {
      beneficiario: resultado.beneficiario,
      valor: resultado.valor,
      vencimento: resultado.vencimento,
      linhaDigitavel: resultado.linhaDigitavel,
    };
    if (boletoValido(boleto)) {
      const sessao = await obterOuCriarSessaoControle(cliente);
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: { boletoPendente: boleto as unknown as object },
      });
      return responderNoChat(cliente.id, "Encontrei um boleto no PDF. Confere e confirma?", { tipo: "boleto_detectado", ...boleto });
    }
  }

  if (resultado.tipo === "FATURA_CARTAO") {
    const pendente = await pendenteDeFaturaPdf(cliente.id, resultado, bytes);
    if (pendente) return registrarPreviaFaturaNoChat(cliente, pendente);
  }

  return responderNoChat(
    cliente.id,
    "Recebi o PDF, mas não consegui ler os dados com segurança. Se for fatura de cartão, tenta exportar em OFX ou CSV pelo app do banco, ou me manda um print. Se for outra coisa, me conta por texto que eu registro."
  );
}

export async function POST(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();
  // Assinatura vencida/reembolsada/cancelada: sem acesso (mesma regra do WhatsApp).
  const bloqueioAssinatura = await respostaSeAssinaturaVencida(clienteId);
  if (bloqueioAssinatura) return bloqueioAssinatura;

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, telefone: true, nome: true, gratuito: true },
  });
  if (!cliente) return erroClienteNaoAutenticado();

  let arquivo: File;
  try {
    const campo = (await req.formData()).get("arquivo");
    if (!(campo instanceof File) || campo.size === 0) {
      return NextResponse.json({ error: "Selecione um arquivo." }, { status: 400 });
    }
    if (campo.size > TAMANHO_MAX_BYTES) {
      return NextResponse.json({ error: "Arquivo muito grande (máx. 8MB)." }, { status: 400 });
    }
    arquivo = campo;
  } catch {
    return NextResponse.json({ error: "Não consegui ler o arquivo enviado." }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
      return NextResponse.json(await tratarPdf(cliente, bytes));
    }

    const lido = await processarArquivoFatura({ clienteId, gratuito: cliente.gratuito, nomeArquivo: arquivo.name, bytes });
    if (lido.tipo === "nao_fatura") return NextResponse.json(await responderNoChat(clienteId, MENSAGEM_ARQUIVO_NAO_RECONHECIDO));
    if (lido.tipo === "sem_emissor") return NextResponse.json(await responderNoChat(clienteId, MENSAGEM_ARQUIVO_SEM_CARTAO));

    return NextResponse.json(await registrarPreviaFaturaNoChat(cliente, lido.pendente));
  } catch (err) {
    console.error("[CHAT-ARQUIVO] Erro ao processar arquivo:", err);
    return NextResponse.json({ error: "Não consegui processar o arquivo agora. Tenta de novo em instantes." }, { status: 500 });
  }
}
