// ─────────────────────────────────────────
// QuitaZAP Controle — Movimentações (leitura unificada)
// ─────────────────────────────────────────
// Camada de leitura só: normaliza Lancamento (receita/despesa/compra no
// cartão) e Pagamento (baixa de dívida) num único feed cronológico, sem
// nenhuma migração de schema — as duas tabelas continuam existindo
// separadas, exatamente como hoje. Ver decisão registrada na conversa sobre
// arquitetura do Controle: "não faça migração só para unificar visualmente".

import { prisma } from "@/lib/prisma";

export type MovimentacaoUnificada = {
  id: string;
  origem: "lancamento" | "pagamento";
  data: Date;
  descricao: string;
  meta: string;
  valor: number;
  sinal: "entrada" | "saida";
  editarUrl: string | null;
};

const ROTULO_TIPO_LANCAMENTO: Record<string, string> = {
  RECEITA: "Receita",
  DESPESA_FIXA: "Despesa fixa",
  DESPESA_VARIAVEL: "Despesa variável",
  COMPRA_CARTAO: "Compra no cartão",
  FATURA_FECHADA: "Fatura fechada",
};

export async function listarMovimentacoes(params: {
  clienteId: string;
  inicio: Date;
  fim: Date;
}): Promise<MovimentacaoUnificada[]> {
  const { clienteId, inicio, fim } = params;

  const [lancamentos, pagamentos] = await Promise.all([
    prisma.lancamento.findMany({
      where: { clienteId, data: { gte: inicio, lt: fim } },
      include: { cartao: { select: { nome: true } } },
      orderBy: { data: "desc" },
    }),
    prisma.pagamento.findMany({
      where: { clienteId, data: { gte: inicio, lt: fim } },
      include: { divida: { select: { credor: true } } },
      orderBy: { data: "desc" },
    }),
  ]);

  const doLancamento: MovimentacaoUnificada[] = lancamentos.map((l) => ({
    id: `lancamento:${l.id}`,
    origem: "lancamento",
    data: l.data,
    descricao: l.descricao,
    meta: [ROTULO_TIPO_LANCAMENTO[l.tipo] ?? l.tipo, l.cartao?.nome, l.categoria].filter(Boolean).join(" · "),
    valor: l.valor,
    sinal: l.tipo === "RECEITA" ? "entrada" : "saida",
    editarUrl: `/minha-conta/lancamento/${l.id}/editar`,
  }));

  const doPagamento: MovimentacaoUnificada[] = pagamentos.map((p) => ({
    id: `pagamento:${p.id}`,
    origem: "pagamento",
    data: p.data,
    descricao: `Pagamento — ${p.divida.credor}`,
    meta: "Baixa de dívida",
    valor: p.valor,
    sinal: "saida",
    editarUrl: null,
  }));

  return [...doLancamento, ...doPagamento].sort((a, b) => b.data.getTime() - a.data.getTime());
}
