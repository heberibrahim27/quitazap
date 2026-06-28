// ─────────────────────────────────────────
// QuitaZAP — Cron: Cobrador Automático
// GET /api/cron/cobrador  (chamado pelo Vercel Cron todo dia às 12h UTC)
//
// Régua de cobrança:
//   Etapa 1 → dia do vencimento (amigável)
//   Etapa 2 → 3 dias após vencimento sem pagamento (mais firme)
//   Etapa 3 → 7 dias após vencimento sem pagamento (última chance)
//   Após 30 dias → cancela automaticamente
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, normalizarTelefone } from "@/lib/zapi";

// ── Formata valor monetário ──────────────
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Formata data para exibição ───────────
function fmtData(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Mensagem etapa 1 (amigável) ──────────
function msgEtapa1(devedorNome: string, credorNome: string, valor: number, vencimento: Date, mensagemCustom: string | null, pixChave: string | null): string {
  const linhaMsg = mensagemCustom
    ? `\n💬 _"${mensagemCustom}"_\n`
    : "";
  const linhaPix = pixChave
    ? `\nPara pagar via Pix: 🔑 *${pixChave}*`
    : "";
  return (
    `Oi *${devedorNome}*! 👋\n\n` +
    `*${credorNome}* está te lembrando de um compromisso financeiro:\n\n` +
    `💰 *Valor:* ${fmt(valor)}\n` +
    `📅 *Vencimento:* ${fmtData(vencimento)}` +
    linhaMsg +
    linhaPix +
    `\n\n──────────────────\n` +
    `💬 _Mensagem enviada pelo QuitaZAP_\n` +
    `_Controle suas finanças pelo WhatsApp_\n` +
    `👉 www.quitazap.com.br`
  );
}

// ── Mensagem etapa 2 (mais firme) ────────
function msgEtapa2(devedorNome: string, credorNome: string, valor: number, pixChave: string | null): string {
  const linhaPix = pixChave
    ? `\nRegularize via Pix: 🔑 *${pixChave}*`
    : "";
  return (
    `Olá, *${devedorNome}*. 👋\n\n` +
    `Ainda não identificamos o pagamento de *${fmt(valor)}* para *${credorNome}*.\n\n` +
    `Já se passaram 3 dias desde o vencimento.` +
    linhaPix +
    `\n\nCaso já tenha pago, desconsidere esta mensagem. 😊\n\n` +
    `──────────────────\n` +
    `💬 _Mensagem enviada pelo QuitaZAP_\n` +
    `👉 www.quitazap.com.br`
  );
}

// ── Mensagem etapa 3 (última chance) ─────
function msgEtapa3(devedorNome: string, credorNome: string, valor: number, pixChave: string | null): string {
  const linhaPix = pixChave
    ? `\n\nRegularize via Pix: 🔑 *${pixChave}*`
    : "";
  return (
    `*${devedorNome}*, esta é a última notificação automática.\n\n` +
    `O valor de *${fmt(valor)}* para *${credorNome}* está em aberto há mais de uma semana.` +
    linhaPix +
    `\n\nSe já pagou, avise *${credorNome}* diretamente.\n\n` +
    `──────────────────\n` +
    `💬 _Mensagem enviada pelo QuitaZAP_\n` +
    `👉 www.quitazap.com.br`
  );
}

export async function GET(req: NextRequest) {
  // Verifica secret para segurança (opcional, mas recomendado)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const h3diasAtras = new Date(hoje);
  h3diasAtras.setDate(h3diasAtras.getDate() - 3);

  const h7diasAtras = new Date(hoje);
  h7diasAtras.setDate(h7diasAtras.getDate() - 7);

  const h30diasAtras = new Date(hoje);
  h30diasAtras.setDate(h30diasAtras.getDate() - 30);

  let disparadas = 0;
  let erros = 0;

  try {
    // ── ETAPA 1: Cobranças que vencem hoje (status PENDENTE) ─────────────────
    const etapa1 = await prisma.cobranca.findMany({
      where: {
        status: "PENDENTE",
        vencimento: { gte: hoje, lt: amanha },
      },
    });

    for (const c of etapa1) {
      try {
        const fone = normalizarTelefone(c.devedorFone);
        await sendWhatsApp(fone, msgEtapa1(c.devedorNome, c.credorNome, c.valor, c.vencimento, c.mensagem, c.pixChave));
        await prisma.cobranca.update({
          where: { id: c.id },
          data: { status: "ENVIADA", etapa: 1, ultimoEnvio: new Date(), tentativas: { increment: 1 } },
        });
        disparadas++;
        console.log(`[COBRADOR] Etapa 1 → ${c.devedorNome} (${fone}) — ${c.valor}`);
      } catch (err) {
        erros++;
        console.error(`[COBRADOR] Erro etapa 1 id=${c.id}:`, err);
      }
    }

    // ── ETAPA 2: 3 dias após vencimento sem pagamento (etapa=1) ─────────────
    const etapa2 = await prisma.cobranca.findMany({
      where: {
        status: "ENVIADA",
        etapa: 1,
        ultimoEnvio: { lte: h3diasAtras },
      },
    });

    for (const c of etapa2) {
      try {
        const fone = normalizarTelefone(c.devedorFone);
        await sendWhatsApp(fone, msgEtapa2(c.devedorNome, c.credorNome, c.valor, c.pixChave));
        await prisma.cobranca.update({
          where: { id: c.id },
          data: { etapa: 2, ultimoEnvio: new Date(), tentativas: { increment: 1 } },
        });
        disparadas++;
        console.log(`[COBRADOR] Etapa 2 → ${c.devedorNome} (${fone})`);
      } catch (err) {
        erros++;
        console.error(`[COBRADOR] Erro etapa 2 id=${c.id}:`, err);
      }
    }

    // ── ETAPA 3: 7 dias após último envio sem pagamento (etapa=2) ───────────
    const etapa3 = await prisma.cobranca.findMany({
      where: {
        status: "ENVIADA",
        etapa: 2,
        ultimoEnvio: { lte: h7diasAtras },
      },
    });

    for (const c of etapa3) {
      try {
        const fone = normalizarTelefone(c.devedorFone);
        await sendWhatsApp(fone, msgEtapa3(c.devedorNome, c.credorNome, c.valor, c.pixChave));
        await prisma.cobranca.update({
          where: { id: c.id },
          data: { etapa: 3, ultimoEnvio: new Date(), tentativas: { increment: 1 } },
        });
        disparadas++;
        console.log(`[COBRADOR] Etapa 3 (última chance) → ${c.devedorNome} (${fone})`);
      } catch (err) {
        erros++;
        console.error(`[COBRADOR] Erro etapa 3 id=${c.id}:`, err);
      }
    }

    // ── CANCELAR: 30 dias sem pagamento após última chance ───────────────────
    const cancelar = await prisma.cobranca.findMany({
      where: {
        status: "ENVIADA",
        etapa: 3,
        ultimoEnvio: { lte: h30diasAtras },
      },
      select: { id: true },
    });

    if (cancelar.length > 0) {
      await prisma.cobranca.updateMany({
        where: { id: { in: cancelar.map((c) => c.id) } },
        data: { status: "CANCELADA" },
      });
      console.log(`[COBRADOR] ${cancelar.length} cobrança(s) cancelada(s) por inatividade`);
    }

    const resumo = {
      ok: true,
      rodadoEm: new Date().toISOString(),
      disparadas,
      erros,
      canceladas: cancelar.length,
      etapa1: etapa1.length,
      etapa2: etapa2.length,
      etapa3: etapa3.length,
    };

    console.log("[COBRADOR]", resumo);
    return NextResponse.json(resumo);

  } catch (err) {
    console.error("[COBRADOR] Erro geral:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
