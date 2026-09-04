// ─────────────────────────────────────────
// QuitaZAP Controle — "Compra em horas de trabalho" (Skill Analista)
// ─────────────────────────────────────────
// Converte um valor em quantas horas/dias úteis de trabalho ele custou,
// usando a mesma renda efetiva que o resto do Controle já usa (receita
// lançada no mês, com fallback pra renda declarada no Perfil — ver
// motor.ts). A jornada mensal é opcional (Cliente.jornadaMensalHoras,
// preenchível no Perfil) — quando não cadastrada, usa o divisor padrão
// da CLT pra jornada de 44h semanais (220h/mês, o mesmo usado no cálculo
// de hora extra, Súmula 431 do TST). `jornadaEhPadrao` sempre acompanha o
// resultado pra quem for formatar a resposta nunca esconder que é uma
// estimativa quando o cliente não personalizou.

import { prisma } from "@/lib/prisma";
import { calcularResumoFinanceiro, limitesDoMes, anoMesAtualBrasil } from "./motor";

export const HORAS_TRABALHO_MENSAL_PADRAO = 220;
export const HORAS_POR_DIA_UTIL_PADRAO = 8;

export interface ConversaoHorasTrabalho {
  valor: number;
  calculavel: boolean;
  rendaLiquidaMensal: number | null;
  horasTrabalhoMensalAssumidas: number;
  /** true = veio do padrão CLT (cliente não cadastrou jornada própria). */
  jornadaEhPadrao: boolean;
  valorPorHora: number | null;
  horas: number | null;
  diasUteis: number | null;
}

export async function calcularHorasTrabalho(clienteId: string, valor: number): Promise<ConversaoHorasTrabalho> {
  const { ano, mes } = anoMesAtualBrasil(new Date());
  const periodo = limitesDoMes(ano, mes);
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { jornadaMensalHoras: true, rendaMensal: true } });
  const resumo = await calcularResumoFinanceiro({ clienteId, periodo, rendaMensalDeclarada: cliente?.rendaMensal ?? null });
  const rendaLiquidaMensal = resumo.comprometimento.rendaEfetiva;
  const jornadaEhPadrao = !cliente?.jornadaMensalHoras || cliente.jornadaMensalHoras <= 0;
  const horasTrabalhoMensalAssumidas = jornadaEhPadrao ? HORAS_TRABALHO_MENSAL_PADRAO : (cliente!.jornadaMensalHoras as number);

  if (!rendaLiquidaMensal || rendaLiquidaMensal <= 0) {
    return {
      valor,
      calculavel: false,
      rendaLiquidaMensal: null,
      horasTrabalhoMensalAssumidas,
      jornadaEhPadrao,
      valorPorHora: null,
      horas: null,
      diasUteis: null,
    };
  }

  const valorPorHora = rendaLiquidaMensal / horasTrabalhoMensalAssumidas;
  const horas = valor / valorPorHora;
  const diasUteis = horas / HORAS_POR_DIA_UTIL_PADRAO;

  return {
    valor,
    calculavel: true,
    rendaLiquidaMensal,
    horasTrabalhoMensalAssumidas,
    jornadaEhPadrao,
    valorPorHora,
    horas,
    diasUteis,
  };
}
