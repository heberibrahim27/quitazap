// ─────────────────────────────────────────
// QuitaZAP — Diagnóstico: chave OpenAI configurada em produção?
// GET /api/diagnostico/ia
// ─────────────────────────────────────────
// Rota protegida pelo cookie de admin (middleware — não está na lista de
// rotas públicas). Existe só pra confirmar de fora se OPENAI_API_KEY está
// configurada em produção sem precisar de acesso ao painel de variáveis de
// ambiente do Vercel, que esta sessão não tem. NUNCA retorna a chave em si
// — só booleanos — e não loga nada.

import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  const configurada = !!apiKey && !apiKey.startsWith("sk-proj-SUA");

  return NextResponse.json({
    openaiApiKeyPresente: !!apiKey,
    openaiApiKeyPareceValida: configurada,
    modeloSalesBot: process.env.OPENAI_SALES_BOT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini (padrão)",
  });
}
