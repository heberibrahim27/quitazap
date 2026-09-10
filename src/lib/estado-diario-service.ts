// ─────────────────────────────────────────
// QuitaZAP — "QuitaZAP Hoje" (MVP de hábito diário, Fase 4)
// Ver docs/chat-nativo-arquitetura.md seção 6 — regra dura: 3 estados
// distintos, falha NUNCA vira "sem novidade" silenciosamente. Sem
// integração bancária, o sistema só sabe o que o cliente registrou — toda
// "mudança relevante" aqui vem de comparação com um snapshot anterior
// salvo em EstadoDiarioCliente, nunca de inferência sobre ausência de
// dado.
// ─────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { calcularResumoFinanceiro, limitesDoMes, anoMesAtualBrasil } from "@/lib/financeiro/motor";
import { carregarEstadoControle } from "@/lib/controle-financeiro-flow";
import type { Mensagem } from "@/lib/ai-bot";

export type Compromisso = { id: string; descricao: string; valor: number | null; vencimento: Date };

export type AvaliacaoHoje =
  | {
      estado: "mudanca";
      avaliadoEm: Date;
      mensagens: string[];
      saldoProjetado: number | null;
      compromissos: Compromisso[];
    }
  | {
      estado: "sem_novidade";
      avaliadoEm: Date;
      saldoProjetado: number | null;
      compromissos: Compromisso[];
    }
  | {
      estado: "falha";
      avaliadoEm: Date;
      motivo: string;
      compromissos: Compromisso[];
    };

const JANELA_ATENCAO_DIAS = 1; // "vence amanhã"

/**
 * Avalia a situação do cliente hoje e compara com a última avaliação
 * salva. Nunca lança — qualquer erro interno vira estado "falha", nunca
 * "sem_novidade" (evitaria mascarar um problema real como "tudo certo").
 */
export async function avaliarQuitaZapHoje(clienteId: string): Promise<AvaliacaoHoje> {
  const avaliadoEm = new Date();

  // Compromissos futuros — sempre mostrados, independente do estado.
  const emBreve = new Date(avaliadoEm.getTime() + 4 * 86_400_000);
  const tarefasAbertas = await prisma.tarefa.findMany({
    where: { clienteId, status: "PENDENTE", vencimento: { not: null, lte: emBreve } },
    orderBy: { vencimento: "asc" },
    take: 5,
    select: { id: true, descricao: true, valor: true, vencimento: true },
  });
  const compromissos: Compromisso[] = tarefasAbertas
    .filter((t): t is typeof t & { vencimento: Date } => t.vencimento != null)
    .map((t) => ({ id: t.id, descricao: t.descricao, valor: t.valor, vencimento: t.vencimento }));

  try {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { rendaMensal: true } });
    if (!cliente) return { estado: "falha", avaliadoEm, motivo: "Cliente não encontrado.", compromissos };

    const { ano, mes } = anoMesAtualBrasil(avaliadoEm);
    const resumo = await calcularResumoFinanceiro({
      clienteId,
      periodo: limitesDoMes(ano, mes),
      rendaMensalDeclarada: cliente.rendaMensal,
    });

    const calculavel = resumo.comprometimento.calculavel;
    const saldoProjetado = calculavel ? resumo.comprometimento.saldoProjetado : null;
    const situacaoApertada = calculavel ? (saldoProjetado as number) < 0 : null;

    // Pendência de confirmação (BotSessao.dividasTemp) — mesma fonte que
    // o chat/webhook já usam, nunca recalculada aqui.
    const sessao = await prisma.botSessao.findFirst({ where: { clienteId } });
    const historico: Mensagem[] = sessao ? JSON.parse(sessao.dividasTemp || "[]") : [];
    const estadoControle = carregarEstadoControle(historico, sessao?.renda);
    const tinhaPendenciaAgora = Boolean(estadoControle.confirmacaoPendente);

    const anterior = await prisma.estadoDiarioCliente.findUnique({ where: { clienteId } });
    const tarefasAlertadasAntes: string[] = Array.isArray(anterior?.tarefasAlertadasIds)
      ? (anterior!.tarefasAlertadasIds as string[])
      : [];

    // Critério 1: obrigação ENTRANDO na janela "vence amanhã" agora, que
    // ainda não tinha sido alertada.
    const amanha = new Date(avaliadoEm.getTime() + JANELA_ATENCAO_DIAS * 86_400_000);
    const entrandoNaJanela = tarefasAbertas.filter(
      (t) => t.vencimento && t.vencimento <= amanha && !tarefasAlertadasAntes.includes(t.id)
    );

    // Critério 2: projeção mudou de situação (começou/parou de faltar
    // dinheiro) — nunca oscilação de centavos sem mudar o sinal.
    const situacaoMudou =
      calculavel && anterior?.situacaoApertada != null && anterior.situacaoApertada !== situacaoApertada;

    // Critério 3: pendência nova aparecendo (não uma que já existia).
    const pendenciaNova = tinhaPendenciaAgora && anterior?.tinhaPendencia === false;

    // Critério 4: virou calculável quando antes não era (ex.: cliente
    // acabou de cadastrar renda) — é uma mudança real de situação.
    const ficouCalculavel = calculavel && anterior != null && anterior.saldoProjetado == null;

    const mensagens: string[] = [];
    for (const t of entrandoNaJanela) {
      const dias = Math.round((t.vencimento!.getTime() - avaliadoEm.getTime()) / 86_400_000);
      mensagens.push(
        dias <= 0
          ? `"${t.descricao}" vence hoje.`
          : `"${t.descricao}" vence amanhã.`
      );
    }
    if (situacaoMudou) {
      mensagens.push(
        situacaoApertada
          ? "Sua projeção do mês passou a ficar negativa."
          : "Sua projeção do mês voltou a ficar positiva."
      );
    }
    if (pendenciaNova) mensagens.push("Tem uma confirmação pendente pra você revisar.");
    if (ficouCalculavel) mensagens.push("Já consigo calcular sua projeção do mês.");

    // Salva o snapshot desta avaliação pra próxima comparação —
    // independente do estado que vai ser devolvido agora.
    await prisma.estadoDiarioCliente.upsert({
      where: { clienteId },
      create: {
        clienteId,
        ultimaAvaliacaoEm: avaliadoEm,
        saldoProjetado,
        situacaoApertada,
        tarefasAlertadasIds: [...new Set([...tarefasAlertadasAntes, ...entrandoNaJanela.map((t) => t.id)])],
        tinhaPendencia: tinhaPendenciaAgora,
      },
      update: {
        ultimaAvaliacaoEm: avaliadoEm,
        saldoProjetado,
        situacaoApertada,
        tarefasAlertadasIds: [...new Set([...tarefasAlertadasAntes, ...entrandoNaJanela.map((t) => t.id)])],
        tinhaPendencia: tinhaPendenciaAgora,
      },
    });

    if (!calculavel) {
      // Achado no teste manual (2026-09-10): checar isso só "na primeira
      // vez" (quando `anterior` ainda não existia) deixava a segunda
      // visita cair silenciosamente em "sem_novidade" mesmo com dado
      // insuficiente permanecendo insuficiente — exatamente o que a regra
      // proíbe. "Dados insuficientes" precisa continuar sendo "falha" em
      // TODA avaliação enquanto não for calculável, não só na estreia.
      return {
        estado: "falha",
        avaliadoEm,
        motivo: "Ainda não consigo montar seu resumo — cadastre sua renda ou lance algo no mês pra eu conseguir calcular.",
        compromissos,
      };
    }

    if (mensagens.length > 0) {
      return { estado: "mudanca", avaliadoEm, mensagens, saldoProjetado, compromissos };
    }

    return { estado: "sem_novidade", avaliadoEm, saldoProjetado, compromissos };
  } catch (err) {
    console.error("[QUITAZAP-HOJE] Erro ao avaliar:", err);
    return { estado: "falha", avaliadoEm, motivo: "Não consegui avaliar agora — tenta de novo em instantes.", compromissos };
  }
}
