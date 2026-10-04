// ─────────────────────────────────────────
// QuitaZAP — Cron do agente Sentinela
// GET /api/cron/sentinela (1x por dia, 08:30 de Brasília = fim do silêncio)
//
// Ciclo observar → decidir → agir em src/lib/agentes/sentinela-service.ts.
// ?dryRun=1 só avalia e devolve as decisões (nada é enviado nem gravado).
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { executarSentinela } from "@/lib/agentes/sentinela-service";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const isInternal = req.headers.get("x-internal-call") === "1";
  if (!isInternal) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      console.error("[CRON SENTINELA] CRON_SECRET não configurado — recusando chamada externa.");
      return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
    }
  }

  try {
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
    // ?clienteId= restringe a UM cliente (ensaio/QA) — sem ele roda pra todos.
    const clienteId = req.nextUrl.searchParams.get("clienteId") ?? undefined;
    // ?agora=ISO só vale junto com ?clienteId= (ensaio de horário/política de UM cliente).
    const agoraParam = req.nextUrl.searchParams.get("agora");
    const agora = clienteId && agoraParam && !Number.isNaN(Date.parse(agoraParam)) ? new Date(agoraParam) : undefined;
    const resultado = await executarSentinela({ dryRun, clienteId, agora });
    return NextResponse.json({
      ok: true,
      dryRun,
      clientesAvaliados: resultado.clientesAvaliados,
      enviados: resultado.enviados,
      erros: resultado.erros,
      // Decisões por cliente só quando o ensaio é de UM cliente (sem PII: ids e chaves).
      ...(clienteId ? { decisoes: resultado.decisoes } : {}),
    });
  } catch (err) {
    console.error("[CRON SENTINELA] Erro:", err);
    return NextResponse.json({ ok: false, error: "Falha ao executar o Sentinela" }, { status: 500 });
  }
}
