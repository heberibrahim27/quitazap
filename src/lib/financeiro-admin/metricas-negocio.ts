// ─────────────────────────────────────────
// QuitaZAP — Métricas de negócio (MRR, churn, movimento da base)
// ─────────────────────────────────────────
// Complementa o motor.ts (DRE: receita/custo/resultado do mês) com a
// visão de saúde do SaaS que o motor não cobre: crescimento de MRR,
// churn, novos/cancelamentos/reativações e a série histórica dos últimos
// 12 meses. Mesma regra de honestidade do motor: nunca inventa um número
// que não dá pra calcular com o dado que existe hoje.
//
// "Pagamentos pendentes/falhos" (pedido no escopo original) fica de fora
// por enquanto: classificarStatusCakto() (webhook Cakto) só distingue
// aprovação/reembolso/cancelamento/chargeback — evento de recusa/pendência
// de pagamento cai em DESCONHECIDO porque o nome exato desse evento no
// payload real da Cakto ainda não foi confirmado. Preferível não rotular
// isso como "falha" sem confirmar. Fica pra fase 2 quando o schema real de
// webhook da Cakto for validado.

import { prisma } from "@/lib/prisma";
import { whereStatusAssinatura } from "@/lib/status-assinatura";
import { PRECO_MENSAL, limitesDoMes, mesAtualBrasil } from "./motor";

const NOMES_MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function mesAnterior(mes: string): string {
  const [ano, mesNum] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mesNum - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rotuloMes(mes: string): string {
  const [ano, mesNum] = mes.split("-").map(Number);
  return `${NOMES_MES_CURTO[mesNum - 1]}/${String(ano).slice(2)}`;
}

function ultimosNMeses(mesFinal: string, n: number): string[] {
  const meses: string[] = [];
  let m = mesFinal;
  for (let i = 0; i < n; i++) {
    meses.unshift(m);
    m = mesAnterior(m);
  }
  return meses;
}

/** Quantos clientes pagantes estavam com assinatura ativa num instante —
 * fim do mês (histórico) ou agora (mês corrente ainda em andamento). Pra
 * "agora" reaproveita a mesma definição canônica de PAGO usada em
 * /clientes, /assinaturas e no motor DRE (status-assinatura.ts) — não dá
 * pra reconstruir o histórico exato de churn/reativação dentro de meses
 * passados sem uma tabela de snapshot dedicada, mas o "agora" tem que
 * bater com o resto do admin sempre. */
async function ativosNoInstante(corte: Date, agora: boolean): Promise<number> {
  if (agora) {
    return prisma.cliente.count({ where: whereStatusAssinatura("PAGO") });
  }
  return prisma.cliente.count({
    where: {
      gratuito: false,
      criadoEm: { lt: corte },
      OR: [{ assinaturaVenceEm: null }, { assinaturaVenceEm: { gte: corte } }],
    },
  });
}

async function movimentoDoMes(mes: string) {
  const { inicio, fim } = limitesDoMes(mes);
  const hoje = new Date();

  const [novos, canceladosCandidatos, inativosNovos, eventosAprovados, eventosProblema] = await Promise.all([
    prisma.cliente.count({ where: { gratuito: false, criadoEm: { gte: inicio, lt: fim } } }),
    prisma.cliente.findMany({
      where: { gratuito: false, assinaturaVenceEm: { gte: inicio, lt: fim } },
      select: { assinaturaVenceEm: true },
    }),
    prisma.cliente.count({ where: { gratuito: true, criadoEm: { gte: inicio, lt: fim } } }),
    prisma.eventoCakto.findMany({
      where: { status: "APROVADA", criadoEm: { gte: inicio, lt: fim }, clienteId: { not: null } },
      select: { clienteId: true, criadoEm: true },
    }),
    prisma.eventoCakto.count({
      where: { status: { in: ["REEMBOLSADA", "CHARGEBACK"] }, criadoEm: { gte: inicio, lt: fim } },
    }),
  ]);

  // Cancelado de fato = assinatura venceu neste mês E continua vencida hoje
  // (não renovou depois) — cobre tanto cancelamento explícito (webhook põe
  // assinaturaVenceEm = agora) quanto o cliente simplesmente não renovar.
  const cancelados = canceladosCandidatos.filter((c) => c.assinaturaVenceEm && c.assinaturaVenceEm < hoje).length;

  // Reativação = aprovação neste mês de um cliente que já tinha, antes
  // dela, pelo menos um evento de cancelamento/reembolso/chargeback.
  let reativacoes = 0;
  for (const evento of eventosAprovados) {
    if (!evento.clienteId) continue;
    const cancelamentoAnterior = await prisma.eventoCakto.findFirst({
      where: {
        clienteId: evento.clienteId,
        status: { in: ["CANCELADA", "REEMBOLSADA", "CHARGEBACK"] },
        criadoEm: { lt: evento.criadoEm },
      },
      select: { id: true },
    });
    if (cancelamentoAnterior) reativacoes++;
  }

  return { novos, cancelados, inativosNovos, eventosProblema, reativacoes };
}

export interface PontoMensal {
  [key: string]: string | number;
  mes: string;
  rotulo: string;
  mrr: number;
  ativos: number;
  novos: number;
  cancelados: number;
}

export interface MetricasNegocio {
  mes: string;
  mrrAtual: number;
  mrrMesAnterior: number;
  crescimentoMrrPct: number | null;
  ativos: number;
  ativosMesAnterior: number;
  churnPct: number;
  churnMesAnteriorPct: number;
  churnVariacaoPP: number;
  novosAssinantes: number;
  novosAssinantesMesAnterior: number;
  cancelamentos: number;
  cancelamentosMesAnterior: number;
  inativosTotal: number;
  inativosTotalMesAnterior: number;
  reativacoes: number;
  reativacoesMesAnterior: number;
  eventosProblema: number;
  eventosProblemaMesAnterior: number;
  arpu: number;
  receitaPerdidaCancelamentos: number;
  serieMensal: PontoMensal[];
  alertas: string[];
}

export async function calcularMetricasNegocio(mesRef?: string): Promise<MetricasNegocio> {
  const mes = mesRef ?? mesAtualBrasil();
  const mesAnt = mesAnterior(mes);
  const mesRetrasado = mesAnterior(mesAnt);
  const meses12 = ultimosNMeses(mes, 12);

  const [
    ativosAtual,
    ativosMesAnterior,
    ativosMesRetrasado,
    movAtual,
    movAnterior,
    inativosTotal,
    inativosTotalMesAnterior,
    serieMensal,
  ] = await Promise.all([
    ativosNoInstante(new Date(), true),
    ativosNoInstante(limitesDoMes(mesAnt).fim, false),
    ativosNoInstante(limitesDoMes(mesRetrasado).fim, false),
    movimentoDoMes(mes),
    movimentoDoMes(mesAnt),
    prisma.cliente.count({ where: { gratuito: true } }),
    prisma.cliente.count({ where: { gratuito: true, criadoEm: { lt: limitesDoMes(mesAnt).fim } } }),
    Promise.all(
      meses12.map(async (m, idx) => {
        const isUltimo = idx === meses12.length - 1;
        const corte = isUltimo ? new Date() : limitesDoMes(m).fim;
        const [ativos, mov] = await Promise.all([ativosNoInstante(corte, isUltimo), movimentoDoMes(m)]);
        return { mes: m, rotulo: rotuloMes(m), ativos, novos: mov.novos, cancelados: mov.cancelados, mrr: ativos * PRECO_MENSAL };
      })
    ),
  ]);

  const mrrAtual = ativosAtual * PRECO_MENSAL;
  const mrrMesAnterior = ativosMesAnterior * PRECO_MENSAL;
  const crescimentoMrrPct = mrrMesAnterior > 0 ? ((mrrAtual - mrrMesAnterior) / mrrMesAnterior) * 100 : null;

  const churnPct = ativosMesAnterior > 0 ? (movAtual.cancelados / ativosMesAnterior) * 100 : 0;
  const churnMesAnteriorPct = ativosMesRetrasado > 0 ? (movAnterior.cancelados / ativosMesRetrasado) * 100 : 0;
  const churnVariacaoPP = churnPct - churnMesAnteriorPct;

  const arpu = ativosAtual > 0 ? mrrAtual / ativosAtual : 0;
  const receitaPerdidaCancelamentos = movAtual.cancelados * PRECO_MENSAL;

  const alertas: string[] = [];
  if (churnVariacaoPP > 0.5) alertas.push(`Churn subiu ${churnVariacaoPP.toFixed(1)} p.p. vs mês anterior`);
  if (movAtual.eventosProblema > 0) alertas.push(`${movAtual.eventosProblema} reembolso(s)/chargeback(s) neste mês`);
  if (crescimentoMrrPct != null && crescimentoMrrPct > 0.5) alertas.push(`MRR cresceu ${crescimentoMrrPct.toFixed(1)}% no mês`);
  if (crescimentoMrrPct != null && crescimentoMrrPct < -0.5) alertas.push(`MRR caiu ${Math.abs(crescimentoMrrPct).toFixed(1)}% no mês`);

  return {
    mes,
    mrrAtual,
    mrrMesAnterior,
    crescimentoMrrPct,
    ativos: ativosAtual,
    ativosMesAnterior,
    churnPct,
    churnMesAnteriorPct,
    churnVariacaoPP,
    novosAssinantes: movAtual.novos,
    novosAssinantesMesAnterior: movAnterior.novos,
    cancelamentos: movAtual.cancelados,
    cancelamentosMesAnterior: movAnterior.cancelados,
    inativosTotal,
    inativosTotalMesAnterior,
    reativacoes: movAtual.reativacoes,
    reativacoesMesAnterior: movAnterior.reativacoes,
    eventosProblema: movAtual.eventosProblema,
    eventosProblemaMesAnterior: movAnterior.eventosProblema,
    arpu,
    receitaPerdidaCancelamentos,
    serieMensal,
    alertas,
  };
}
