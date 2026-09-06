// ─────────────────────────────────────────
// QuitaZAP — Diagnóstico: chave OpenAI configurada em produção?
// GET /api/diagnostico/ia
// ─────────────────────────────────────────
// Existe só pra confirmar, uma única vez, se OPENAI_API_KEY está
// configurada em produção, sem precisar de acesso ao painel de variáveis
// de ambiente do Vercel. NUNCA retorna a chave em si — só booleanos — e
// não loga nada. REMOVER esta rota depois de confirmado (não é uma
// feature, é uma pergunta de diagnóstico que só precisa ser respondida
// uma vez): acesse logado no admin (cookie de sessão já presente) em
// /api/diagnostico/ia.
//
// "/api" fica fora da checagem do middleware.ts de propósito (webhooks
// públicos como Z-API/Cakto precisam responder sem cookie de admin) —
// então toda rota sob /api que expõe qualquer dado precisa da própria
// checagem (mesmo padrão de src/app/api/exportar/route.ts).
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export async function GET(req: NextRequest) {
  if (req.cookies.get(COOKIE_NAME)?.value !== COOKIE_TOKEN) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const configurada = !!apiKey && !apiKey.startsWith("sk-proj-SUA");

  return NextResponse.json({
    openaiApiKeyPresente: !!apiKey,
    openaiApiKeyPareceValida: configurada,
    modeloSalesBot: process.env.OPENAI_SALES_BOT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini (padrão)",
  });
}
