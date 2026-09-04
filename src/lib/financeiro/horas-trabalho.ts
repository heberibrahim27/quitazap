// ─────────────────────────────────────────
// QuitaZAP Controle — "Compra em horas de trabalho" (Skill Analista)
// ─────────────────────────────────────────
// Converte um valor em quantas horas/dias úteis de trabalho ele custou,
// usando a mesma renda efetiva que o resto do Controle já usa (receita
// lançada no mês, com fallback pra renda declarada no Perfil — ver
// motor.ts). Não existe hoje um campo de "jornada mensal" cadastrado
// (nem semanal) — assume-se o divisor padrão da CLT pra jornada de 44h
// semanais (220h/mês, o mesmo usado no cálculo de hora extra, Súmula 431
// do TST), sempre deixado explícito na resposta pra nunca passar como se
// fosse um dado específico da pessoa.

import { calcularResumoFinanceiro, limitesDoMes, anoMesAtualBrasil } from "./motor";

export const HORAS_TRABALHO_MENSAL_PADRAO = 220;
export const HORAS_POR_DIA_UTIL_PADRAO = 8;

export interface ConversaoHorasTrabalho {
  valor: number;
  calculavel: boolean;
  rendaLiquidaMensal: number | null;
  horasTrabalhoMensalAssumidas: number;
  valorPorHora: number | null;
  horas: number | null;
  diasUteis: number | null;
}

export async function calcularHorasTrabalho(clienteId: string, valor: number): Promise<ConversaoHorasTrabalho> {
  const { ano, mes } = anoMesAtualBrasil(new Date());
  const periodo = limitesDoMes(ano, mes);
  const resumo = await calcularResumoFinanceiro({ clienteId, periodo });
  const rendaLiquidaMensal = resumo.comprometimento.rendaEfetiva;

  if (!rendaLiquidaMensal || rendaLiquidaMensal <= 0) {
    return {
      valor,
      calculavel: false,
      rendaLiquidaMensal: null,
      horasTrabalhoMensalAssumidas: HORAS_TRABALHO_MENSAL_PADRAO,
      valorPorHora: null,
      horas: null,
      diasUteis: null,
    };
  }

  const valorPorHora = rendaLiquidaMensal / HORAS_TRABALHO_MENSAL_PADRAO;
  const horas = valor / valorPorHora;
  const diasUteis = horas / HORAS_POR_DIA_UTIL_PADRAO;

  return {
    valor,
    calculavel: true,
    rendaLiquidaMensal,
    horasTrabalhoMensalAssumidas: HORAS_TRABALHO_MENSAL_PADRAO,
    valorPorHora,
    horas,
    diasUteis,
  };
}
