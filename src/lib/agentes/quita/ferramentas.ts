// ─────────────────────────────────────────
// Ferramentas de LEITURA do agente Quita
// ─────────────────────────────────────────
// Cada ferramenta embrulha uma consulta determinística que já existe (ou lê
// o banco direto) e devolve TEXTO com os números prontos. Nenhuma altera
// dado. Escrita (desfazer, lembrete, depositar em meta) não é exposta ao
// LLM — continua em fluxo determinístico com confirmação.

import { prisma } from "@/lib/prisma";
import { anoMesAtualBrasil, calcularResumoFinanceiro, limitesDoMes } from "@/lib/financeiro/motor";
import { responderConsultaFatura } from "@/lib/financeiro/fatura-cartao-consulta";
import { responderConsultaFinanceira } from "@/lib/ia/consulta-financeira-resolver";
import { responderLimiteSeguro } from "@/lib/ia/limite-seguro-resolver";
import { responderRotaDividas } from "@/lib/ia/rota-dividas-resolver";
import { responderPlanoPagamento } from "@/lib/ia/plano-pagamento-resolver";
import { responderConsultaVazamentos } from "@/lib/ia/vazamentos-resolver";

const FUSO = "America/Sao_Paulo";
const TIPOS_GASTO = ["DESPESA_FIXA", "DESPESA_VARIAVEL", "COMPRA_CARTAO"];
const LIMITE_TEXTO = 2200;

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}
function ddmm(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO }).format(d);
}

const SEM_PARAMETROS = { type: "object", properties: {}, additionalProperties: false };

function def(name: string, description: string, parameters: Record<string, unknown> = SEM_PARAMETROS) {
  return { type: "function" as const, function: { name, description, parameters } };
}

export const DEFINICOES_FERRAMENTAS = [
  def("resumo_do_mes", "Entradas, despesas (fixas, variáveis, cartão), parcelas de dívidas, resultado do mês e valor guardado em metas, do mês atual."),
  def("limite_seguro", "Quanto o cliente pode gastar por dia até o fim do mês/próximo salário, e a sobra prevista."),
  def("faturas_dos_cartoes", "Faturas dos cartões pelo ciclo de fechamento (aberta, anterior, próxima), com datas de fechamento e vencimento."),
  def("orcamento_por_categoria", "Orçamento mensal por categoria: quanto já gastou do limite de cada categoria neste mês."),
  def("gastos_por_categoria", "Em quais categorias o cliente mais gasta neste mês."),
  def("compromissos_proximos", "Contas, lembretes de pagamento e parcelas de dívida que vencem nos próximos 30 dias."),
  def("metas", "Metas (cofrinhos) do cliente: quanto já guardou de cada uma."),
  def(
    "posso_gastar",
    "Única autoridade para a pergunta 'posso/consigo gastar R$ X?'. Devolve a conclusão calculada pelo sistema.",
    { type: "object", properties: { valor: { type: "number", description: "Valor em reais que o cliente quer gastar." } }, required: ["valor"], additionalProperties: false }
  ),
  def("rota_dividas", "Qual dívida pagar primeiro e como sair das dívidas."),
  def("plano_pagamento", "Plano de quais contas pagar neste mês e em que ordem."),
  def("assinaturas_recorrentes", "Assinaturas e gastos recorrentes que o cliente paga."),
];

export const NOMES_FERRAMENTAS = DEFINICOES_FERRAMENTAS.map((d) => d.function.name);

async function resumoDoMes(clienteId: string, agora: Date): Promise<string> {
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

async function orcamentoPorCategoria(clienteId: string, agora: Date): Promise<string> {
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

async function compromissosProximos(clienteId: string, agora: Date): Promise<string> {
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

async function metasDoCliente(clienteId: string): Promise<string> {
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

/** Executor de ferramentas pra um cliente. Só leitura. */
export function criarExecutorFerramentas(clienteId: string, gratuito: boolean, agora: Date = new Date()) {
  return async function executar(nome: string, args: Record<string, unknown>): Promise<string> {
    let texto: string;
    switch (nome) {
      case "resumo_do_mes":
        texto = await resumoDoMes(clienteId, agora);
        break;
      case "limite_seguro":
        texto = await responderLimiteSeguro(clienteId, gratuito);
        break;
      case "faturas_dos_cartoes":
        texto = await responderConsultaFatura(clienteId, "faturas dos cartoes", agora);
        break;
      case "orcamento_por_categoria":
        texto = await orcamentoPorCategoria(clienteId, agora);
        break;
      case "gastos_por_categoria":
        texto = await responderConsultaFinanceira("onde_gasto_mais", clienteId, "onde gasto mais", gratuito);
        break;
      case "compromissos_proximos":
        texto = await compromissosProximos(clienteId, agora);
        break;
      case "metas":
        texto = await metasDoCliente(clienteId);
        break;
      case "posso_gastar": {
        const valor = Number(args.valor);
        if (!Number.isFinite(valor) || valor <= 0) return "Informe o valor em reais (maior que zero).";
        texto = await responderConsultaFinanceira("posso_gastar", clienteId, `posso gastar ${String(valor).replace(".", ",")}`, gratuito);
        break;
      }
      case "rota_dividas":
        texto = await responderRotaDividas(clienteId, gratuito);
        break;
      case "plano_pagamento":
        texto = await responderPlanoPagamento(clienteId, gratuito);
        break;
      case "assinaturas_recorrentes":
        texto = await responderConsultaVazamentos(clienteId, gratuito);
        break;
      default:
        return "Ferramenta indisponível.";
    }
    return texto.length > LIMITE_TEXTO ? `${texto.slice(0, LIMITE_TEXTO)}…` : texto;
  };
}
