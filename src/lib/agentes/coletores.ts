// ─────────────────────────────────────────
// Coletores por agente — percepção de cada agente sobre UM cliente
// ─────────────────────────────────────────
// Cada agente lê os dados que lhe interessam e devolve candidatos de alerta
// (detectores puros em alertas.ts / detectores-agentes.ts). Falha de um agente
// NUNCA derruba os outros: `coletarPorAgente` isola cada um e devolve o erro
// por agente. Leitura sequencial por cliente (pool de conexões do Postgres é
// pequeno — ver comentário em cartoes/page.tsx).

import { prisma } from "@/lib/prisma";
import { anoMesAtualBrasil, calcularResumoFinanceiro, limitesDoMes } from "@/lib/financeiro/motor";
import { calcularLimiteSeguro } from "@/lib/financeiro/limite-seguro";
import { comprometidoDoCartao, deslocarMes, resumirFaturasDoCartao } from "@/lib/financeiro/fatura-cartao";
import {
  detectarAnomalias,
  detectarFechamentoFatura,
  detectarFechamentoMes,
  detectarOrcamento,
  detectarProjecaoNegativa,
  proximoFechamento,
  type AgenteId,
  type CandidatoAlerta,
} from "./alertas";
import {
  detectarCompromissosDaSemana,
  detectarDividasAtrasadas,
  detectarFaturaFuturaPesada,
  detectarLancamentos,
  detectarLimiteCartao,
  detectarMetas,
  type Compromisso,
} from "./detectores-agentes";

const TIPOS_GASTO = ["DESPESA_FIXA", "DESPESA_VARIAVEL", "COMPRA_CARTAO"];
const FUSO = "America/Sao_Paulo";

interface Contexto {
  clienteId: string;
  agora: Date;
  ano: number;
  mes: number;
  periodKey: string;
  diaHoje: number;
  diasRestantes: number;
  semana: number; // 1 = segunda (Brasília)
}

function montarContexto(clienteId: string, agora: Date): Contexto {
  const { ano, mes } = anoMesAtualBrasil(agora);
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const [, , dia] = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(agora)
    .split("-")
    .map(Number);
  const semana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return {
    clienteId,
    agora,
    ano,
    mes,
    periodKey: `${ano}-${String(mes).padStart(2, "0")}`,
    diaHoje: dia,
    diasRestantes: Math.max(diasNoMes - dia, 0),
    semana,
  };
}

// ── Sentinela: orçamento, projeção, anomalia ─────────────────────────────

async function coletarSentinela(c: Contexto): Promise<CandidatoAlerta[]> {
  const periodo = limitesDoMes(c.ano, c.mes);
  const [orcamentos, gastosPorCategoria, limiteSeguro, insights] = await Promise.all([
    prisma.orcamentoCategoria.findMany({ where: { clienteId: c.clienteId } }),
    prisma.lancamento.groupBy({
      by: ["categoria"],
      where: { clienteId: c.clienteId, tipo: { in: TIPOS_GASTO }, data: { gte: periodo.inicio, lt: periodo.fim } },
      _sum: { valor: true },
    }),
    calcularLimiteSeguro(c.clienteId, c.agora).catch(() => null),
    prisma.insightDetectado.findMany({ where: { clienteId: c.clienteId, mes: c.periodKey, status: "SOMBRA" } }),
  ]);
  const gastoDe = new Map(gastosPorCategoria.map((g) => [g.categoria ?? "", g._sum.valor ?? 0]));
  const out: CandidatoAlerta[] = [];
  out.push(
    ...detectarOrcamento(
      orcamentos.map((o) => ({ categoria: o.categoria, limite: o.limiteMensal, gasto: gastoDe.get(o.categoria) ?? 0 })),
      { periodKey: c.periodKey, diasRestantes: c.diasRestantes }
    )
  );
  if (limiteSeguro) {
    out.push(
      ...detectarProjecaoNegativa(
        { saldoLivre: limiteSeguro.saldoLivre, semDadosSuficientes: limiteSeguro.semDadosSuficientes, diasRestantes: c.diasRestantes },
        { periodKey: c.periodKey }
      )
    );
  }
  // Anomalia: o InsightDetectado nasce em modo SOMBRA de propósito — o texto é
  // redigido por IA e o fundador revisa em /insights-sombra antes de liberar.
  // Só vira alerta com SENTINELA_ANOMALIA_ATIVA=true.
  const liberada = process.env.SENTINELA_ANOMALIA_ATIVA === "true";
  out.push(
    ...detectarAnomalias(
      (liberada ? insights : []).map((i) => ({
        id: i.id,
        categoria: i.categoria,
        mes: i.mes,
        totalMesAtual: i.totalMesAtual,
        mediaUltimosMeses: i.mediaUltimosMeses,
        multiplicador: i.multiplicador,
        textoGerado: i.textoGerado,
      }))
    )
  );
  return out;
}

// ── Cartões: fechamento, limite, próxima fatura ──────────────────────────

async function coletarCartoes(c: Contexto): Promise<CandidatoAlerta[]> {
  const cartoes = await prisma.cartao.findMany({ where: { clienteId: c.clienteId } });
  if (cartoes.length === 0) return [];
  const tresMesesAtras = deslocarMes(c.ano, c.mes, -3);
  const inicio = limitesDoMes(tresMesesAtras.ano, tresMesesAtras.mes).inicio;
  const compras = await prisma.lancamento.findMany({
    where: { clienteId: c.clienteId, tipo: "COMPRA_CARTAO", cartaoId: { in: cartoes.map((k) => k.id) }, data: { gte: inicio } },
    select: { cartaoId: true, valor: true, data: true },
  });
  const cliente = await prisma.cliente.findUnique({ where: { id: c.clienteId }, select: { rendaMensal: true } });

  const valorAberta = new Map<string, number>();
  const comprometido = new Map<string, number>();
  const faturasFuturas: Array<{ cartaoId: string; cartaoNome: string; rotulo: string; periodoFatura: string; valor: number }> = [];

  for (const k of cartoes) {
    const doCartao = compras.filter((l) => l.cartaoId === k.id);
    const resumo = resumirFaturasDoCartao({ nome: k.nome, diaFechamento: k.diaFechamento, diaVencimento: k.diaVencimento }, doCartao, c.agora);
    valorAberta.set(k.id, resumo.atual.valor);
    comprometido.set(k.id, comprometidoDoCartao(doCartao, { diaFechamento: k.diaFechamento, diaVencimento: k.diaVencimento }, c.agora));
    if (resumo.proxima && !resumo.semFechamento) {
      faturasFuturas.push({ cartaoId: k.id, cartaoNome: k.nome, rotulo: resumo.proxima.rotulo, periodoFatura: resumo.proxima.rotulo, valor: resumo.proxima.valor });
    }
  }

  const out: CandidatoAlerta[] = [];
  out.push(
    ...detectarFechamentoFatura(
      cartoes.map((k) => ({ id: k.id, nome: k.nome, diaFechamento: k.diaFechamento, valorFaturaAberta: valorAberta.get(k.id) })),
      c.agora
    )
  );
  out.push(...detectarLimiteCartao(cartoes.map((k) => ({ id: k.id, nome: k.nome, limite: k.limite, comprometido: comprometido.get(k.id) ?? 0 })), c.periodKey));
  out.push(...detectarFaturaFuturaPesada(faturasFuturas, cliente?.rendaMensal ?? null));
  return out;
}

// ── Compromissos: resumo semanal (segunda-feira) ─────────────────────────

async function coletarCompromissos(c: Contexto): Promise<CandidatoAlerta[]> {
  if (c.semana !== 1) return []; // só segunda-feira: nem consulta nos outros dias
  const ate = new Date(c.agora.getTime() + 7 * 86_400_000);
  const desde = new Date(c.agora.getTime() - 12 * 3_600_000);
  const [tarefas, parcelas] = await Promise.all([
    prisma.tarefa.findMany({ where: { clienteId: c.clienteId, status: "PENDENTE", vencimento: { gte: desde, lte: ate } }, take: 30 }),
    prisma.parcela.findMany({
      where: { status: "PENDENTE", vencimento: { gte: desde, lte: ate }, divida: { clienteId: c.clienteId, status: { not: "CANCELADA" } } },
      include: { divida: { select: { credor: true } } },
      take: 30,
    }),
  ]);
  const itens: Compromisso[] = [
    ...tarefas.map((t) => ({ descricao: t.descricao, data: t.vencimento as Date, valor: t.valor })),
    ...parcelas.map((p) => ({ descricao: `parcela ${p.numero} de ${p.divida.credor}`, data: p.vencimento, valor: p.valor })),
  ];
  return detectarCompromissosDaSemana(itens, c.agora);
}

// ── Metas: marcos e meta parada ──────────────────────────────────────────

async function coletarMetas(c: Contexto): Promise<CandidatoAlerta[]> {
  const metas = await prisma.meta.findMany({ where: { clienteId: c.clienteId }, include: { depositos: { select: { valor: true, data: true } } } });
  if (metas.length === 0) return [];
  return detectarMetas(
    metas.map((m) => {
      const guardado = m.depositos.reduce((s, d) => s + d.valor, 0);
      const ultimoDeposito = m.depositos.reduce<Date | null>((mx, d) => (!mx || d.data > mx ? d.data : mx), null);
      return { id: m.id, nome: m.nome, alvo: m.valorAlvo, guardado, ultimaAtividade: ultimoDeposito ?? m.criadoEm };
    }),
    c.agora
  );
}

// ── Dívidas: parcelas em atraso ──────────────────────────────────────────

async function coletarDividas(c: Contexto): Promise<CandidatoAlerta[]> {
  const inicioHoje = new Date(Date.UTC(c.ano, c.mes - 1, c.diaHoje, 3, 0, 0, 0)); // 00:00 em Brasília
  const parcelas = await prisma.parcela.findMany({
    where: {
      status: { in: ["PENDENTE", "VENCIDA"] },
      vencimento: { lt: inicioHoje },
      // consignado/desconto em folha já sai do salário: não é "atraso" do cliente
      divida: { clienteId: c.clienteId, status: { not: "CANCELADA" }, descontadoEmFolha: false },
    },
    include: { divida: { select: { credor: true } } },
    orderBy: { vencimento: "asc" },
    take: 50,
  });
  return detectarDividasAtrasadas(
    parcelas.map((p) => ({ credor: p.divida.credor, numero: p.numero, valor: p.valor, vencimento: p.vencimento })),
    c.agora
  );
}

// ── Lançamentos: parou de registrar / "Outros" alto ──────────────────────

async function coletarLancamentos(c: Contexto): Promise<CandidatoAlerta[]> {
  const desde = new Date(c.agora.getTime() - 60 * 86_400_000);
  const periodo = limitesDoMes(c.ano, c.mes);
  const [recentes, gastosMes] = await Promise.all([
    prisma.lancamento.findMany({
      where: { clienteId: c.clienteId, data: { gte: desde }, origem: { not: "RECORRENCIA" } },
      select: { data: true },
      orderBy: { data: "desc" },
      take: 400,
    }),
    prisma.lancamento.groupBy({
      by: ["categoria"],
      where: { clienteId: c.clienteId, tipo: { in: TIPOS_GASTO }, data: { gte: periodo.inicio, lt: periodo.fim } },
      _sum: { valor: true },
    }),
  ]);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO });
  const ultimoLancamento = recentes.length > 0 ? recentes[0].data : null;
  const diasDistintos = new Set<string>();
  if (ultimoLancamento) {
    const limiteInferior = ultimoLancamento.getTime() - 14 * 86_400_000;
    for (const l of recentes) if (l.data.getTime() > limiteInferior) diasDistintos.add(fmt.format(l.data));
  }
  const gastoMes = gastosMes.reduce((s, g) => s + (g._sum.valor ?? 0), 0);
  const gastoOutros = gastosMes.filter((g) => (g.categoria ?? "Outros") === "Outros").reduce((s, g) => s + (g._sum.valor ?? 0), 0);
  return detectarLancamentos(
    { ultimoLancamento, diasComRegistroAntesDaPausa: diasDistintos.size, gastoMes, gastoOutrosMes: gastoOutros },
    c.agora
  );
}

// ── Fechamento do mês (+ dica do Coach) ──────────────────────────────────

async function coletarFechamento(c: Contexto): Promise<CandidatoAlerta[]> {
  if (c.diaHoje > 3) return [];
  const anterior = deslocarMes(c.ano, c.mes, -1);
  const periodoAnterior = limitesDoMes(anterior.ano, anterior.mes);
  const cliente = await prisma.cliente.findUnique({ where: { id: c.clienteId }, select: { rendaMensal: true } });
  const resumo = await calcularResumoFinanceiro({ clienteId: c.clienteId, periodo: periodoAnterior, rendaMensalDeclarada: cliente?.rendaMensal ?? null }).catch(() => null);
  if (!resumo) return [];
  const top = [...resumo.porCategoria].sort((a, b) => b.total - a.total)[0] ?? null;
  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: FUSO }).format(periodoAnterior.inicio);
  return detectarFechamentoMes(
    {
      nomeMes,
      periodKey: `${anterior.ano}-${String(anterior.mes).padStart(2, "0")}`,
      receitas: resumo.totais.receitas,
      saidas: resumo.totais.totalSaidasOperacionais,
      resultado: resumo.totais.resultadoAntesInvestimentos,
      guardadoEmMetas: resumo.totais.investimentos,
      topCategoria: top,
      quantidadeLancamentos: resumo.quantidadeLancamentos,
    },
    c.diaHoje
  );
}

// ── Orquestração com isolamento ──────────────────────────────────────────

export const COLETORES: Record<AgenteId, (c: Contexto) => Promise<CandidatoAlerta[]>> = {
  sentinela: coletarSentinela,
  cartoes: coletarCartoes,
  compromissos: coletarCompromissos,
  metas: coletarMetas,
  dividas: coletarDividas,
  lancamentos: coletarLancamentos,
  fechamento: coletarFechamento,
};

export interface ColetaDoCliente {
  candidatos: CandidatoAlerta[];
  /** Erro por agente — um agente quebrado não impede os demais. */
  erros: Partial<Record<AgenteId, string>>;
}

export async function coletarPorAgente(
  clienteId: string,
  agora: Date,
  agentesPausados: AgenteId[] = []
): Promise<ColetaDoCliente> {
  const ctx = montarContexto(clienteId, agora);
  const resultado: ColetaDoCliente = { candidatos: [], erros: {} };
  for (const agente of Object.keys(COLETORES) as AgenteId[]) {
    if (agentesPausados.includes(agente)) continue;
    try {
      const candidatos = await COLETORES[agente](ctx);
      // todos os candidatos do ciclo compartilham o mesmo instante lógico
      for (const cand of candidatos) resultado.candidatos.push({ ...cand, asOf: agora });
    } catch (err) {
      resultado.erros[agente] = err instanceof Error ? err.message : String(err);
    }
  }
  return resultado;
}

// proximoFechamento é reexportado só pra manter um único ponto de importação nos testes de integração
export { proximoFechamento };
