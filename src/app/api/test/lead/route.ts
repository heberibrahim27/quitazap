// ─────────────────────────────────────────
// QuitaZAP — API de teste do funil de vendas
// POST /api/test/lead  →  dispara boas-vindas para um número
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { processarLeadVendas } from "@/lib/sales-bot";
import { normalizarTelefone } from "@/lib/zapi";

export async function POST(req: NextRequest) {
  // Bloqueia em produção se não tiver flag de teste
  if (process.env.NODE_ENV === "production" && !process.env.ENABLE_TEST_ROUTES) {
    return NextResponse.json({ error: "Rota de teste desabilitada em produção" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const rawPhone = body.telefone ?? "";
    const telefone = normalizarTelefone(String(rawPhone));

    if (telefone.length < 12) {
      return NextResponse.json({ error: "Número inválido. Use formato: 5511999999999" }, { status: 400 });
    }

    // Dispara o funil para o número (como se fosse uma primeira mensagem)
    await processarLeadVendas(telefone, "oi");

    return NextResponse.json({ ok: true, telefone });
  } catch (err) {
    console.error("[TEST/LEAD]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
