// ─────────────────────────────────────────
// QuitaZAP — Chat nativo: envio de ARQUIVO de fatura (OFX/CSV exportado do banco)
// POST /api/minha-conta/chat/arquivo — leitura por regra (sem IA quando o formato
// é conhecido), mesma prévia e mesma confirmação do print de fatura. Nunca grava
// nada sozinho: só guarda o pendente até o cliente confirmar.
// clienteId sempre vem do cookie de sessão, nunca do corpo da requisição.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { processarArquivoFatura, MENSAGEM_ARQUIVO_NAO_RECONHECIDO, MENSAGEM_ARQUIVO_SEM_CARTAO } from "@/lib/ai/fatura-arquivo";
import { registrarPreviaFaturaNoChat, responderNoChat } from "@/lib/fatura-previa-chat";

const TAMANHO_MAX_BYTES = 2 * 1024 * 1024; // fatura exportada tem poucos KB

export async function POST(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

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
      return NextResponse.json({ error: "Arquivo muito grande (máx. 2MB)." }, { status: 400 });
    }
    arquivo = campo;
  } catch {
    return NextResponse.json({ error: "Não consegui ler o arquivo enviado." }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
      return NextResponse.json(await responderNoChat(clienteId, "Por aqui eu leio fatura em OFX ou CSV, ou print. O PDF você pode mandar pelo WhatsApp."));
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
