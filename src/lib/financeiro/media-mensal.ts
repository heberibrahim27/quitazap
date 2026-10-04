// ─────────────────────────────────────────
// QuitaZAP Controle — média mensal de despesas (parte pura do motor)
// ─────────────────────────────────────────
// Achado em QA (Ibrahim, 04/10/2026): conta com UM mês de histórico (R$150
// de variáveis em setembro) mostrava, em outubro, "Despesas variáveis 580%
// acima da média dos últimos 3 meses" e nota de Saúde Financeira baseada
// nisso. Causa: a média sempre dividia por 3 (a quantidade de meses PEDIDA),
// mesmo quando só um dos três meses tinha qualquer lançamento — 150/3 = 50,
// e 340 de outubro virava "6,8x a média". Pior pra cliente novo: o mês em
// que ele chegou é parcial, então qualquer mês seguinte parece explosão.
//
// Regra agora:
// - só conta mês que teve alguma despesa lançada (mês sem nada não "puxa" a
//   média pra baixo);
// - exige pelo menos MESES_MINIMOS_PARA_MEDIA meses com dado — abaixo disso
//   devolve média zero, que todos os consumidores já tratam como "sem
//   histórico suficiente" (Saúde Financeira, anomalia por categoria,
//   "como economizar") em vez de inventar uma comparação.

export const MESES_MINIMOS_PARA_MEDIA = 2;

export interface MesParaMedia {
  despesasFixas: number;
  despesasVariaveis: number;
  cartoes: number;
  porCategoria: { categoria: string; total: number }[];
}

export interface MediaCalculada {
  /** Quantos meses COM despesa entraram na média (não a quantidade pedida). */
  quantidadeMeses: number;
  despesasFixas: number;
  despesasVariaveis: number;
  cartoes: number;
  porCategoria: { categoria: string; total: number }[];
}

function temDespesa(m: MesParaMedia): boolean {
  return m.despesasFixas + m.despesasVariaveis + m.cartoes > 0;
}

export function calcularMediaDeMeses(meses: MesParaMedia[]): MediaCalculada {
  const comDados = meses.filter(temDespesa);

  if (comDados.length < MESES_MINIMOS_PARA_MEDIA) {
    return { quantidadeMeses: comDados.length, despesasFixas: 0, despesasVariaveis: 0, cartoes: 0, porCategoria: [] };
  }

  let somaFixas = 0;
  let somaVariaveis = 0;
  let somaCartoes = 0;
  const somaPorCategoria = new Map<string, number>();

  for (const m of comDados) {
    somaFixas += m.despesasFixas;
    somaVariaveis += m.despesasVariaveis;
    somaCartoes += m.cartoes;
    for (const { categoria, total } of m.porCategoria) {
      somaPorCategoria.set(categoria, (somaPorCategoria.get(categoria) ?? 0) + total);
    }
  }

  const n = comDados.length;
  return {
    quantidadeMeses: n,
    despesasFixas: somaFixas / n,
    despesasVariaveis: somaVariaveis / n,
    cartoes: somaCartoes / n,
    porCategoria: Array.from(somaPorCategoria.entries()).map(([categoria, total]) => ({ categoria, total: total / n })),
  };
}
