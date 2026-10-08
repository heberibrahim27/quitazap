// ─────────────────────────────────────────
// QuitaZAP — Cron: Lembretes de Vencimento
// GET /api/cron/lembretes  (roda todo dia às 8h BRT = 11h UTC)
//
// Lembretes por diaVencimento das Dividas (bot conselheiro)
// ─────────────────────────────────────────

import { negarCronNaoAutorizado } from "@/lib/cron-auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deliverReminder } from "@/lib/reminder-delivery";
import { registrarExecucaoAgente } from "@/lib/agentes/alertas-store";
import { anoMesDiaBrasil } from "@/lib/financeiro/fatura-cartao";

// ── Handler principal ─────────────────────

export async function GET(req: NextRequest) {
  // Segurança: bearer secret (Vercel injeta automaticamente no Cron)
  const negado = negarCronNaoAutorizado(req);
  if (negado) return negado;

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
        parcelas: { where: { status: "PENDENTE" }, orderBy: { vencimento: "asc" }, take: 1 },
        _count: { select: { parcelas: true } },
      },
    });

    for (const divida of dividas) {
      const sessao = divida.cliente.botSessoes?.[0];
      if (!sessao?.telefone) continue;
      if (!divida.cliente.aceitaProativas) continue;

      // Dívida parcelada: avisa a PRÓXIMA parcela pendente (valor e data dela),
      // nunca o total restante, e só quando ela está mesmo na janela — antes
      // o aviso saía todo mês no mesmo dia, mesmo com a parcela a meses de
      // distância. Dívida sem parcelas segue a regra antiga (dia do mês).
      const proximaParcela = divida.parcelas[0];
      let diasRestantes = divida.diaVencimento! - diaHoje;
      let valorAviso = divida.valorTotal;
      if (divida._count.parcelas > 0) {
        if (!proximaParcela) continue; // todas pagas
        const hoje = anoMesDiaBrasil(agora);
        const venc = anoMesDiaBrasil(proximaParcela.vencimento);
        diasRestantes = Math.round((Date.UTC(venc.ano, venc.mes - 1, venc.dia) - Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia)) / 86400000);
        valorAviso = proximaParcela.valor;
      }
      const nomeCliente   = divida.cliente.nome;
      const valorFmt      = valorAviso.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      let mensagem = "";

      if (diasRestantes === 0) {
        mensagem = `⚠️ *Atenção, ${nomeCliente}!*\n\nHoje é o vencimento do *${divida.credor}* — *R$ ${valorFmt}*.\n\nPague hoje para evitar juros e multa! 💚`;
      } else if (diasRestantes === 1) {
        mensagem = `📅 *Lembrete, ${nomeCliente}!*\n\nAmanhã vence o *${divida.credor}* — *R$ ${valorFmt}*.\n\nJá separou o dinheiro? Pague antes do vencimento! 💚`;
      } else if (diasRestantes === 3) {
        mensagem = `💡 *${nomeCliente}, em 3 dias vence:*\n\n*${divida.credor}* — *R$ ${valorFmt}* (dia ${proximaParcela ? anoMesDiaBrasil(proximaParcela.vencimento).dia : divida.diaVencimento})\n\nPlaneje-se para não atrasar! 💚`;
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
  // Aviso de vencimento de dívida (D-3/D-1/D0) é trabalho do agente Compromissos.
  await registrarExecucaoAgente({
    agente: "compromissos",
    iniciadoEm: agora,
    terminadoEm: new Date(),
    clientesAvaliados: legadoEnviados + legadoErros.length,
    acoes: legadoEnviados,
    erros: legadoErros,
    detalhes: { origem: "lembretes de dívida (D-3/D-1/D0)", versao: "1.1" },
  });
  return NextResponse.json(resumo);
}
