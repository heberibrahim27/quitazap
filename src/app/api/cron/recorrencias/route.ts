// ─────────────────────────────────────────
// QuitaZAP Controle — Cron: lançamentos recorrentes
// GET /api/cron/recorrencias (1x por dia)
//
// Cria a ocorrência do mês de cada receita/despesa marcada como "repete todo
// mês" quando o dia chega. Regras em src/lib/financeiro/recorrencia.ts.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { gerarRecorrenciasPendentes } from "@/lib/financeiro/recorrencia-service";
import { registrarExecucaoAgente } from "@/lib/agentes/alertas-store";

export async function GET(req: NextRequest) {
  // Mesmo padrão de autenticação dos demais crons (lembretes, tarefas).
  const isInternal = req.headers.get("x-internal-call") === "1";
  if (!isInternal) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      console.error("[CRON RECORRENCIAS] CRON_SECRET não configurado — recusando chamada externa.");
      return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
    }
  }

  const iniciadoEm = new Date();
  try {
    // ?clienteId= restringe a UM cliente (ensaio/QA) — sem ele roda pra todos.
    const clienteId = req.nextUrl.searchParams.get("clienteId") ?? undefined;
    const resultado = await gerarRecorrenciasPendentes(new Date(), clienteId);
    await registrarExecucaoAgente({
      agente: "recorrencias",
      iniciadoEm,
      terminadoEm: new Date(),
      clientesAvaliados: resultado.fontesAvaliadas,
      acoes: resultado.criados,
      puladas: resultado.jaExistiam,
      erros: [],
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("[CRON RECORRENCIAS] Erro:", err);
    await registrarExecucaoAgente({
      agente: "recorrencias",
      iniciadoEm,
      terminadoEm: new Date(),
      clientesAvaliados: 0,
      acoes: 0,
      erros: [err instanceof Error ? err.message : String(err)],
    });
    return NextResponse.json({ ok: false, error: "Falha ao gerar recorrências" }, { status: 500 });
  }
}
