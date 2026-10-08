// Autenticação das rotas /api/cron/*: exige `Authorization: Bearer <CRON_SECRET>` (é o que a
// Vercel Cron envia sozinha quando CRON_SECRET existe no projeto). Falha FECHADO sem segredo.
//
// Antes, cada cron aceitava o cabeçalho `x-internal-call: 1` como "chamada interna" — mas esse
// cabeçalho vem do cliente: qualquer pessoa na internet podia disparar recorrências, consignados,
// cobrador, lembretes etc. em produção (achado no QA de 2026-10-08). Chamada interna legítima
// (painel → cobrador) agora também manda o Bearer.

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export function negarCronNaoAutorizado(req: Request): NextResponse | null {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    console.error("[CRON] CRON_SECRET não configurado — recusando chamada.");
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
  }
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
