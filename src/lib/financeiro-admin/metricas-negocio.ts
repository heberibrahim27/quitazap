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
//
// Duas únicas queries (todos os clientes, todos os eventos Cakto) — o
// resto (série de 12 meses, churn, reativação) é calculado em memória.
// Versão anterior fazia ~14 queries "agora/mês anterior" mais 12 meses ×
// ~6 queries cada (incluindo uma sub-query por aprovação Cakto pra
// detectar reativação) — sob o pool de conexão pequeno da Supabase
// (connection_limit: 5), isso já causou timeout de pool em produção pelo
// menos uma vez (P2024, ver checagem de 2026-09-06). Clientes/eventos são
// tabelas pequenas nesse estágio do produto — buscar tudo de uma vez é
// mais barato que dezenas de round-trips, mesmo que cresça um pouco o
// volume de dado trafegado por request.

import { prisma } from "@/lib/prisma";
import { calcularStatusAssinaturaEm } from "@/lib/status-assinatura";
import { PRECO_MENSAL, limitesDoMes, mesAtualBrasil } from "./motor";

const NOMES_MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Cancelamento/reembolso/chargeback contam como "esse cliente já saiu
// antes" pra detectar reativação; só reembolso/chargeback aparecem na
// métrica visível de "problema" (cancelamento simples de assinatura não é
// necessariamente um problema de pagamento).
const STATUS_ENCERRAMENTO = new Set(["CANCELADA", "REEMBOLSADA", "CHARGEBACK"]);
const STATUS_PROBLEMA = new Set(["REEMBOLSADA", "CHARGEBACK"]);

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

interface ClienteResumo {
  criadoEm: Date;
  gratuito: boolean;
  assinaturaVenceEm: Date | null;
}

interface EventoResumo {
  clienteId: string | null;
  status: string;
  criadoEm: Date;
}

interface PontoInterno {
  mes: string;
  rotulo: string;
  ativos: number;
  novos: number;
  cancelados: number;
  mrr: number;
  eventosProblema: number;
  reativacoes: number;
}

/** Calcula um mês inteiro (ativos/novos/cancelados/eventos) a partir dos
 * arrays já carregados — nenhuma query aqui, só iteração em memória. Não
 * reconstrói o histórico exato de gratuito/status dentro de meses
 * passados (não existe snapshot dedicado) — é a melhor aproximação
 * possível a partir do estado atual de cada cliente, igual já era antes
 * desta otimização. */
function calcularPontoMensal(
  mes: string,
  corte: Date,
  clientes: ClienteResumo[],
  eventos: EventoResumo[],
  primeiroEncerramentoPorCliente: Map<string, Date>
): PontoInterno {
  const { inicio, fim } = limitesDoMes(mes);
  const hoje = new Date();

  let ativos = 0;
  let novos = 0;
  let cancelados = 0;
  for (const c of clientes) {
    if (c.criadoEm < corte && calcularStatusAssinaturaEm(c, corte) === "PAGO") ativos++;
    if (!c.gratuito && c.criadoEm >= inicio && c.criadoEm < fim) novos++;
    if (!c.gratuito && c.assinaturaVenceEm && c.assinaturaVenceEm >= inicio && c.assinaturaVenceEm < fim && c.assinaturaVenceEm < hoje) {
      cancelados++;
    }
  }

  let eventosProblema = 0;
  let reativacoes = 0;
  for (const e of eventos) {
    if (e.criadoEm < inicio || e.criadoEm >= fim) continue;
    if (STATUS_PROBLEMA.has(e.status)) eventosProblema++;
    if (e.status === "APROVADA" && e.clienteId) {
      const primeiroEncerramento = primeiroEncerramentoPorCliente.get(e.clienteId);
      if (primeiroEncerramento && primeiroEncerramento < e.criadoEm) reativacoes++;
    }
  }

  return { mes, rotulo: rotuloMes(mes), ativos, novos, cancelados, mrr: ativos * PRECO_MENSAL, eventosProblema, reativacoes };
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
  // 13 meses (não 12): o 13º só serve pra ter o denominador (ativos no
  // fim do mês retrasado) do churn do mês anterior — não entra na série
  // pública, que continua mostrando exatamente 12 meses.
  const meses13 = ultimosNMeses(mes, 13);

  // isTeste=false: cadastro de teste interno (Ibrahim, 2026-09-06) nunca
  // entra em nenhuma métrica histórica (ativos/novos/cancelados/MRR/churn)
  // — mesmo critério de whereStatusAssinatura em status-assinatura.ts.
  const [clientes, eventos] = await Promise.all([
    prisma.cliente.findMany({ where: { isTeste: false }, select: { criadoEm: true, gratuito: true, assinaturaVenceEm: true } }),
    prisma.eventoCakto.findMany({ select: { clienteId: true, status: true, criadoEm: true } }),
  ]);

  const primeiroEncerramentoPorCliente = new Map<string, Date>();
  for (const e of eventos) {
    if (!e.clienteId || !STATUS_ENCERRAMENTO.has(e.status)) continue;
    const atual = primeiroEncerramentoPorCliente.get(e.clienteId);
    if (!atual || e.criadoEm < atual) primeiroEncerramentoPorCliente.set(e.clienteId, e.criadoEm);
  }

  const hoje = new Date();
  const pontos = meses13.map((m, idx) => {
    const corte = idx === meses13.length - 1 ? hoje : limitesDoMes(m).fim;
    return calcularPontoMensal(m, corte, clientes, eventos, primeiroEncerramentoPorCliente);
  });

  const atual = pontos[pontos.length - 1];
  const anterior = pontos[pontos.length - 2];
  const retrasado = pontos[pontos.length - 3];

  const mrrAtual = atual.mrr;
  const mrrMesAnterior = anterior.mrr;
  const crescimentoMrrPct = mrrMesAnterior > 0 ? ((mrrAtual - mrrMesAnterior) / mrrMesAnterior) * 100 : null;

  const churnPct = anterior.ativos > 0 ? (atual.cancelados / anterior.ativos) * 100 : 0;
  const churnMesAnteriorPct = retrasado.ativos > 0 ? (anterior.cancelados / retrasado.ativos) * 100 : 0;
  const churnVariacaoPP = churnPct - churnMesAnteriorPct;

  const arpu = atual.ativos > 0 ? mrrAtual / atual.ativos : 0;
  const receitaPerdidaCancelamentos = atual.cancelados * PRECO_MENSAL;

  const alertas: string[] = [];
  if (churnVariacaoPP > 0.5) alertas.push(`Churn subiu ${churnVariacaoPP.toFixed(1)} p.p. vs mês anterior`);
  if (atual.eventosProblema > 0) alertas.push(`${atual.eventosProblema} reembolso(s)/chargeback(s) neste mês`);
  if (crescimentoMrrPct != null && crescimentoMrrPct > 0.5) alertas.push(`MRR cresceu ${crescimentoMrrPct.toFixed(1)}% no mês`);
  if (crescimentoMrrPct != null && crescimentoMrrPct < -0.5) alertas.push(`MRR caiu ${Math.abs(crescimentoMrrPct).toFixed(1)}% no mês`);

  const fimMesAnterior = limitesDoMes(mesAnt).fim;
  const inativosTotal = clientes.reduce((n, c) => n + (c.gratuito ? 1 : 0), 0);
  const inativosTotalMesAnterior = clientes.reduce((n, c) => n + (c.gratuito && c.criadoEm < fimMesAnterior ? 1 : 0), 0);

  const serieMensal: PontoMensal[] = pontos.slice(1).map((p) => ({
    mes: p.mes,
    rotulo: p.rotulo,
    mrr: p.mrr,
    ativos: p.ativos,
    novos: p.novos,
    cancelados: p.cancelados,
  }));

  return {
    mes,
    mrrAtual,
    mrrMesAnterior,
    crescimentoMrrPct,
    ativos: atual.ativos,
    ativosMesAnterior: anterior.ativos,
    churnPct,
    churnMesAnteriorPct,
    churnVariacaoPP,
    novosAssinantes: atual.novos,
    novosAssinantesMesAnterior: anterior.novos,
    cancelamentos: atual.cancelados,
    cancelamentosMesAnterior: anterior.cancelados,
    inativosTotal,
    inativosTotalMesAnterior,
    reativacoes: atual.reativacoes,
    reativacoesMesAnterior: anterior.reativacoes,
    eventosProblema: atual.eventosProblema,
    eventosProblemaMesAnterior: anterior.eventosProblema,
    arpu,
    receitaPerdidaCancelamentos,
    serieMensal,
    alertas,
  };
}
