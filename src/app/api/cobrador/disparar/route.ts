// ─────────────────────────────────────────
// QuitaZAP — Disparo manual de cobranças
// POST /api/cobrador/disparar
// Usado pelo painel admin (fetch same-origin em src/app/cobrador/page.tsx)
// ─────────────────────────────────────────
//
// "/api" fica fora da checagem do middleware.ts de propósito (webhooks
// públicos precisam responder sem cookie de admin) — por isso essa rota
// precisa da própria checagem, já que ela dispara cobrança real via
// WhatsApp pra todos os devedores elegíveis (achado de auditoria: estava
// sem nenhuma autenticação, qualquer POST externo disparava a régua).

import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export async function POST(req: NextRequest) {
  if (req.cookies.get(COOKIE_NAME)?.value !== COOKIE_TOKEN) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

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
