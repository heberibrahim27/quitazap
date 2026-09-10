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

// Meia-noite de Brasília do dia de `data`, expressa em UTC — mesma âncora de
// limitesDoMes acima, só que no nível de DIA em vez de mês. Existe porque
// `new Date(); d.setHours(0,0,0,0)` (achado em plano-pagamento-motor.ts,
// bug de teste ao vivo 09/09/2026) usa o fuso do processo Node, que em
// produção (Vercel serverless) é UTC, não Brasília — durante 21h-23h59 de
// Brasília isso já contava como "amanhã" pra cálculo de dias até vencer,
// um dia fora de sincronia com todo o resto do Controle que já usa esta
// mesma âncora.
export function inicioDoDiaBrasil(data: Date): Date {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(data)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, 3, 0, 0, 0));
}

// Último dia válido do mês (1-12) — usado pra "clampar" um diaVencimento
// tipo 31 quando o mês de referência tem menos dias (fev, abr, jun, set,
// nov), em vez de deixar `new Date(ano, mes, dia)` estourar pro mês
// seguinte (mesmo bug de fundo do adicionarMeses em calculos.ts).
export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
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
  // divida.descontadoEmFolha=true = consignado, já refletido no salário
  // líquido que o cliente lança/declara como renda (ver schema.prisma) —
  // excluído aqui pra não abater a mesma dívida duas vezes do saldo.
  // Mesma correção de resumoPlanoSimplificado (plano-pagamento-service.ts,
  // achado ao vivo Ibrahim 09/09/2026): soma parcela PENDENTE com vencimento
  // no período OU parcela PAGA cujo pagamento caiu no período (via
  // atualizadoEm), pra não "esquecer" parcela já paga no cálculo do que já
  // comprometeu o saldo do mês. Ver comentário completo lá.
  const parcelasDoPeriodo = resumoPlano.calculavel
    ? await prisma.parcela.findMany({
        where: {
          divida: { clienteId, descontadoEmFolha: false, status: { not: "CANCELADA" } },
          OR: [
            { status: "PENDENTE", vencimento: { gte: periodo.inicio, lt: periodo.fim } },
            { status: "PAGA", atualizadoEm: { gte: periodo.inicio, lt: periodo.fim } },
          ],
        },
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

  // Clampa só embaixo (mínimo 0) — sem o Math.max(0, ...), um saque de
  // Meta maior que o resto das despesas do mês somadas deixa
  // totalComprometido negativo, e o Dashboard mostrava "-24% da renda
  // comprometida" (achado em teste ao vivo, 09/09/2026). Negativo não faz
  // sentido pra este indicador — o mínimo é "nada comprometido" (0%).
  // Sem teto em cima: achado real do Ibrahim (10/09/2026) — havia um
  // Math.min(..., 1.5) aqui que capava o VALOR em 150% mesmo quando o
  // comprometimento real era maior (ex.: 248% virava 150% na tela,
  // escondendo a gravidade real). Fazia sentido antes da barra do
  // Dashboard saber desenhar acima de 100% (ver page.tsx) — hoje ela já
  // reescala e mostra o texto "X% acima da renda prevista" pra qualquer
  // valor, então não precisa mais capar o número em si.
  const percentualComprometido =
    resumoPlano.calculavel && resumoPlano.rendaDisponivel > 0
      ? Math.max(resumoPlano.totalComprometido / resumoPlano.rendaDisponivel, 0)
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

  // Os N períodos anteriores só dependem de aritmética de data (nunca do
  // resultado de uma consulta) — calcula todos primeiro, depois dispara as
  // N consultas em paralelo, em vez de um `for` com `await` em série
  // (achado de performance: essa era uma das causas da demora ao trocar de
  // mês no MesFiltro, já que esta função roda em toda carga da Home).
  const periodos: PeriodoFinanceiro[] = [];
  let anoIter = ano;
  let mesIter = mes;
  for (let i = 0; i < quantidadeMeses; i++) {
    const anterior = mesAnteriorDe(anoIter, mesIter);
    anoIter = anterior.ano;
    mesIter = anterior.mes;
    periodos.push(limitesDoMes(anoIter, mesIter));
  }

  const resultadosPorMes = await Promise.all(periodos.map((periodo) => calcularTotaisBase(clienteId, periodo)));

  let somaFixas = 0;
  let somaVariaveis = 0;
  let somaCartoes = 0;
  const somaPorCategoria = new Map<string, number>();

  for (const { totais, porCategoria } of resultadosPorMes) {
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
