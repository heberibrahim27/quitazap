// Acesso ao banco do teto de compras no crédito (a regra está em
// teto-credito.ts, pura e testada). Só LÊ.

import { prisma } from "@/lib/prisma";
import { calcularTetoCredito, type TetoCredito } from "./teto-credito";
import type { ResumoFinanceiro } from "./motor-contrato";

/** Janela de compras relevantes: um ciclo fechado + o aberto cabem em ~70 dias. */
const JANELA_COMPRAS_DIAS = 70;

export async function carregarTetoCredito(
  clienteId: string,
  resumo: ResumoFinanceiro,
  totalPrevisto: number,
  rendaDeclarada: number | null,
  agora: Date = new Date()
): Promise<TetoCredito | null> {
  // Renda confiável = o que já entrou + o que está previsto. Só cai na renda
  // declarada do Perfil quando não há nem uma coisa nem outra (evita contar 2x).
  const lancadaMaisPrevista = resumo.totais.receitas + totalPrevisto;
  const rendaConfiavel = lancadaMaisPrevista > 0 ? lancadaMaisPrevista : (rendaDeclarada ?? 0);

  const [cartoes, compras] = await Promise.all([
    prisma.cartao.findMany({ where: { clienteId }, select: { id: true, diaFechamento: true, diaVencimento: true } }),
    prisma.lancamento.findMany({
      where: { clienteId, tipo: "COMPRA_CARTAO", data: { gte: new Date(agora.getTime() - JANELA_COMPRAS_DIAS * 86_400_000) } },
      select: { cartaoId: true, valor: true, data: true },
    }),
  ]);

  return calcularTetoCredito({
    rendaConfiavel,
    fixas: resumo.totais.despesasFixas,
    variaveis: resumo.totais.despesasVariaveis,
    parcelasDivida: resumo.totais.emprestimos + resumo.totais.outrasDividas,
    cartoes,
    compras,
    agora,
  });
}
