// ─────────────────────────────────────────
// QuitaZAP — Cron: Lembretes de Vencimento
// GET /api/cron/lembretes  (roda todo dia às 8h BRT = 11h UTC)
//
// Lembretes por diaVencimento das Dividas (bot conselheiro)
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deliverReminder } from "@/lib/reminder-delivery";

// ── Handler principal ─────────────────────

export async function GET(req: NextRequest) {
  // Segurança: bearer secret (Vercel injeta automaticamente no Cron)
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
      console.error("[LEMBRETES] CRON_SECRET não configurado — recusando chamada externa.");
      return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
    }
  }

  const agora = new Date();

  let legadoEnviados = 0;
  const legadoErros: string[] = [];

  try {
    const diaHoje       = agora.getDate();
    const diasVerificar = [diaHoje, diaHoje + 1, diaHoje + 3]; // hoje, amanhã e 3 dias

    const dividas = await prisma.divida.findMany({
      where: {
        status:         "ATIVA",
        diaVencimento:  { in: diasVerificar },
      },
      include: {
        cliente: { include: { botSessoes: { take: 1 } } },
      },
    });

    for (const divida of dividas) {
      const sessao = divida.cliente.botSessoes?.[0];
      if (!sessao?.telefone) continue;
      if (!divida.cliente.aceitaProativas) continue;

      const diasRestantes = divida.diaVencimento! - diaHoje;
      const nomeCliente   = divida.cliente.nome;
      const valorFmt      = divida.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      let mensagem = "";

      if (diasRestantes === 0) {
        mensagem = `⚠️ *Atenção, ${nomeCliente}!*\n\nHoje é o vencimento do *${divida.credor}* — *R$ ${valorFmt}*.\n\nPague hoje para evitar juros e multa! 💚`;
      } else if (diasRestantes === 1) {
        mensagem = `📅 *Lembrete, ${nomeCliente}!*\n\nAmanhã vence o *${divida.credor}* — *R$ ${valorFmt}*.\n\nJá separou o dinheiro? Pague antes do vencimento! 💚`;
      } else if (diasRestantes === 3) {
        mensagem = `💡 *${nomeCliente}, em 3 dias vence:*\n\n*${divida.credor}* — *R$ ${valorFmt}* (dia ${divida.diaVencimento})\n\nPlaneje-se para não atrasar! 💚`;
      }

      if (!mensagem) continue;

      try {
        // Áudio só nos lembretes mais importantes (vence hoje/amanhã) —
        // pedido do Ibrahim (09/09/2026), recomendação do ChatGPT: não vale
        // gerar TTS pra todo aviso pequeno (custo recorrente por cliente
        // ativo). O D-3 sempre sai só em texto.
        const modoPermitido = diasRestantes <= 1 ? divida.cliente.modoLembrete : "TEXTO";
        await deliverReminder({ phone: sessao.telefone, mensagem, modo: modoPermitido });
        legadoEnviados++;
      } catch (err) {
        legadoErros.push(`${nomeCliente} (${divida.credor}): ${err}`);
      }
    }
  } catch (err) {
    console.error("[LEMBRETES] Erro geral:", err);
  }

  const resumo = {
    ok:            true,
    rodadoEm:      agora.toISOString(),
    legadoEnviados,
    legadoErros:   legadoErros.length > 0 ? legadoErros : undefined,
  };

  console.log("[LEMBRETES]", resumo);
  return NextResponse.json(resumo);
}
