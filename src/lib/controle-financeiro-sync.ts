// ─────────────────────────────────────────
// QuitaZAP — sincroniza o "estado" do Controle Financeiro (legado, usado
// pelas mensagens de saldo/resumo do WhatsApp) com o motor central
// (src/lib/financeiro/motor.ts — o mesmo que o Dashboard usa).
// ─────────────────────────────────────────
// Achado ao vivo (Ibrahim, 08/09/2026): o "estado" do Controle Financeiro
// (EstadoControleFinanceiro, guardado como JSON dentro de
// BotSessao.dividasTemp) é um ACUMULADOR VITALÍCIO — rendaMensal,
// totalReceitasAvulsas, totalDespesasFixas e totalGastosSaldo somam desde a
// criação da conta (ou desde a última vez que alguém declarou renda) e
// NUNCA resetam por mês — o tipo não tem NENHUM campo de data. O Dashboard
// (calcularResumoFinanceiro) sempre recalculou do zero, só com os
// Lancamento do mês calendário atual.
//
// Resultado prático: o saldo que o bot falava no WhatsApp podia divergir
// muito do Dashboard. Caso real do Ibrahim: WhatsApp dizia "Saldo
// disponível: -R$30,00" (acumulando gastos de testes de sessões
// anteriores, nunca zerados) enquanto o Dashboard (correto) mostrava
// "Disponível no mês: R$593,00", só de Setembro/2026.
//
// Fix: antes de qualquer fluxo usar o estado carregado do histórico, os 4
// campos financeiros são substituídos pelos números frescos do MESMO motor
// central do Dashboard, sempre para o mês calendário atual — fonte única
// de verdade, recalculada a cada mensagem, nunca mais acumula erro nem
// mistura mês. O restante do estado (lista de despesas fixas, cartões
// configurados, confirmação pendente, último gasto pra "desfazer") continua
// vindo do JSON — ainda não tem equivalente no motor central e não tem
// semântica de "mês", então não é (nem deve ser) tocado aqui.
//
// Efeito colateral aceito conscientemente: corrigirRendaControle ("minha
// renda é X") só passa a valer, nas mensagens, enquanto NENHUMA receita
// tiver sido lançada no mês — exatamente a mesma regra que o Dashboard já
// usa (rendaEfetiva = receita lançada no mês, com fallback pra renda
// declarada só se não tiver nenhuma lançada ainda). Não é regressão, é
// unificação com o que o Dashboard já faz.

import { calcularResumoFinanceiro, anoMesAtualBrasil, limitesDoMes } from "@/lib/financeiro/motor";
import type { EstadoControleFinanceiro } from "./controle-financeiro-flow";

export async function sincronizarEstadoComMotorCentral(
  clienteId: string,
  estado: EstadoControleFinanceiro,
  rendaDeclarada?: number | null
): Promise<EstadoControleFinanceiro> {
  const { ano, mes } = anoMesAtualBrasil(new Date());
  const periodo = limitesDoMes(ano, mes);

  const resumo = await calcularResumoFinanceiro({
    clienteId,
    periodo,
    rendaMensalDeclarada: rendaDeclarada ?? null,
  });

  const { totais, comprometimento } = resumo;
  // Tudo que "compromete" a sobra do mês além das despesas fixas — mesma
  // composição do "Comprometido" do Dashboard (despesas variáveis + cartão
  // + parcelas de dívida do mês) — pra "Saldo disponível" do WhatsApp bater
  // com "Disponível no mês" do Dashboard.
  const totalGastosDoMes = totais.despesasVariaveis + totais.cartoes + totais.emprestimos + totais.outrasDividas;

  return {
    ...estado,
    rendaMensal: comprometimento.rendaEfetiva ?? 0,
    totalReceitasAvulsas: 0,
    totalDespesasFixas: totais.despesasFixas,
    totalGastosSaldo: totalGastosDoMes,
    // Cartão já entra em totalGastosDoMes (totais.cartoes, somado direto do
    // Lancamento) — zera as faturas manuais pra não descontar duas vezes em
    // calcularSaldoDisponivelAgoraControle/calcularSaldoEstimadoControle
    // (que também somam totalFaturasAbertasControle/totalFaturasFechadasControle).
    faturas: [],
    faturasFechadas: [],
  };
}
