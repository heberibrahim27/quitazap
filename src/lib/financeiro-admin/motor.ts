// ─────────────────────────────────────────
// QuitaZAP — Motor DRE Admin (implementação)
// ─────────────────────────────────────────
// Ver motor-contrato.ts pro contrato e o porquê de cada campo.

import { prisma } from "@/lib/prisma";
import type { DreAdminResumo, FonteReceita, LinhaCusto } from "./motor-contrato";

// Preço Fundador vigente (R$14,90) — não o preço futuro do "QuitaZap
// Conectado" com Open Finance, que ainda não existe. Esse valor só é usado
// como estimativa quando não há receita observada de fato via Cakto (ver
// FonteReceita); ajuste aqui se o preço mudar no checkout.
export const PRECO_MENSAL = 14.90;
export const COMISSAO_CAKTO = 0.053; // 5,3% via PIX
// Câmbio fixo — mesmo valor hardcoded que já existia em /painel e
// /financeiro antes desta unificação. Trocar por cotação real (ex: API de
// câmbio) fica pra quando o restante da telemetria de custo também virar
// dado observado de verdade.
const USD_BRL = 5.7;

/** Mês corrente (YYYY-MM) em horário de Brasília — mesma âncora usada em
 * todo o Controle, só que aqui pro calendário de fechamento do negócio. */
export function mesAtualBrasil(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

function limitesDoMes(mes: string): { inicio: Date; fim: Date } {
  const [ano, mesNum] = mes.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mesNum - 1, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(mesNum === 12 ? ano + 1 : ano, mesNum === 12 ? 0 : mesNum, 1, 3, 0, 0, 0));
  return { inicio, fim };
}

export async function calcularDreAdmin(mesRef?: string): Promise<DreAdminResumo> {
  const mes = mesRef ?? mesAtualBrasil();
  const { inicio, fim } = limitesDoMes(mes);

  const [totalAssinantes, totalGratuitos, custosManuais, custoIAPagantesRaw, custoIAGratuitosRaw, eventosCakto] = await Promise.all([
    prisma.cliente.count({ where: { gratuito: false } }),
    prisma.cliente.count({ where: { gratuito: true } }),
    prisma.custoMensal.findMany({ where: { mes } }),
    prisma.logIA.aggregate({ _sum: { custoUSD: true }, where: { gratuito: false, criadoEm: { gte: inicio, lt: fim } } }),
    prisma.logIA.aggregate({ _sum: { custoUSD: true }, where: { gratuito: true, criadoEm: { gte: inicio, lt: fim } } }),
    prisma.eventoCakto.findMany({
      where: { criadoEm: { gte: inicio, lt: fim }, valorPago: { not: null } },
      select: { status: true, valorPago: true },
    }),
  ]);

  const custoIAPagantes = (custoIAPagantesRaw._sum.custoUSD ?? 0) * USD_BRL;
  const custoIAGratuitos = (custoIAGratuitosRaw._sum.custoUSD ?? 0) * USD_BRL;
  const custoIA = custoIAPagantes + custoIAGratuitos;
  const custoManual = custosManuais.reduce((soma, c) => soma + c.valor, 0);

  // Receita real: soma aprovações menos reembolso/chargeback do período,
  // só quando existir pelo menos um EventoCakto com valorPago (ver
  // extrairValorPago em api/webhook/cakto/route.ts — fica null até
  // confirmarmos o nome/unidade real do campo no payload da Cakto). Sem
  // isso ainda, cai no fallback de sempre: contagem de assinantes × preço
  // fixo — nunca finge que o fallback é dado observado.
  let receitaBruta: number;
  let receitaFonte: FonteReceita;
  if (eventosCakto.length > 0) {
    const aprovadas = eventosCakto.filter((e) => e.status === "APROVADA").reduce((s, e) => s + (e.valorPago ?? 0), 0);
    const estornadas = eventosCakto
      .filter((e) => e.status === "REEMBOLSADA" || e.status === "CHARGEBACK")
      .reduce((s, e) => s + (e.valorPago ?? 0), 0);
    receitaBruta = Math.max(0, aprovadas - estornadas);
    receitaFonte = "OBSERVADA";
  } else {
    receitaBruta = totalAssinantes * PRECO_MENSAL;
    receitaFonte = "ESTIMADA";
  }

  const comissaoCakto = receitaBruta * COMISSAO_CAKTO;
  const receitaLiquida = receitaBruta - comissaoCakto;
  const resultadoOperacional = receitaLiquida - custoIA - custoManual;
  const margem = receitaLiquida > 0 ? resultadoOperacional / receitaLiquida : null;

  const custos: LinhaCusto[] = [
    { categoria: "IA (uso real)", valor: custoIA, status: "OBSERVED" },
    { categoria: "Comissão Cakto", valor: comissaoCakto, status: receitaFonte === "OBSERVADA" ? "OBSERVED" : "ESTIMATED" },
    { categoria: "Custos manuais", valor: custoManual, status: "OBSERVED" },
    { categoria: "Vercel (hosting)", valor: 0, status: "ESTIMATED", observacao: "Credencial de billing pendente (Access Token com escopo de billing)" },
    { categoria: "Supabase (banco)", valor: 0, status: "ESTIMATED", observacao: "Sem API de billing exposta hoje — precisa virar estimativa por uso" },
  ];

  return {
    mes,
    totalAssinantes,
    totalGratuitos,
    receitaBruta,
    receitaFonte,
    comissaoCakto,
    receitaLiquida,
    custoIA,
    custoIAPagantes,
    custoIAGratuitos,
    custoManual,
    custos,
    resultadoOperacional,
    margem,
  };
}
