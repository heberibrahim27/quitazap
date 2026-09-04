// ─────────────────────────────────────────
// QuitaZAP Controle — Cron: Lembretes de Tarefa
// GET /api/cron/tarefas (roda 1x por dia — plano Hobby da Vercel não permite
// cron mais frequente; um "schedule" tipo "0 * * * *" derruba o deploy inteiro)
//
// 1. Avança tarefas recorrentes cujo vencimento já passou (< hoje) para a
//    próxima ocorrência, voltando o status para PENDENTE.
// 2. Envia lembrete pras tarefas PENDENTE que vencem amanhã (véspera, D-1)
//    ou hoje (D+0) — por WhatsApp (se o cliente tiver telefone) e por push
//    (se tiver alguma inscrição ativa no PWA); dispara os dois canais
//    quando disponíveis, não é um ou outro. Dedupe por dia via
//    ultimoLembrete, então cada tarefa recebe no máximo um lembrete por
//    dia de execução do cron (o de véspera hoje, o do dia amanhã). O
//    horarioEnvio configurado em cada tarefa não é respeitado à risca (só
//    há 1 execução por dia no plano atual) — todo lembrete do dia sai
//    junto, no horário em que o cron roda.
// 3. Limpa registros velhos de MensagemProcessada (dedupe do webhook Z-API) —
//    a janela de dedupe é de só 10 minutos, reter por 24h já é folga generosa.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp } from "@/lib/zapi";
import { calcularProximaOcorrencia } from "@/lib/tarefa-flow";
import { enviarPush } from "@/lib/push-service";

const FUSO = "America/Sao_Paulo";

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

  // ── 2. Envia lembretes — véspera (D-1) e dia do vencimento (D+0) ──
  // Cada tarefa recebe no máximo 1 lembrete por dia de execução do cron
  // (dedupe via ultimoLembrete), então uma tarefa que vence amanhã ganha
  // o aviso de véspera hoje, e o aviso "vence hoje" no dia seguinte —
  // dois lembretes distintos, sem duplicar no mesmo dia.
  try {
    const amanhaBrasil = dataBrasil(new Date(agora.getTime() + 24 * 60 * 60 * 1000));

    const candidatasHoje = await prisma.tarefa.findMany({
      where: {
        status: "PENDENTE",
        vencimento: { gte: doisDiasAntes, lt: doisDiasDepois },
      },
      include: { cliente: { select: { telefone: true, aceitaProativas: true } } },
    });

    for (const t of candidatasHoje) {
      if (!t.vencimento) continue;
      const dataVenc = dataBrasil(t.vencimento);
      const ehHoje = dataVenc === hojeBrasil;
      const ehAmanha = dataVenc === amanhaBrasil;
      if (!ehHoje && !ehAmanha) continue;
      if (t.ultimoLembrete && dataBrasil(t.ultimoLembrete) === hojeBrasil) continue;

      const valorTexto =
        t.valor != null
          ? ` — ${t.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
          : "";
      const corpo = `${t.descricao}${valorTexto}`;
      const mensagemWhatsApp = ehHoje
        ? `🔔 *Lembrete:* ${corpo}\n\nSe já resolveu, responda: *"concluí ${t.descricao.toLowerCase()}"*`
        : `📅 *Lembrete:* ${corpo} vence amanhã\n\nSe já resolveu, responda: *"concluí ${t.descricao.toLowerCase()}"*`;

      let enviouAlgo = false;

      const telefone = t.cliente?.telefone;
      if (telefone && t.cliente?.aceitaProativas) {
        try {
          await sendWhatsApp(telefone, mensagemWhatsApp);
          enviouAlgo = true;
        } catch (err) {
          erros.push(`whatsapp ${t.id} (${t.descricao}): ${err}`);
        }
      }

      try {
        const enviosPush = await enviarPush(t.clienteId, {
          titulo: ehHoje ? "Vence hoje" : "Vence amanhã",
          corpo,
          url: "/minha-conta/agenda",
        });
        if (enviosPush > 0) enviouAlgo = true;
      } catch (err) {
        erros.push(`push ${t.id} (${t.descricao}): ${err}`);
      }

      if (enviouAlgo) {
        await prisma.tarefa.update({
          where: { id: t.id },
          data: { ultimoLembrete: agora },
        });
        lembretesEnviados++;
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
