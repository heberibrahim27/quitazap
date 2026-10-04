// ─────────────────────────────────────────
// Leituras determinísticas compartilhadas (skills READ)
// ─────────────────────────────────────────
// Só lê o banco e devolve TEXTO com os números prontos. Usadas pelo agente
// Quita (via registro de skills) e disponíveis a qualquer canal.

import { prisma } from "@/lib/prisma";
import { anoMesAtualBrasil, calcularResumoFinanceiro, limitesDoMes } from "@/lib/financeiro/motor";

const FUSO = "America/Sao_Paulo";
const TIPOS_GASTO = ["DESPESA_FIXA", "DESPESA_VARIAVEL", "COMPRA_CARTAO"];

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}
function ddmm(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO }).format(d);
}

export async function resumoDoMes(clienteId: string, agora: Date): Promise<string> {
  const { ano, mes } = anoMesAtualBrasil(agora);
  const periodo = limitesDoMes(ano, mes);
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { rendaMensal: true } });
  const r = await calcularResumoFinanceiro({ clienteId, periodo, rendaMensalDeclarada: cliente?.rendaMensal ?? null });
  if (r.quantidadeLancamentos === 0) return "Ainda não há lançamentos registrados neste mês.";
  const t = r.totais;
  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: FUSO }).format(agora);
  const linhas = [
    `Resumo de ${nomeMes} (só o que está registrado no QuitaZAP):`,
    `Entradas: ${brl(t.receitas)}`,
    `Despesas fixas: ${brl(t.despesasFixas)}`,
    `Despesas variáveis: ${brl(t.despesasVariaveis)}`,
    `Compras no cartão: ${brl(t.cartoes)}`,
  ];
  if (t.emprestimos + t.outrasDividas > 0) linhas.push(`Parcelas de empréstimos e dívidas: ${brl(t.emprestimos + t.outrasDividas)}`);
  linhas.push(`Resultado do mês: ${brl(t.resultadoAntesInvestimentos)}`);
  if (t.investimentos !== 0) linhas.push(`Guardado em metas no mês: ${brl(t.investimentos)}`);
  if (r.previsao) linhas.push(`Dias restantes no mês: ${r.previsao.diasRestantes}`);
  return linhas.join("\n");
}

export async function orcamentoPorCategoria(clienteId: string, agora: Date): Promise<string> {
  const { ano, mes } = anoMesAtualBrasil(agora);
  const periodo = limitesDoMes(ano, mes);
  const [orcamentos, gastos] = await Promise.all([
    prisma.orcamentoCategoria.findMany({ where: { clienteId } }),
    prisma.lancamento.groupBy({
      by: ["categoria"],
      where: { clienteId, tipo: { in: TIPOS_GASTO }, data: { gte: periodo.inicio, lt: periodo.fim } },
      _sum: { valor: true },
    }),
  ]);
  if (orcamentos.length === 0) return "O cliente ainda não definiu orçamento por categoria.";
  const gastoDe = new Map(gastos.map((g) => [g.categoria ?? "", g._sum.valor ?? 0]));
  return orcamentos
    .map((o) => {
      const g = gastoDe.get(o.categoria) ?? 0;
      const pct = o.limiteMensal > 0 ? Math.round((g / o.limiteMensal) * 100) : 0;
      return `${o.categoria}: gastou ${brl(g)} de ${brl(o.limiteMensal)} (${pct}%)`;
    })
    .join("\n");
}

export async function compromissosProximos(clienteId: string, agora: Date): Promise<string> {
  const ate = new Date(agora.getTime() + 30 * 86_400_000);
  const inicioHoje = new Date(agora.getTime() - 12 * 3_600_000);
  const [tarefas, parcelas] = await Promise.all([
    prisma.tarefa.findMany({
      where: { clienteId, status: "PENDENTE", vencimento: { gte: inicioHoje, lte: ate } },
      orderBy: { vencimento: "asc" },
      take: 15,
    }),
    prisma.parcela.findMany({
      where: { status: "PENDENTE", vencimento: { gte: inicioHoje, lte: ate }, divida: { clienteId, status: { not: "CANCELADA" } } },
      include: { divida: { select: { credor: true } } },
      orderBy: { vencimento: "asc" },
      take: 15,
    }),
  ]);
  const itens: Array<{ quando: Date; texto: string }> = [
    ...tarefas.map((t) => ({ quando: t.vencimento as Date, texto: `${ddmm(t.vencimento as Date)} — ${t.descricao}${t.valor ? ` — ${brl(t.valor)}` : ""}` })),
    ...parcelas.map((p) => ({ quando: p.vencimento, texto: `${ddmm(p.vencimento)} — parcela ${p.numero} de ${p.divida.credor} — ${brl(p.valor)}` })),
  ].sort((a, b) => a.quando.getTime() - b.quando.getTime());
  if (itens.length === 0) return "Nenhum compromisso registrado para os próximos 30 dias.";
  return ["Compromissos dos próximos 30 dias:", ...itens.slice(0, 20).map((i) => i.texto)].join("\n");
}

export async function metasDoCliente(clienteId: string): Promise<string> {
  const metas = await prisma.meta.findMany({ where: { clienteId }, include: { depositos: { select: { valor: true } } } });
  if (metas.length === 0) return "O cliente ainda não criou nenhuma meta.";
  return metas
    .map((m) => {
      const guardado = m.depositos.reduce((s, d) => s + d.valor, 0);
      const pct = m.valorAlvo > 0 ? Math.round((guardado / m.valorAlvo) * 100) : 0;
      return `${m.nome}: guardou ${brl(guardado)} de ${brl(m.valorAlvo)} (${pct}%)`;
    })
    .join("\n");
}
