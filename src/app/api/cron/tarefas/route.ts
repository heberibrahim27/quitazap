// ─────────────────────────────────────────
// QuitaZAP Controle — Cron: Lembretes de Tarefa
// GET /api/cron/tarefas (roda de hora em hora)
//
// 1. Avança tarefas recorrentes cujo vencimento já passou (< hoje) para a
//    próxima ocorrência, voltando o status para PENDENTE.
// 2. Envia lembrete de WhatsApp pras tarefas PENDENTE que vencem hoje,
//    respeitando o horarioEnvio configurado em cada tarefa (fuso America/Sao_Paulo,
//    mesma convenção usada em src/lib/gasto-flow.ts).
// 3. Limpa registros velhos de MensagemProcessada (dedupe do webhook Z-API) —
//    a janela de dedupe é de só 10 minutos, reter por 24h já é folga generosa.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp } from "@/lib/zapi";
import { calcularProximaOcorrencia } from "@/lib/tarefa-flow";

const FUSO = "America/Sao_Paulo";

function horaAtualBrasil(agora: Date): number {
  const horaTexto = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    hour: "2-digit",
    hour12: false,
  }).format(agora);
  return parseInt(horaTexto, 10) % 24;
}

// yyyy-mm-dd conforme o calendário de Brasília, independente do fuso do servidor.
// vencimento é gravado como "meia-noite local do servidor" (UTC na Vercel) pro dia
// escolhido — o que corresponde a ~21h do dia anterior em horário de Brasília. Por
// isso a janela "é hoje?" não pode ser feita comparando limites de dia em UTC (isso
// faria lembretes configurados entre 21h-23h de Brasília nunca disparar, pois nessa
// faixa já é o dia seguinte em UTC) — precisa comparar a data já convertida pro fuso.
function dataBrasil(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(data);
}

export async function GET(req: NextRequest) {
  // Mesmo padrão de autenticação dos demais crons (lembretes, cobrador).
  const isInternal = req.headers.get("x-internal-call") === "1";
  if (!isInternal) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      console.warn("[CRON TAREFAS] CRON_SECRET não configurado — rota acessível sem autenticação.");
    }
  }

  const agora = new Date();
  const hojeBrasil = dataBrasil(agora);
  const horaAtual = horaAtualBrasil(agora);

  // Janela ampla só pra reduzir o quanto o banco devolve — a decisão real de
  // "é hoje mesmo (em Brasília)?" é feita depois, comparando dataBrasil().
  const doisDiasAntes = new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000);
  const doisDiasDepois = new Date(agora.getTime() + 2 * 24 * 60 * 60 * 1000);

  let avancadas = 0;
  let lembretesEnviados = 0;
  const erros: string[] = [];

  // ── 1. Avança recorrências vencidas ───────────────────────
  try {
    const candidatasRecorrentes = await prisma.tarefa.findMany({
      where: {
        recorrente: true,
        status: { in: ["PENDENTE", "CONCLUIDA"] },
        vencimento: { lt: doisDiasDepois },
      },
    });

    for (const t of candidatasRecorrentes) {
      if (!t.vencimento || dataBrasil(t.vencimento) >= hojeBrasil) continue;

      const proxima = calcularProximaOcorrencia(t, agora);
      if (!proxima) continue;

      await prisma.tarefa.update({
        where: { id: t.id },
        data: { vencimento: proxima, status: "PENDENTE", ultimoLembrete: null },
      });
      avancadas++;
    }
  } catch (err) {
    console.error("[CRON TAREFAS] Erro ao avançar recorrências:", err);
  }

  // ── 2. Envia lembretes do dia ──────────────────────────────
  try {
    const candidatasHoje = await prisma.tarefa.findMany({
      where: {
        status: "PENDENTE",
        vencimento: { gte: doisDiasAntes, lt: doisDiasDepois },
      },
      include: { cliente: { select: { telefone: true } } },
    });

    for (const t of candidatasHoje) {
      if (!t.vencimento || dataBrasil(t.vencimento) !== hojeBrasil) continue;

      const horaConfig = parseInt(t.horarioEnvio.split(":")[0] ?? "", 10);
      if (Number.isNaN(horaConfig) || horaConfig !== horaAtual) continue;
      if (t.ultimoLembrete && dataBrasil(t.ultimoLembrete) === hojeBrasil) continue;

      const telefone = t.cliente?.telefone;
      if (!telefone) continue;

      const valorTexto =
        t.valor != null
          ? ` — ${t.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
          : "";
      const mensagem =
        `🔔 *Lembrete:* ${t.descricao}${valorTexto}\n\n` +
        `Se já resolveu, responda: *"concluí ${t.descricao.toLowerCase()}"*`;

      try {
        await sendWhatsApp(telefone, mensagem);
        await prisma.tarefa.update({
          where: { id: t.id },
          data: { ultimoLembrete: agora },
        });
        lembretesEnviados++;
      } catch (err) {
        erros.push(`${t.id} (${t.descricao}): ${err}`);
      }

      await new Promise((r) => setTimeout(r, 400));
    }
  } catch (err) {
    console.error("[CRON TAREFAS] Erro ao enviar lembretes:", err);
  }

  // ── 3. Limpa dedupe do webhook (retenção de 24h) ───────────
  let mensagensLimpas = 0;
  try {
    const limite24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const resultado = await prisma.mensagemProcessada.deleteMany({
      where: { criadoEm: { lt: limite24h } },
    });
    mensagensLimpas = resultado.count;
  } catch (err) {
    console.error("[CRON TAREFAS] Erro ao limpar MensagemProcessada:", err);
  }

  const resumo = {
    ok: true,
    rodadoEm: agora.toISOString(),
    avancadas,
    lembretesEnviados,
    mensagensLimpas,
    erros: erros.length > 0 ? erros : undefined,
  };

  console.log("[CRON TAREFAS]", resumo);
  return NextResponse.json(resumo);
}
