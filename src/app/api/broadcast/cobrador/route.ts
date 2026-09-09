// ─────────────────────────────────────────
// QuitaZAP — Broadcast: aviso do Cobrador
// POST /api/broadcast/cobrador
//
// DESATIVADA (09/09/2026): decisão do Ibrahim depois do incidente de spam —
// "não podemos mais mandar mensagem pra ninguém, quem tem que chegar são
// eles no nosso bot". Essa rota mandava, por iniciativa nossa, um aviso de
// novidade em massa pra todo cliente ativo (e também aceitava mandar pra
// UM número qualquer via `telefone` no body, sem checar se já tinha
// conversa — o mesmo padrão de risco do /api/test/lead). Desligada por
// inteiro; nenhum envio em massa/proativo continua ativo neste código.
// ─────────────────────────────────────────

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Broadcast desativado — não enviamos mais mensagem por iniciativa nossa (09/09/2026)." },
    { status: 403 }
  );
}

// GET também desativado — só existia pra dar preview de um broadcast que
// não roda mais.
export async function GET() {
  return NextResponse.json(
    { error: "Broadcast desativado — não enviamos mais mensagem por iniciativa nossa (09/09/2026)." },
    { status: 403 }
  );
}
