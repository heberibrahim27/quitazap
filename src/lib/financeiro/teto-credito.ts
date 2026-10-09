// ─────────────────────────────────────────
// Teto de compras no crédito do ciclo — parte pura
// ─────────────────────────────────────────
// Pedido do Ibrahim (09/10/2026), desenhado com o ChatGPT: quem está
// endividado usa o cartão como válvula de escape, e o salário que vem já nasce
// comprometido. O teto mostra QUANTO ainda dá pra comprar no crédito neste
// ciclo sem empurrar o mês (e o próximo salário) pro vermelho.
//
//   teto = renda confiável − fixas − variáveis − parcelas de dívida
//          − faturas de ciclos JÁ FECHADOS e ainda não vencidos   (nunca < 0)
//   usado = compras do ciclo ABERTO (a fatura que ainda vai fechar)
//
// É uma ESTIMATIVA (fixas/variáveis/parcelas vêm do mês corrente; o ciclo do
// cartão atravessa meses) e é dita assim na tela. Sem renda confiável (nem
// lançada, nem prevista, nem declarada) não existe teto: nada é inventado.

import { comprometidoDoCartao, mesFaturaDaCompra } from "./fatura-cartao";

export interface CartaoCiclo {
  id: string;
  diaFechamento: number | null;
  diaVencimento: number | null;
}
export interface CompraCiclo {
  cartaoId: string | null;
  valor: number;
  data: Date;
}

export type NivelTeto = "OK" | "ATENCAO" | "QUASE" | "ACIMA";

export interface TetoCredito {
  teto: number;
  usado: number;
  restante: number;
  /** usado / teto (0 quando o teto é 0 e nada foi usado; Infinity-safe: 999). */
  pct: number;
  nivel: NivelTeto;
  /** Faturas de ciclos já fechados e ainda não vencidas (já descontadas do teto). */
  faturasFechadas: number;
}

export interface EntradaTeto {
  rendaConfiavel: number;
  fixas: number;
  variaveis: number;
  parcelasDivida: number;
  cartoes: CartaoCiclo[];
  compras: CompraCiclo[];
  agora: Date;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function nivelDoTeto(pct: number): NivelTeto {
  if (pct >= 1) return "ACIMA";
  if (pct >= 0.9) return "QUASE";
  if (pct >= 0.7) return "ATENCAO";
  return "OK";
}

/** null quando não dá pra calcular com honestidade (sem renda ou sem cartão com fechamento). */
export function calcularTetoCredito(e: EntradaTeto): TetoCredito | null {
  if (!(e.rendaConfiavel > 0)) return null;
  const comCiclo = e.cartoes.filter((c) => c.diaFechamento != null);
  if (comCiclo.length === 0) return null;

  let usado = 0;
  let faturasFechadas = 0;
  for (const cartao of comCiclo) {
    const compras = e.compras.filter((c) => c.cartaoId === cartao.id);
    const atual = mesFaturaDaCompra(e.agora, cartao.diaFechamento, cartao.diaVencimento);
    const idxAtual = atual.ano * 12 + atual.mes;
    const idxDe = (data: Date) => {
      const f = mesFaturaDaCompra(data, cartao.diaFechamento, cartao.diaVencimento);
      return f.ano * 12 + f.mes;
    };
    // Parcela futura de compra parcelada vira um COMPRA_CARTAO com data futura e
    // cai em fatura de ciclo POSTERIOR: não é do ciclo aberto nem de fatura
    // fechada, então fica fora desta conta (achado do revisor, 09/10/2026).
    usado += compras.filter((c) => idxDe(c.data) === idxAtual).reduce((s, c) => s + c.valor, 0);
    const deCiclosAnteriores = compras.filter((c) => idxDe(c.data) < idxAtual);
    faturasFechadas += comprometidoDoCartao(deCiclosAnteriores, cartao, e.agora);
  }
  usado = r2(usado);
  faturasFechadas = r2(faturasFechadas);

  const bruto = e.rendaConfiavel - e.fixas - e.variaveis - e.parcelasDivida - faturasFechadas;
  const teto = r2(Math.max(0, bruto));
  const restante = r2(Math.max(teto - usado, 0));
  const pct = teto > 0 ? usado / teto : usado > 0 ? 999 : 0;
  return { teto, usado, restante, pct, nivel: nivelDoTeto(pct), faturasFechadas };
}
