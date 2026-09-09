// ─────────────────────────────────────────
// QuitaZAP — Follow-up automático de lead
// POST /api/cron/lead-followup
//
// DESATIVADA (09/09/2026): decisão do Ibrahim depois do incidente de spam —
// "não podemos mais mandar mensagem pra ninguém, quem tem que chegar são
// eles no nosso bot". Essa rota mandava uma mensagem de reengajamento por
// iniciativa nossa (sem o lead ter escrito nada), 4h depois da oferta —
// exatamente o tipo de contato "a frio" que o WhatsApp pode marcar como
// spam. Agora só responde quem manda mensagem primeiro (ver
// processarLeadVendas em sales-bot.ts, que continua ativo).
// ─────────────────────────────────────────

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, skipped: true, motivo: "follow-up proativo desativado (09/09/2026)" });
}
