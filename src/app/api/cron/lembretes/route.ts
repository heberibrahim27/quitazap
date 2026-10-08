// ─────────────────────────────────────────
// QuitaZAP — Cron: Lembretes de Vencimento
// GET /api/cron/lembretes  (roda todo dia às 8h BRT = 11h UTC)
//
// Avisa D-3 / D-1 / D0 de dívidas. A regra (qual parcela, qual valor, virada de mês, mês
// curto, fuso) vive em src/lib/lembretes.ts e é testada em tests/regressao-lembretes.test.mjs.
//
// Parâmetros de ensaio (só passam com o Bearer do CRON_SECRET):
//   ?clienteId=<id>   restringe a UM cliente (QA nunca deve rodar sem isto a partir da máquina local)
//   ?agora=<ISO>      simula o instante da execução
// ─────────────────────────────────────────

import { negarCronNaoAutorizado } from "@/lib/cron-auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deliverReminder } from "@/lib/reminder-delivery";
import { registrarExecucaoAgente } from "@/lib/agentes/alertas-store";
import { avisoDeVencimento, diaBrasil, diasCandidatosDoMes } from "@/lib/lembretes";

// ── Handler principal ─────────────────────

export async function GET(req: NextRequest) {
  // Segurança: bearer secret (Vercel injeta automaticamente no Cron)
  const negado = negarCronNaoAutorizado(req);
  if (negado) return negado;

  const clienteId = req.nextUrl.searchParams.get("clienteId") ?? undefined;
  const agoraParam = req.nextUrl.searchParams.get("agora");
  const agora = agoraParam && !Number.isNaN(new Date(agoraParam).getTime()) ? new Date(agoraParam) : new Date();

  let legadoEnviados = 0;
  const legadoErros: string[] = [];
  const enviados: { credor: string; dias: number; valor: number }[] = [];

  try {
    const hoje = diaBrasil(agora);
    // Meia-noite de Brasília = 03:00 UTC. Janela de parcelas: hoje até D+3 (4 dias corridos).
    const inicioHoje = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia, 3));
    const fimJanela = new Date(inicioHoje.getTime() + 4 * 86_400_000);

    const dividas = await prisma.divida.findMany({
      where: {
        status: "ATIVA",
        ...(clienteId ? { clienteId } : {}),
        OR: [
          // parcelada: tem parcela pendente vencendo na janela (independe de parcelas atrasadas)
          { parcelas: { some: { status: "PENDENTE", vencimento: { gte: inicioHoje, lt: fimJanela } } } },
          // avulsa (sem cronograma): pelo dia do mês, incluindo virada de mês e mês curto
          { parcelas: { none: {} }, diaVencimento: { in: diasCandidatosDoMes(hoje) } },
        ],
      },
      include: {
        cliente: { include: { botSessoes: { take: 1 } } },
        parcelas: { where: { status: "PENDENTE", vencimento: { gte: inicioHoje, lt: fimJanela } }, orderBy: { vencimento: "asc" } },
        _count: { select: { parcelas: true } },
      },
    });

    for (const divida of dividas) {
      const sessao = divida.cliente.botSessoes?.[0];
      if (!sessao?.telefone) continue;
      if (!divida.cliente.aceitaProativas) continue;

      const aviso = avisoDeVencimento(
        {
          diaVencimento: divida.diaVencimento,
          valorTotal: divida.valorTotal,
          temParcelas: divida._count.parcelas > 0,
          parcelasPendentes: divida.parcelas.map((p) => ({ valor: p.valor, vencimento: p.vencimento })),
        },
        agora
      );
      if (!aviso) continue;

      const nomeCliente = divida.cliente.nome;
      const valorFmt = aviso.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      let mensagem = "";

      if (aviso.diasRestantes === 0) {
        mensagem = `⚠️ *Atenção, ${nomeCliente}!*\n\nHoje é o vencimento do *${divida.credor}* — *R$ ${valorFmt}*.\n\nPague hoje para evitar juros e multa! 💚`;
      } else if (aviso.diasRestantes === 1) {
        mensagem = `📅 *Lembrete, ${nomeCliente}!*\n\nAmanhã vence o *${divida.credor}* — *R$ ${valorFmt}*.\n\nJá separou o dinheiro? Pague antes do vencimento! 💚`;
      } else {
        mensagem = `💡 *${nomeCliente}, em 3 dias vence:*\n\n*${divida.credor}* — *R$ ${valorFmt}* (dia ${aviso.dia})\n\nPlaneje-se para não atrasar! 💚`;
      }

      try {
        // Áudio só nos lembretes mais importantes (vence hoje/amanhã) —
        // pedido do Ibrahim (09/09/2026), recomendação do ChatGPT: não vale
        // gerar TTS pra todo aviso pequeno (custo recorrente por cliente
        // ativo). O D-3 sempre sai só em texto.
        const modoPermitido = aviso.diasRestantes <= 1 ? divida.cliente.modoLembrete : "TEXTO";
        await deliverReminder({ phone: sessao.telefone, mensagem, modo: modoPermitido });
        legadoEnviados++;
        enviados.push({ credor: divida.credor, dias: aviso.diasRestantes, valor: aviso.valor });
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
    // só aparece em ensaio com ?clienteId= (nunca expõe lista de clientes reais em produção)
    ...(clienteId ? { enviados } : {}),
  };

  console.log("[LEMBRETES]", { ...resumo, enviados: undefined });
  // Aviso de vencimento de dívida (D-3/D-1/D0) é trabalho do agente Compromissos.
  await registrarExecucaoAgente({
    agente: "compromissos",
    iniciadoEm: agora,
    terminadoEm: new Date(),
    clientesAvaliados: legadoEnviados + legadoErros.length,
    acoes: legadoEnviados,
    erros: legadoErros,
    detalhes: { origem: "lembretes de dívida (D-3/D-1/D0)", versao: "1.2" },
  });
  return NextResponse.json(resumo);
}
