// ─────────────────────────────────────────
// QuitaZAP — API de teste do bot de IA
// POST /api/test/bot-chat
// Chama processarMensagemIA diretamente (sem WhatsApp)
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { processarMensagemIA, type Mensagem } from "@/lib/ai-bot";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !process.env.ENABLE_TEST_ROUTES) {
    return NextResponse.json({ error: "Rota de teste desabilitada em produção" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const mensagem: string = body.mensagem ?? "";
    const historico: Mensagem[] = body.historico ?? [];
    const nome: string = body.nome ?? "Ibrahim";

    if (!mensagem.trim()) {
      return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
    }

    const resultado = await processarMensagemIA(historico, mensagem, nome, null, true);
    return NextResponse.json(resultado);
  } catch (err) {
    console.error("[TEST/BOT-CHAT]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
