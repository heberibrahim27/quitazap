// ─────────────────────────────────────────
// QuitaZAP — Chat nativo: envio de nota de voz
// POST /api/minha-conta/chat/audio — recebe o áudio gravado no navegador
// (MediaRecorder), transcreve via Whisper e processa como se o texto
// tivesse sido digitado — mesmo padrão do webhook do WhatsApp, onde áudio
// nunca passa por uma etapa de confirmação separada (ao contrário de foto
// de comprovante, que pode ler valor errado — fala transcrita já vira
// texto normal e cai no mesmo cascade).
//
// clienteId sempre resolvido pelo cookie de sessão — nunca aceito do corpo
// da requisição.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { obterOuCriarSessaoControle, processarMensagemControle } from "@/lib/controle-orquestrador";
import { subirAudioChat } from "@/lib/supabase-storage";
import { transcreverAudioBytes } from "@/lib/ai/openai-client";

const TAMANHO_MAX_BYTES = 15 * 1024 * 1024; // igual ao limite do bucket

export async function POST(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, telefone: true, nome: true, gratuito: true },
  });
  if (!cliente) return erroClienteNaoAutenticado();

  let arquivo: Blob;
  try {
    const formData = await req.formData();
    const campo = formData.get("arquivo");
    if (!(campo instanceof Blob) || campo.size === 0) {
      return NextResponse.json({ error: "Nenhum áudio recebido." }, { status: 400 });
    }
    if (campo.size > TAMANHO_MAX_BYTES) {
      return NextResponse.json({ error: "Áudio muito longo (máx. 15MB)." }, { status: 400 });
    }
    arquivo = campo;
  } catch {
    return NextResponse.json({ error: "Não consegui ler o áudio enviado." }, { status: 400 });
  }

  try {
    const [caminhoStorage, textoTranscrito] = await Promise.all([
      subirAudioChat(clienteId, arquivo),
      transcreverAudioBytes(arquivo, { clienteId, gratuito: cliente.gratuito, skill: "whisper-chat-nativo" }),
    ]);

    if (!textoTranscrito.trim()) {
      const resposta = "Não consegui entender esse áudio. Pode tentar de novo ou digitar?";
      await prisma.mensagemChat.create({ data: { clienteId, canal: "APP", direcao: "BOT", texto: resposta } });
      return NextResponse.json({ resposta });
    }

    // Registra a mensagem do CLIENTE (o texto transcrito) antes de
    // processar — mesmo padrão de /api/minha-conta/chat/mensagem pra
    // mensagem digitada, só que aqui o "texto digitado" é a transcrição.
    await prisma.mensagemChat.create({
      data: { clienteId, canal: "APP", direcao: "CLIENTE", texto: `🎤 ${textoTranscrito}` },
    });

    const sessao = await obterOuCriarSessaoControle(cliente);
    const resultado = await processarMensagemControle({
      cliente,
      sessao,
      mensagem: textoTranscrito,
      origem: "AUDIO",
      comprovanteUrl: caminhoStorage,
    });

    const dadosEstruturados =
      resultado.lancamentosCriados && resultado.lancamentosCriados.length > 0
        ? {
            tipo: "lancamento_criado" as const,
            lancamentos: resultado.lancamentosCriados.map((l) => ({
              id: l.id,
              tipo: l.tipo,
              descricao: l.descricao,
              categoria: l.categoria,
              valor: l.valor,
              data: l.data,
              atualizadoEm: l.atualizadoEm,
            })),
          }
        : resultado.graficoCategoria
          ? resultado.graficoCategoria
          : undefined;

    const resposta = dadosEstruturados?.tipo === "lancamento_criado" ? "Lançamento registrado." : resultado.resposta;

    await prisma.mensagemChat.create({
      data: { clienteId, canal: "APP", direcao: "BOT", texto: resposta, dadosEstruturados },
    });

    return NextResponse.json({ resposta, dadosEstruturados, textoTranscrito });
  } catch (err) {
    console.error("[CHAT-AUDIO] Erro ao processar áudio:", err);
    return NextResponse.json({ error: "Não consegui processar o áudio agora. Tenta de novo em instantes." }, { status: 500 });
  }
}
