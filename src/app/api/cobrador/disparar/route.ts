// ─────────────────────────────────────────
// QuitaZAP — Disparo manual de cobranças
// POST /api/cobrador/disparar
// Chama a mesma lógica do cron sem autenticação
// Usado pelo painel admin
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Chama o cron internamente via fetch para reutilizar toda a lógica
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const res = await fetch(`${baseUrl}/api/cron/cobrador`, {
    method: "GET",
    headers: { "x-internal-call": "1" }, // bypassa o check de CRON_SECRET
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
