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
  const parcelasDoMes = await prisma.parcela.findMany({
    where: {
      status: "PENDENTE",
      vencimento: { gte: inicioMes, lt: fimMes },
      divida: { clienteId, status: "ATIVA", descontadoEmFolha: false },
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
