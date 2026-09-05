// ─────────────────────────────────────────
// QuitaZAP Controle — Cron: Insights proativos (modo sombra)
// GET /api/cron/insights-sombra (1x por dia — mesmo padrão dos demais crons)
//
// Prioridade 3 da Skill Analista: detecção 100% determinística (ver
// src/lib/financeiro/deteccao-anomalia.ts) de categoria de gasto do mês
// corrente > 1.3x a média dos últimos 3 meses. Quando dispara, grava um
// InsightDetectado com status "SOMBRA" — NÃO envia nada por WhatsApp/push
// nesta fase; é só pra revisão em /insights-sombra antes de decidir lançar
// de verdade pro cliente.
//
// Upsert por (clienteId, categoria, mes): idempotente entre execuções do
// mesmo mês — a IA só é chamada pra redigir textoGerado na primeira vez que
// aquela combinação dispara; rodadas seguintes do mesmo mês só atualizam os
// números (que podem mudar ao longo do mês), sem gastar IA de novo.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anoMesAtualBrasil, limitesDoMes } from "@/lib/financeiro/motor";
import { detectarAnomaliasCategoria, mesReferenciaStr } from "@/lib/financeiro/deteccao-anomalia";
import { chatCompletion } from "@/lib/ai/openai-client";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function redigirInsight(
  categoria: string,
  totalMesAtual: number,
  mediaUltimosMeses: number,
  multiplicador: number,
  clienteId: string,
): Promise<string> {
  const fallback = `Seu gasto em "${categoria}" este mês (${fmt(totalMesAtual)}) está ${multiplicador.toFixed(1)}x acima da média dos últimos meses (${fmt(mediaUltimosMeses)}).`;
  try {
    const { conteudo } = await chatCompletion({
      model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      mensagens: [
        {
          role: "system",
          content:
            "Você redige um alerta curto (2-3 linhas, português do Brasil, tom direto e amigável, sem soar alarmista) sobre um gasto acima do normal numa categoria financeira. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente.",
        },
        { role: "user", content: JSON.stringify({ categoria, totalMesAtual, mediaUltimosMeses, multiplicador }) },
      ],
      maxTokens: 200,
      telemetria: { clienteId, gratuito: false, skill: "insight-sombra" },
    });
    return conteudo?.trim() || fallback;
  } catch (e) {
    console.error("[CRON INSIGHTS-SOMBRA] Erro ao redigir com IA, usando fallback determinístico:", e);
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  // Mesmo padrão de autenticação dos demais crons (lembretes, cobrador, tarefas).
  const isInternal = req.headers.get("x-internal-call") === "1";
  if (!isInternal) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      // Falha fechado: sem CRON_SECRET configurado, negar chamada externa em
      // vez de deixar passar sem autenticação nenhuma.
      console.error("[CRON INSIGHTS-SOMBRA] CRON_SECRET não configurado — recusando chamada externa.");
      return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
    }
  }

  const agora = new Date();
  const { ano, mes } = anoMesAtualBrasil(agora);
  const periodo = limitesDoMes(ano, mes);
  const mesStr = mesReferenciaStr(agora);

  // Só considera clientes com pelo menos 1 Lancamento no mês corrente — sem
  // isso, detectarAnomaliasCategoria nunca acharia nada mesmo (a anomalia
  // exige totalMesAtual acima do piso mínimo).
  const candidatos = await prisma.lancamento.findMany({
    where: { data: { gte: periodo.inicio, lt: periodo.fim } },
    distinct: ["clienteId"],
    select: { clienteId: true },
  });

  let anomaliasDetectadas = 0;
  let novasNoMes = 0;
  const erros: string[] = [];

  for (const { clienteId } of candidatos) {
    try {
      const anomalias = await detectarAnomaliasCategoria(clienteId, agora);
      for (const a of anomalias) {
        anomaliasDetectadas++;
        const existente = await prisma.insightDetectado.findUnique({
          where: { clienteId_categoria_mes: { clienteId, categoria: a.categoria, mes: mesStr } },
        });

        if (existente) {
          await prisma.insightDetectado.update({
            where: { id: existente.id },
            data: {
              totalMesAtual: a.totalMesAtual,
              mediaUltimosMeses: a.mediaUltimosMeses,
              multiplicador: a.multiplicador,
            },
          });
          continue;
        }

        const textoGerado = await redigirInsight(a.categoria, a.totalMesAtual, a.mediaUltimosMeses, a.multiplicador, clienteId);
        await prisma.insightDetectado.create({
          data: {
            clienteId,
            categoria: a.categoria,
            mes: mesStr,
            totalMesAtual: a.totalMesAtual,
            mediaUltimosMeses: a.mediaUltimosMeses,
            multiplicador: a.multiplicador,
            textoGerado,
            status: "SOMBRA",
          },
        });
        novasNoMes++;
      }
    } catch (err) {
      erros.push(`cliente ${clienteId}: ${err}`);
    }
  }

  const resumo = {
    ok: true,
    rodadoEm: agora.toISOString(),
    clientesAnalisados: candidatos.length,
    anomaliasDetectadas,
    novasNoMes,
    erros: erros.length > 0 ? erros : undefined,
  };

  console.log("[CRON INSIGHTS-SOMBRA]", resumo);
  return NextResponse.json(resumo);
}
