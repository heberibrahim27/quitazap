// ─────────────────────────────────────────
// QuitaZAP — Cron: Lembretes de Vencimento
// GET /api/cron/lembretes (roda todo dia às 8h)
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp } from "@/lib/zapi";

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function GET(req: NextRequest) {
  // Segurança: só roda com o secret correto (Vercel injeta automaticamente em cron jobs)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const diasVerificar = [diaHoje, diaHoje + 1, diaHoje + 3]; // hoje, amanhã, 3 dias

  // Busca todas as dívidas ativas com dia de vencimento definido
  const dividas = await prisma.divida.findMany({
    where: {
      status: "ATIVA",
      diaVencimento: { in: diasVerificar },
    },
    include: {
      cliente: {
        include: {
          botSessoes: { take: 1 },
        },
      },
    },
  });

  let enviados = 0;
  const erros: string[] = [];

  for (const divida of dividas) {
    const sessao = divida.cliente.botSessoes?.[0];
    if (!sessao?.telefone) continue;

    const diasRestantes = divida.diaVencimento! - diaHoje;
    const nomeCliente = divida.cliente.nome;

    let mensagem = "";

    if (diasRestantes === 0) {
      // Vence hoje
      mensagem = `⚠️ *Atenção, ${nomeCliente}!*\n\nHoje é o vencimento do *${divida.credor}* — *R$ ${fmt(divida.valorTotal)}*.\n\nPague hoje para evitar juros e multa! 💚`;
    } else if (diasRestantes === 1) {
      // Vence amanhã
      mensagem = `📅 *Lembrete, ${nomeCliente}!*\n\nAmanhã vence o *${divida.credor}* — *R$ ${fmt(divida.valorTotal)}*.\n\nJá separou o dinheiro? Pague antes do vencimento! 💚`;
    } else if (diasRestantes === 3) {
      // Vence em 3 dias
      mensagem = `💡 *${nomeCliente}, em 3 dias vence:*\n\n*${divida.credor}* — *R$ ${fmt(divida.valorTotal)}* (dia ${divida.diaVencimento})\n\nPlaneje-se para não atrasar! 💚`;
    }

    if (!mensagem) continue;

    try {
      await sendWhatsApp(sessao.telefone, mensagem);
      enviados++;
    } catch (err) {
      erros.push(`${nomeCliente} (${divida.credor}): ${err}`);
    }
  }

  console.log(`[CRON] Lembretes enviados: ${enviados} | Erros: ${erros.length}`);

  return NextResponse.json({
    ok: true,
    enviados,
    erros: erros.length > 0 ? erros : undefined,
  });
}
