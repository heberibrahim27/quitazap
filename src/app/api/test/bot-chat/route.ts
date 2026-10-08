// ─────────────────────────────────────────
// QuitaZAP — API de teste do bot de IA
// POST /api/test/bot-chat
// Chama processarMensagemIA diretamente (sem WhatsApp)
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { processarMensagemIA, type Mensagem } from "@/lib/ai-bot";

export async function POST(req: NextRequest) {
  // Só o painel admin (cookie de login do admin, o mesmo do middleware). Antes o único guard era
  // a env ENABLE_TEST_ROUTES — que está LIGADA em produção, deixando a rota aberta pra qualquer
  // pessoa na internet gastar crédito da OpenAI (achado no QA de 2026-10-08).
  if (req.cookies.get("qz_auth")?.value !== "qz_autenticado") {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
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
