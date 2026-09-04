// ─────────────────────────────────────────
// QuitaZAP Controle — Motor Financeiro (implementação)
// ─────────────────────────────────────────
// Ver motor-contrato.ts pro contrato completo e o porquê de cada campo.
// Esta é a extração 1:1 do cálculo que vivia dentro do Dashboard
// (page.tsx) — mesmas fórmulas, mesmas queries, mesmos casos de borda
// (ex: parcelas de dívida só entram no total quando `comprometimento.calculavel`
// é true, igual ao comportamento de hoje) — pra zero regressão visual na
// primeira extração.

import { prisma } from "@/lib/prisma";
import { resumoPlanoSimplificado } from "@/lib/plano-pagamento-service";
import type {
  EntradaMotorFinanceiro,
  MediaMensal,
  OpcoesMotorFinanceiro,
  PeriodoFinanceiro,
  PorCartao,
  PorCategoria,
  ResumoFinanceiro,
  TotaisFinanceiros,
} from "./motor-contrato";

// Mesma âncora em Brasília usada no resto do Controle (fixo UTC-3, sem
// horário de verão desde 2019).
export function anoMesAtualBrasil(agora: Date): { ano: number; mes: number } {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(agora)
    .split("-")
    .map(Number);
  return { ano, mes };
}

export function limitesDoMes(ano: number, mes: number): PeriodoFinanceiro {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1, 3, 0, 0, 0));
  return { inicio, fim };
}

function mesAnteriorDe(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

// Núcleo do cálculo — soma os Lancamento do período e devolve os totais
// "de verdade" (sem parcela de dívida, que é buscada à parte). Extraído
// de page.tsx:130-150.
async function calcularTotaisBase(
  clienteId: string,
  periodo: PeriodoFinanceiro,
): Promise<{
  totais: Pick<TotaisFinanceiros, "receitas" | "despesasFixas" | "despesasVariaveis" | "cartoes" | "investimentos">;
  porCartao: PorCartao[];
  porCategoria: PorCategoria[];
  quantidadeLancamentos: number;
}> {
  const lancamentos = await prisma.lancamento.findMany({
    where: { clienteId, data: { gte: periodo.inicio, lt: periodo.fim } },
    include: { cartao: { select: { id: true, nome: true } } },
  });

  const porCartaoMap = new Map<string, PorCartao>();
  const porCategoriaMap = new Map<string, number>();
  let receitas = 0;
  let despesasFixas = 0;
  let despesasVariaveis = 0;
  let cartoes = 0;
  // Depósito/saque em meta (categoria "Metas", ver metas-actions.ts) não é
  // receita nem despesa "de verdade" — é dinheiro só mudando de lugar entre
  // a conta e o cofrinho. Fica de fora de receitas/despesas e vira seu
  // próprio total, líquido do período (depósitos − saques).
  let investimentos = 0;

  for (const l of lancamentos) {
    if (l.categoria === "Metas") {
      investimentos += l.tipo === "RECEITA" ? -l.valor : l.valor;
    } else if (l.tipo === "RECEITA") receitas += l.valor;
    else if (l.tipo === "DESPESA_FIXA") despesasFixas += l.valor;
    else if (l.tipo === "DESPESA_VARIAVEL") despesasVariaveis += l.valor;
    else if (l.tipo === "COMPRA_CARTAO") {
      cartoes += l.valor;
      if (l.cartao) {
        const atual = porCartaoMap.get(l.cartao.id);
        porCartaoMap.set(l.cartao.id, {
          cartaoId: l.cartao.id,
          nomeCartao: l.cartao.nome,
          total: (atual?.total ?? 0) + l.valor,
        });
      }
    }
    // RECEITA/DESPESA_FIXA/DESPESA_VARIAVEL/COMPRA_CARTAO com categoria
    // "Metas" já foram tratados acima; FATURA_FECHADA nunca entra em
    // nenhum total (marcador visual — ver comentário em schema.prisma).
    // porCategoria só soma despesa de verdade (mesma allowlist acima),
    // nunca RECEITA/Metas/FATURA_FECHADA.
    if (
      l.categoria &&
      l.categoria !== "Metas" &&
      (l.tipo === "DESPESA_FIXA" || l.tipo === "DESPESA_VARIAVEL" || l.tipo === "COMPRA_CARTAO")
    ) {
      porCategoriaMap.set(l.categoria, (porCategoriaMap.get(l.categoria) ?? 0) + l.valor);
    }
  }

  return {
    totais: { receitas, despesasFixas, despesasVariaveis, cartoes, investimentos },
    porCartao: Array.from(porCartaoMap.values()),
    porCategoria: Array.from(porCategoriaMap.entries()).map(([categoria, total]) => ({ categoria, total })),
    quantidadeLancamentos: lancamentos.length,
  };
}

export async function calcularResumoFinanceiro(
  entrada: EntradaMotorFinanceiro,
  opcoes?: OpcoesMotorFinanceiro,
): Promise<ResumoFinanceiro> {
  const { clienteId, periodo, rendaMensalDeclarada } = entrada;

  const { totais: base, porCartao, porCategoria, quantidadeLancamentos } = await calcularTotaisBase(clienteId, periodo);

  const totalSaidasSemDividas = base.despesasFixas + base.despesasVariaveis + base.cartoes + base.investimentos;

  // Renda = o que foi lançado como receita no período, com fallback pra
  // renda declarada no Perfil enquanto nada foi lançado ainda — um só
  // número de renda em todo o app (mesma regra de hoje).
  const rendaEfetiva = base.receitas > 0 ? base.receitas : (rendaMensalDeclarada ?? null);

  const resumoPlano = await resumoPlanoSimplificado({
    clienteId,
    rendaMensal: rendaEfetiva,
    totalDespesasMes: totalSaidasSemDividas,
    inicioMes: periodo.inicio,
    fimMes: periodo.fim,
  });

  // Empréstimos separados do resto das dívidas pra ter total próprio —
  // mesma parcela que já entra em `resumoPlano.totalComprometido`, só
  // reclassificada aqui. Só busca quando dá pra calcular o plano (mesmo
  // comportamento de hoje: sem renda cadastrada nem lançada, o Dashboard
  // não mostra empréstimos/outras dívidas do período).
  const parcelasDoPeriodo = resumoPlano.calculavel
    ? await prisma.parcela.findMany({
        where: { status: "PENDENTE", vencimento: { gte: periodo.inicio, lt: periodo.fim }, divida: { clienteId, status: "ATIVA" } },
        select: { valor: true, divida: { select: { tipo: true } } },
      })
    : [];
  let emprestimos = 0;
  let outrasDividas = 0;
  for (const p of parcelasDoPeriodo) {
    if (p.divida.tipo === "EMPRESTIMO") emprestimos += p.valor;
    else outrasDividas += p.valor;
  }

  const totalSaidasOperacionais = base.despesasFixas + base.despesasVariaveis + base.cartoes + emprestimos + outrasDividas;
  const resultadoAntesInvestimentos = base.receitas - totalSaidasOperacionais;
  const resultadoSemPlano = base.receitas - totalSaidasSemDividas;

  const percentualComprometido =
    resumoPlano.calculavel && resumoPlano.rendaDisponivel > 0
      ? Math.min(resumoPlano.totalComprometido / resumoPlano.rendaDisponivel, 1.5)
      : null;

  const resumo: ResumoFinanceiro = {
    clienteId,
    periodo,
    quantidadeLancamentos,
    totais: {
      receitas: base.receitas,
      despesasFixas: base.despesasFixas,
      despesasVariaveis: base.despesasVariaveis,
      cartoes: base.cartoes,
      emprestimos,
      outrasDividas,
      investimentos: base.investimentos,
      totalSaidasSemDividas,
      totalSaidasOperacionais,
      resultadoAntesInvestimentos,
      resultadoSemPlano,
    },
    porCartao,
    porCategoria,
    comprometimento: { ...resumoPlano, rendaEfetiva, percentualComprometido },
  };

  const agora = new Date();
  if (agora >= periodo.inicio && agora < periodo.fim) {
    const diasNoPeriodo = Math.round((periodo.fim.getTime() - periodo.inicio.getTime()) / 86_400_000);
    const diasDecorridos = Math.min(Math.floor((agora.getTime() - periodo.inicio.getTime()) / 86_400_000) + 1, diasNoPeriodo);
    resumo.previsao = { diasNoPeriodo, diasDecorridos, diasRestantes: Math.max(diasNoPeriodo - diasDecorridos, 0) };
  }

  if (opcoes?.comHistorico) {
    const { ano, mes } = anoMesAtualBrasil(periodo.inicio);
    const anterior = mesAnteriorDe(ano, mes);
    const periodoAnterior = limitesDoMes(anterior.ano, anterior.mes);
    const { totais: baseAnterior } = await calcularTotaisBase(clienteId, periodoAnterior);
    const totalSaidasSemDividasAnterior = baseAnterior.despesasFixas + baseAnterior.despesasVariaveis + baseAnterior.cartoes + baseAnterior.investimentos;
    // Histórico não refaz a consulta de parcelas de dívida (custo extra
    // pra um número que hoje nenhuma tela consome ainda) — empréstimos e
    // outras dívidas do período anterior ficam zerados por enquanto.
    resumo.historico = {
      periodoAnterior,
      totaisPeriodoAnterior: {
        receitas: baseAnterior.receitas,
        despesasFixas: baseAnterior.despesasFixas,
        despesasVariaveis: baseAnterior.despesasVariaveis,
        cartoes: baseAnterior.cartoes,
        emprestimos: 0,
        outrasDividas: 0,
        investimentos: baseAnterior.investimentos,
        totalSaidasSemDividas: totalSaidasSemDividasAnterior,
        totalSaidasOperacionais: baseAnterior.despesasFixas + baseAnterior.despesasVariaveis + baseAnterior.cartoes,
        resultadoAntesInvestimentos: baseAnterior.receitas - (baseAnterior.despesasFixas + baseAnterior.despesasVariaveis + baseAnterior.cartoes),
        resultadoSemPlano: baseAnterior.receitas - totalSaidasSemDividasAnterior,
      },
    };
  }

  return resumo;
}

/** Média mensal dos N meses ANTERIORES ao período de referência (o mês de
 * `periodoReferencia` nunca entra na média) — reaproveita `calcularTotaisBase`
 * uma vez por mês e faz a média, em vez de qualquer tela recalcular isso
 * por conta própria. Usada pela Saúde Financeira (ritmo de despesas
 * variáveis) e pela detecção de anomalia por categoria. */
export async function calcularMediaMensal(
  clienteId: string,
  periodoReferencia: PeriodoFinanceiro,
  quantidadeMeses: number,
): Promise<MediaMensal> {
  const { ano, mes } = anoMesAtualBrasil(periodoReferencia.inicio);
  let anoIter = ano;
  let mesIter = mes;

  let somaFixas = 0;
  let somaVariaveis = 0;
  let somaCartoes = 0;
  const somaPorCategoria = new Map<string, number>();

  for (let i = 0; i < quantidadeMeses; i++) {
    const anterior = mesAnteriorDe(anoIter, mesIter);
    anoIter = anterior.ano;
    mesIter = anterior.mes;
    const periodo = limitesDoMes(anoIter, mesIter);
    const { totais, porCategoria } = await calcularTotaisBase(clienteId, periodo);
    somaFixas += totais.despesasFixas;
    somaVariaveis += totais.despesasVariaveis;
    somaCartoes += totais.cartoes;
    for (const { categoria, total } of porCategoria) {
      somaPorCategoria.set(categoria, (somaPorCategoria.get(categoria) ?? 0) + total);
    }
  }

  const n = Math.max(quantidadeMeses, 1);
  return {
    quantidadeMeses,
    despesasFixas: somaFixas / n,
    despesasVariaveis: somaVariaveis / n,
    cartoes: somaCartoes / n,
    porCategoria: Array.from(somaPorCategoria.entries()).map(([categoria, total]) => ({ categoria, total: total / n })),
  };
}
