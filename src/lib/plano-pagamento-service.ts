// ─────────────────────────────────────────
// QuitaZAP Controle — Plano de Pagamento (resumo simplificado)
// ─────────────────────────────────────────
// Só o cálculo simplificado usado no Dashboard hoje (aritmética pura: renda
// menos despesas do mês menos parcelas de dívida vencendo no mês). Não é o
// motor completo do Plano (prioridade/juros/risco/alternativas) — ver
// `plano-pagamento-contrato.ts` pro contrato de entradas/saídas desse motor,
// ainda não implementado.

import { prisma } from "@/lib/prisma";
import type { ResumoPlanoParaDashboard } from "@/lib/plano-pagamento-contrato";

export async function resumoPlanoSimplificado(params: {
  clienteId: string;
  rendaMensal: number | null;
  /** Despesas fixas + variáveis + compras no cartão do mês, já somadas pela página chamadora. */
  totalDespesasMes: number;
  inicioMes: Date;
  fimMes: Date;
}): Promise<ResumoPlanoParaDashboard> {
  const { clienteId, rendaMensal, totalDespesasMes, inicioMes, fimMes } = params;

  if (!rendaMensal || rendaMensal <= 0) {
    return {
      rendaDisponivel: 0,
      totalComprometido: totalDespesasMes,
      saldoProjetado: -totalDespesasMes,
      calculavel: false,
    };
  }

  // divida.descontadoEmFolha=true = consignado, já refletido no salário
  // líquido que o cliente lança/declara como `rendaMensal` — excluído
  // aqui pra não abater a mesma dívida duas vezes do saldo projetado.
  //
  // Achado ao vivo (Ibrahim, 09/09/2026): antes só somava parcela PENDENTE
  // com vencimento no mês — assim que o cliente pagava (status vira PAGA),
  // ela sumia da conta, mesmo o dinheiro já tendo saído de verdade
  // (Movimentações, que soma Lancamento+Pagamento sem filtrar status,
  // continuava certa — só esse total "Comprometido"/"Disponível" ficava
  // inflado). Confirmado com o ChatGPT: sem duplicidade Lancamento×Pagamento
  // (marcarDividaComoPaga, ver pagamento-divida-service.ts, só cria
  // Pagamento — nunca gera Lancamento), então dá pra somar as duas pontas
  // com segurança. Agora soma: parcela PENDENTE com vencimento no mês (ainda
  // vai sair) OU parcela PAGA cujo pagamento caiu no mês (`atualizadoEm` —
  // atualizado na MESMA transação que cria o Pagamento, nenhum outro
  // caminho muda status pra PAGA sem isso, exceto o cron de consignados, já
  // fora daqui via descontadoEmFolha:false). Sem exigir divida.status
  // "ATIVA": uma dívida que virou "QUITADA" este mês (última parcela paga
  // agora) não pode sumir do total só por isso.
  const parcelasDoMes = await prisma.parcela.findMany({
    where: {
      divida: { clienteId, descontadoEmFolha: false, status: { not: "CANCELADA" } },
      OR: [
        { status: "PENDENTE", vencimento: { gte: inicioMes, lt: fimMes } },
        { status: "PAGA", atualizadoEm: { gte: inicioMes, lt: fimMes } },
      ],
    },
    select: { valor: true },
  });
  const totalParcelasMes = parcelasDoMes.reduce((soma, p) => soma + p.valor, 0);

  const totalComprometido = totalDespesasMes + totalParcelasMes;
  return {
    rendaDisponivel: rendaMensal,
    totalComprometido,
    saldoProjetado: rendaMensal - totalComprometido,
    calculavel: true,
  };
}
