import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { calcularResumoFinanceiro, calcularMediaMensal } from "@/lib/financeiro/motor";
import { diasCalendarioBrasil } from "@/lib/financeiro/dias-brasil";
import { calcularSaudeFinanceira } from "@/lib/financeiro/saude-financeira";
import { SaudeFinanceiraCard } from "./SaudeFinanceiraCard";
import { calcularLimiteSeguro } from "@/lib/financeiro/limite-seguro";
import { LimiteSeguroCard } from "./LimiteSeguroCard";
import { gradienteDoCartao } from "@/lib/cartoes-conhecidos";
import { ValorAutoAjustavel } from "./ValorAutoAjustavel";
import { MesSwipe } from "./MesSwipe";
import { MesFiltro } from "./MesFiltro";
import { AbaResumo } from "./AbaResumo";
import { AbasHome } from "./AbasHome";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const ROTULO_TIPO_LANCAMENTO: Record<string, string> = {
  RECEITA: "Receita",
  DESPESA_FIXA: "Despesa fixa",
  DESPESA_VARIAVEL: "Despesa variável",
  COMPRA_CARTAO: "Compra no cartão",
  FATURA_FECHADA: "Fatura fechada",
};

// Cor e ícone de cada linha de saída do Resumo (pilha de composição + lista).
const COR_LINHA_RESUMO: Record<string, string> = {
  "Despesas fixas": "#1E63E9",
  "Desp. variáveis": "#17B4D8",
  "Cartões": "#7C5CFF",
  "Empréstimos": "#F08A00",
  "Outras dívidas": "#E23B5C",
};
const ICONE_LINHA_RESUMO: Record<string, React.ReactNode> = {
  fixa: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11L12 4l8 7" /><path d="M6 9.5V20a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1V9.5" /></svg>,
  variavel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.7 12.5h9.8l2.1-8H6.4" /></svg>,
  cartao: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>,
  divida: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>,
};

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];


// Ano/mês corrente em horário de Brasília (fixo UTC-3, sem horário de
// verão desde 2019) — mesma convenção já usada no cron de tarefas.
function anoMesAtualBrasil(agora: Date): { ano: number; mes: number } {
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

// Início/fim de um mês (meia-noite de Brasília do dia 1 até meia-noite de
// Brasília do dia 1 do mês seguinte) — mesma âncora usada em todo o app
// pra "dia X em Brasília" não virar o dia errado em UTC.
function limitesDoMes(ano: number, mes: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1, 3, 0, 0, 0));
  return { inicio, fim };
}

function paramMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function diasAte(data: Date, hoje: Date): number {
  return diasCalendarioBrasil(data, hoje);
}

export default async function MinhaContaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[] }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { mes: mesParamBruto } = await searchParams;
  // Next.js entrega string[] se a query tiver "?mes=" repetido — usa só o
  // primeiro valor nesse caso, em vez de deixar o .match() quebrar a página.
  const mesParam = Array.isArray(mesParamBruto) ? mesParamBruto[0] : mesParamBruto;
  const { ano: anoAtual, mes: mesAtualNum } = anoMesAtualBrasil(new Date());

  let ano = anoAtual;
  let mes = mesAtualNum;
  const match = mesParam?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const anoInformado = Number(match[1]);
    const mesInformado = Number(match[2]);
    // Ano mínimo 2000: evita o comportamento legado do JS Date, que trata
    // ano de 0 a 99 como 1900+ano (ex: Date.UTC(2, ...) vira o ano 1902).
    if (anoInformado >= 2000 && anoInformado <= 2100 && mesInformado >= 1 && mesInformado <= 12) {
      ano = anoInformado;
      mes = mesInformado;
    }
  }

  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(ano, mes);
  const ehMesAtual = ano === anoAtual && mes === mesAtualNum;
  const mesAnterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const mesSeguinte = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };

  const [dividas, tarefasPendentes, cartoes, ultimosLancamentos, agregadoMetas, agregadoDepositos, resumoFinanceiro, mediaMensal] = await Promise.all([
    prisma.divida.findMany({
      where: { clienteId: cliente.id, status: "ATIVA" },
      orderBy: [{ prioridade: "desc" }, { criadoEm: "asc" }],
    }),
    prisma.tarefa.findMany({
      where: { clienteId: cliente.id, status: "PENDENTE" },
      orderBy: [{ vencimento: "asc" }, { criadoEm: "asc" }],
    }),
    prisma.cartao.findMany({ where: { clienteId: cliente.id }, orderBy: { nome: "asc" } }),
    // Só o que já aconteceu (até o fim do mês atual) — sem esse corte, uma
    // parcela futura de compra parcelada no cartão (datada pros próximos
    // meses) aparecia aqui como se fosse o lançamento mais recente.
    prisma.lancamento.findMany({
      where: { clienteId: cliente.id, data: { lt: fimMes } },
      orderBy: { data: "desc" },
      take: 3,
      include: { cartao: { select: { nome: true } } },
    }),
    // Metas (cofrinhos): soma dos alvos e do já guardado, pra hero mostrar
    // o progresso geral de todos os cofrinhos juntos numa barra só.
    prisma.meta.aggregate({ where: { clienteId: cliente.id }, _sum: { valorAlvo: true } }),
    prisma.depositoMeta.aggregate({ where: { meta: { clienteId: cliente.id } }, _sum: { valor: true } }),
    // Motor financeiro central (src/lib/financeiro/motor.ts) — único lugar
    // autorizado a somar Lancamento/Parcela. Ver motor-contrato.ts.
    calcularResumoFinanceiro({ clienteId: cliente.id, periodo: { inicio: inicioMes, fim: fimMes }, rendaMensalDeclarada: cliente.rendaMensal }),
    // Média dos últimos 3 meses (mesmo motor) — só pro componente "ritmo"
    // da Saúde Financeira, ver src/lib/financeiro/saude-financeira.ts.
    calcularMediaMensal(cliente.id, { inicio: inicioMes, fim: fimMes }, 3),
  ]);

  // "Até o próximo salário" (src/lib/financeiro/limite-seguro.ts) é sempre
  // sobre o mês ATUAL de verdade — só busca quando o cliente está olhando o
  // mês corrente, senão não faz sentido nenhum mostrar. Fora do Promise.all
  // acima de propósito (achado de performance): quando é o mês atual, o
  // período é o mesmo de `resumoFinanceiro`, então passa ele pronto em vez
  // de deixar calcularLimiteSeguro recalcular a mesma cadeia de consultas
  // (totais + plano de pagamento + parcelas) uma segunda vez no mesmo
  // request — essa duplicação era uma das causas da demora ao trocar de
  // mês.
  const limiteSeguro = ehMesAtual ? await calcularLimiteSeguro(cliente.id, new Date(), resumoFinanceiro) : null;

  // Itens dos resumos das abas (Receita / Despesas / Metas). Vêm todos de uma
  // vez porque a troca de aba é só no cliente, sem nova requisição.
  // Janela dos 7 dias do mini-gráfico de "Últimos lançamentos": termina hoje no
  // mês corrente, ou no último dia do mês que está sendo visto.
  const fimJanela = ehMesAtual ? new Date() : new Date(fimMes.getTime() - 1);
  const fmtDiaBR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  const diasJanela = Array.from({ length: 7 }, (_, k) => fmtDiaBR.format(new Date(fimJanela.getTime() - (6 - k) * 86400000)));
  const [anoJ, mesJ, diaJ] = diasJanela[0].split("-").map(Number);
  const inicioJanela = new Date(Date.UTC(anoJ, mesJ - 1, diaJ, 3, 0, 0, 0));
  const { inicio: inicioAnt, fim: fimAnt } = limitesDoMes(mesAnterior.ano, mesAnterior.mes);
  const [maioresDespesas, receitasDoMes, metasResumo, gastosJanela, despesasAnt, receitasAnt] = await Promise.all([
    prisma.lancamento.findMany({
      where: {
        clienteId: cliente.id,
        tipo: { in: ["DESPESA_FIXA", "DESPESA_VARIAVEL"] },
        data: { gte: inicioMes, lt: fimMes },
        // Depósito em meta (categoria "Metas") não é despesa — mesmo corte da página de despesas.
        OR: [{ categoria: null }, { categoria: { not: "Metas" } }],
      },
      orderBy: { valor: "desc" },
      take: 5,
    }),
    prisma.lancamento.findMany({
      where: {
        clienteId: cliente.id,
        tipo: "RECEITA",
        data: { gte: inicioMes, lt: fimMes },
        // Saque de meta é dinheiro voltando pro disponível, não renda — mesmo corte da página de receitas.
        OR: [{ categoria: null }, { categoria: { not: "Metas" } }],
      },
      orderBy: { valor: "desc" },
    }),
    prisma.meta.findMany({
      where: { clienteId: cliente.id },
      include: { depositos: { select: { valor: true } } },
      orderBy: { criadoEm: "asc" },
      take: 6,
    }),
    prisma.lancamento.findMany({
      where: {
        clienteId: cliente.id,
        tipo: { in: ["DESPESA_FIXA", "DESPESA_VARIAVEL", "COMPRA_CARTAO"] },
        data: { gte: inicioJanela, lt: new Date(fimJanela.getTime() + 1) },
        OR: [{ categoria: null }, { categoria: { not: "Metas" } }],
      },
      select: { data: true, valor: true },
    }),
    // Totais do mês anterior, só pra comparação ("↑ 12% vs. mês anterior").
    prisma.lancamento.aggregate({
      _sum: { valor: true },
      where: {
        clienteId: cliente.id,
        tipo: { in: ["DESPESA_FIXA", "DESPESA_VARIAVEL"] },
        data: { gte: inicioAnt, lt: fimAnt },
        OR: [{ categoria: null }, { categoria: { not: "Metas" } }],
      },
    }),
    prisma.lancamento.aggregate({
      _sum: { valor: true },
      where: {
        clienteId: cliente.id,
        tipo: "RECEITA",
        data: { gte: inicioAnt, lt: fimAnt },
        OR: [{ categoria: null }, { categoria: { not: "Metas" } }],
      },
    }),
  ]);
  // Comparação com o mês anterior; null quando não há base (mês anterior zerado).
  const compararComAnterior = (atual: number, anterior: number | null | undefined, menosEhBom: boolean) => {
    if (!anterior || anterior <= 0) return null;
    const variacao = ((atual - anterior) / anterior) * 100;
    const pct = Math.round(Math.abs(variacao));
    if (pct === 0) return { texto: "Igual ao mês anterior", bom: true };
    return { texto: `${variacao > 0 ? "↑" : "↓"} ${pct}% vs. mês anterior`, bom: menosEhBom ? variacao < 0 : variacao > 0 };
  };
  const gastoPorDia = diasJanela.map((dia) => ({
    dia,
    letra: new Intl.DateTimeFormat("pt-BR", { weekday: "narrow", timeZone: "America/Sao_Paulo" }).format(new Date(`${dia}T15:00:00Z`)),
    total: gastosJanela.filter((g) => fmtDiaBR.format(g.data) === dia).reduce((soma, g) => soma + g.valor, 0),
  }));
  const maiorGastoDia = Math.max(...gastoPorDia.map((d) => d.total), 1);
  const totalJanela = gastoPorDia.reduce((soma, d) => soma + d.total, 0);
  const maioresReceitas = receitasDoMes.slice(0, 5);

  // Aliases 1:1 com os nomes que o JSX abaixo já usava antes da extração
  // pro motor — mantidos de propósito pra essa primeira extração não
  // exigir tocar em nenhuma linha depois daqui.
  const { totais, comprometimento: resumoPlano, porCartao, quantidadeLancamentos } = resumoFinanceiro;
  const totalReceitasMes = totais.receitas;
  const totalFixasMes = totais.despesasFixas;
  const totalVariaveisMes = totais.despesasVariaveis;
  const totalCartaoMes = totais.cartoes;
  const totalMetasMes = totais.investimentos;
  const totalEmprestimosMes = totais.emprestimos;
  const totalOutrasDividasMes = totais.outrasDividas;
  const totalSaidasMes = totais.totalSaidasSemDividas;
  const resultadoMes = totais.resultadoSemPlano;
  const rendaEfetiva = resumoPlano.rendaEfetiva;
  const percentualComprometido = resumoPlano.percentualComprometido;
  const gastoCartaoMes = new Map(porCartao.map((c) => [c.nomeCartao, c.total]));

  // Hero: quando dá pra calcular o plano (renda cadastrada), mostra o
  // resultado já projetado com parcelas de dívida do mês; sem renda
  // cadastrada, cai pro simples entradas−saídas (sem o anel de %).
  const heroDisponivel = resumoPlano.calculavel ? resumoPlano.saldoProjetado : resultadoMes;
  const semDadosNoMes = !resumoPlano.calculavel && quantidadeLancamentos === 0;
  const heroComprometido = resumoPlano.calculavel ? resumoPlano.totalComprometido : totalSaidasMes;

  const totalAlvoMetas = agregadoMetas._sum.valorAlvo ?? 0;
  const totalGuardadoMetas = agregadoDepositos._sum.valor ?? 0;
  const percentualMetas = totalAlvoMetas > 0 ? Math.min(totalGuardadoMetas / totalAlvoMetas, 1) : null;

  const nomeMes = NOMES_MES[mes - 1];
  // Investimentos (Metas) fica de fora da lista principal — não é uma
  // despesa operacional junto de Despesas/Cartões/Dívidas, é um aporte,
  // deduzido só depois num segundo passo (ver JSX): Receitas menos
  // despesas e dívidas primeiro dá o "Resultado antes de investimentos";
  // só depois de tirar o aporte é que chega na sobra livre de verdade.
  // Soma só das despesas/dívidas do mês (sem Receita nem Investimentos) —
  // base de comparação ENTRE as barras de saída: cada uma reflete sua
  // participação dentro do total gasto, não uma fração da receita (que é
  // uma grandeza diferente e não diz nada sobre o peso relativo entre
  // categorias de despesa entre si).
  const somaDespesasMes = totalFixasMes + totalVariaveisMes + totalCartaoMes + totalEmprestimosMes + totalOutrasDividasMes;
  const baseDespesas = Math.max(somaDespesasMes, 1);
  const resumoDoMes = [
    { rotulo: "Receitas", valor: totalReceitasMes, icone: "receita", classe: "green", base: Math.max(totalReceitasMes, 1) },
    { rotulo: "Despesas fixas", valor: totalFixasMes, icone: "fixa", classe: "blue", base: baseDespesas },
    { rotulo: "Desp. variáveis", valor: totalVariaveisMes, icone: "variavel", classe: "cyan", base: baseDespesas },
    { rotulo: "Cartões", valor: totalCartaoMes, icone: "cartao", classe: "blue", base: baseDespesas },
    { rotulo: "Empréstimos", valor: totalEmprestimosMes, icone: "divida", classe: "blue", base: baseDespesas },
    { rotulo: "Outras dívidas", valor: totalOutrasDividasMes, icone: "divida", classe: "blue", base: baseDespesas },
  ].filter((linha) => linha.valor > 0);
  // Saídas do Resumo (sem a linha de Receitas, que vira o bloco "Entradas").
  const linhasSaida = resumoDoMes
    .filter((linha) => linha.rotulo !== "Receitas")
    .map((linha) => ({ ...linha, cor: COR_LINHA_RESUMO[linha.rotulo] ?? "#1E63E9" }));
  // Investimentos não é despesa (é aporte, ver comentário acima) — mantém
  // referência própria, relativa à Receita.
  const baseInvestimentos = Math.max(totalReceitasMes, 1);
  // totalSaidasOperacionais/resultadoAntesInvestimentos já vêm prontos do
  // motor (mesma fórmula de antes) — sem resomar `resumoDoMes` aqui.
  const totalSaidasOperacionais = totais.totalSaidasOperacionais;
  const resultadoAntesInvestimentos = totais.resultadoAntesInvestimentos;
  // totalMetasMes pode ser negativo (mês em que se sacou mais do que se
  // guardou) — nesse caso o aporte "negativo" devolve dinheiro pra sobra,
  // e ainda faz sentido mostrar a linha.
  const temInvestimentosNoMes = totalMetasMes !== 0;

  const todasEmAtraso = dividas.filter((d) => d.emAtraso);
  const dividasEmAtraso = todasEmAtraso.slice(0, 3);
  const totalEmAtraso = todasEmAtraso.reduce((soma, d) => soma + (d.valorTotal - d.valorPago), 0);

  // Saúde financeira (src/lib/financeiro/saude-financeira.ts) — score
  // determinístico só a partir do que o motor já calculou acima + a média
  // de 3 meses buscada junto no Promise.all. Só faz sentido mostrar
  // quando já existe algum lançamento no mês (mesmo guard do Resumo).
  const saude = quantidadeLancamentos > 0
    ? calcularSaudeFinanceira({
        totais: { despesasVariaveis: totalVariaveisMes, receitas: totalReceitasMes, resultadoSemPlano: resultadoMes },
        comprometimento: {
          calculavel: resumoPlano.calculavel,
          percentualComprometido,
          saldoProjetado: resumoPlano.saldoProjetado,
          rendaEfetiva,
        },
        mediaDespesasVariaveis: mediaMensal.despesasVariaveis,
        temDividaEmAtraso: dividasEmAtraso.length > 0,
      })
    : null;

  // Histórico do score (SaudeFinanceiraLog) — 1 registro por dia, versão da
  // fórmula gravada junto (ver saude-financeira-contrato.ts). Persistência
  // é só auditoria/histórico: nunca deve derrubar o carregamento da Home.
  if (saude && ehMesAtual) {
    const diaBrasil = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const componentesJson = JSON.parse(JSON.stringify(saude.componentes));
    try {
      await prisma.saudeFinanceiraLog.upsert({
        where: { clienteId_dia: { clienteId: cliente.id, dia: diaBrasil } },
        create: {
          clienteId: cliente.id,
          dia: diaBrasil,
          versaoFormula: saude.versaoFormula,
          score: saude.score,
          classificacao: saude.classificacao,
          dadosInsuficientes: saude.dadosInsuficientes,
          componentes: componentesJson,
        },
        update: {
          versaoFormula: saude.versaoFormula,
          score: saude.score,
          classificacao: saude.classificacao,
          dadosInsuficientes: saude.dadosInsuficientes,
          componentes: componentesJson,
        },
      });
    } catch (err) {
      console.error("[SaudeFinanceiraLog] Erro ao gravar histórico:", err);
    }
  }

  const hoje = new Date();
  const compromissosComData = tarefasPendentes.filter((t) => t.vencimento != null);
  const proximosCompromissos = compromissosComData.slice(0, 3);
  const compromissosAtrasados = compromissosComData.filter((t) => diasAte(t.vencimento as Date, hoje) < 0).length;
  const totalCompromissos = compromissosComData.reduce((soma, t) => soma + (t.valor ?? 0), 0);
  const fmtDiaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });

  // % da renda comprometida (hero): acima de 100% vira alerta (cor + aviso).
  const pctComprometida = percentualComprometido != null ? percentualComprometido * 100 : null;
  const acimaDoLimite = pctComprometida != null && pctComprometida > 100;

  const mesNaUrl = ehMesAtual ? null : paramMes(ano, mes);
  // Dias até o próximo vencimento de cada fatura (cartões com dia de vencimento).
  const diaHojeBrasil = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(8, 10));
  const diasNoMesHoje = new Date(anoAtual, mesAtualNum, 0).getDate();
  const diasParaVencer = (diaVenc: number) => (diaVenc >= diaHojeBrasil ? diaVenc - diaHojeBrasil : diasNoMesHoje - diaHojeBrasil + diaVenc);
  const maiorGastoCartao = Math.max(...cartoes.map((c) => gastoCartaoMes.get(c.nome) ?? 0), 1);
  const sufixoMesPagina = `?mes=${paramMes(ano, mes)}`;

  const heroShell = (
    <div className="hero-shell">
      <span className="hero-ring" aria-hidden="true" />
      {/* Ilustração decorativa (não é dado real): dá identidade ao card. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hero-decor" src="/hero-chart.webp" alt="" width={640} height={413} aria-hidden="true" decoding="async" />

      <div className="hero-top">
        <p className="hero-eyebrow">{ehMesAtual ? "Resumo do mês" : `Resumo de ${nomeMes}/${ano}`}</p>
      </div>

      <div className="hero-body">
        <div className="hero-main">
          <div className="hero-label-row">
            <p className="hero-label">{resumoPlano.calculavel ? "Disponível no mês" : "Resultado do mês"}</p>
          </div>
          {/* Conta nova (sem renda e sem nenhum lançamento): "R$ 0,00 disponível"
              parecia saldo zerado de verdade na primeira tela de quem acabou de
              comprar. O número em si não muda (continua entradas − saídas) — só
              deixa de aparecer como se fosse um saldo quando ainda não há dado. */}
          <ValorAutoAjustavel
            texto={semDadosNoMes ? "A calcular" : fmtValor(heroDisponivel)}
            className="hero-amount"
          />
          <p className="hero-caption">
            {semDadosNoMes
              ? "Registre sua primeira receita ou gasto pra começar"
              : resumoPlano.calculavel
                ? "Após despesas, dívidas e compras no cartão"
                : "Entradas menos saídas já registradas"}
          </p>
        </div>
      </div>

      <div className="hero-glass">
        <div className="hero-glass-stats">
          <div className="hero-glass-item">
            <span className="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="3" /><circle cx="12" cy="12" r="2.6" /><path d="M5.5 9v6M18.5 9v6" /></svg>
            </span>
            <span className="stat-text">
              <p className="stat-label">Renda mensal</p>
              <p className="stat-value">{rendaEfetiva != null ? fmtValor(rendaEfetiva) : "—"}</p>
            </span>
          </div>
          <div className="hero-glass-divider" />
          <div className="hero-glass-item">
            <span className="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6 3" /></svg>
            </span>
            <span className="stat-text">
              <p className="stat-label">Comprometido</p>
              <p className="stat-value">{fmtValor(heroComprometido)}</p>
            </span>
          </div>
          <div className="hero-glass-divider" />
          <div className="hero-glass-item">
            <span className="stat-icon violet">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12A9 9 0 1 1 12 3" /><path d="M12 3a9 9 0 0 1 9 9h-9z" /></svg>
            </span>
            <span className="stat-text">
              <p className="stat-label">% da renda comprometida</p>
              <p className="stat-value" style={acimaDoLimite ? { color: "#FFB4C0" } : undefined}>{pctComprometida != null ? `${Math.round(pctComprometida)}%` : "—"}</p>
            </span>
          </div>
        </div>
        {/* Passou de 100%: o número sozinho não mostra o tamanho do estouro
            (achado real via print do Ibrahim, revisão do ChatGPT) — por isso o
            aviso explícito continua aqui, além do % em destaque. */}
        {acimaDoLimite && pctComprometida != null && (
          <p className="hero-glass-aviso">{Math.round(pctComprometida - 100)}% acima da renda prevista</p>
        )}
        {percentualMetas != null && (
          <div className="hero-glass-bar">
            <div className="hero-glass-bar-top">
              <span>Guardado nas metas</span>
              <span className="hero-glass-bar-value">{Math.round(percentualMetas * 100)}%</span>
            </div>
            <div className="hero-glass-bar-track">
              <div className="hero-glass-bar-fill" style={{ width: `${percentualMetas * 100}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const painelHome = (
    <>
      {dividasEmAtraso.length > 0 && (
        <>
          <div className="card-head">
            <p className="alerta-title">
              <span className="title-icon red">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>
              </span>
              Atenção financeira
            </p>
          </div>
          <div className="atn-card" id="atencao">
            <div className="atn-topo">
              <div>
                <p className="atn-rot">Total em atraso</p>
                <p className="atn-total">{fmtValor(totalEmAtraso)}</p>
              </div>
              <span className="atn-qtd">{todasEmAtraso.length} dívida{todasEmAtraso.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="atn-lista">
              {dividasEmAtraso.map((d) => (
                <li key={d.id} className="atn-linha">
                  <span className="atn-chip" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>
                  </span>
                  <span className="atn-corpo">
                    <span className="atn-nome">{d.credor}</span>
                    <span className="atn-dias">{d.diasAtraso != null ? `${d.diasAtraso} dia${d.diasAtraso === 1 ? "" : "s"} em atraso` : "Parcela em atraso"}</span>
                  </span>
                  <span className="atn-valor">{fmtValor(d.valorTotal - d.valorPago)}</span>
                </li>
              ))}
            </ul>
            <Link href="/minha-conta/plano" className="atn-cta">
              Resolver agora
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
        </>
      )}

      {resumoPlano.calculavel && (
        <>
          <p className="section-eyebrow">
            <span className="title-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M13 7l-4.5 6.2H12l-1 4L15.5 11H12l1-4z" /></svg>
            </span>
            PLANO DE PAGAMENTO
          </p>
          <Link href="/minha-conta/plano" className={`plano-card ${resumoPlano.saldoProjetado >= 0 ? "pos" : "neg"}`}>
        <span className="plano-glow" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="plano-art" src={resumoPlano.saldoProjetado >= 0 ? "/plano-ok.webp" : "/plano-alerta.webp"} alt="" width={420} height={420} aria-hidden="true" decoding="async" />
        {/* "Saúde financeira" como veredito é só do card dedicado abaixo
            (SaudeFinanceiraCard) — esse aqui fala só do plano de pagamento
            deste mês, pra nunca contradizer o outro (ex: saldo positivo aqui +
            dívida em atraso lá). */}
        <span className="plano-badge">
          {resumoPlano.saldoProjetado >= 0 ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7v6" /><path d="M12 17h.01" /></svg>
          )}
          {resumoPlano.saldoProjetado >= 0 ? "Plano em dia" : "Atenção"}
        </span>
        <p className="plano-headline">
          {resumoPlano.saldoProjetado >= 0 ? (
            <>Seu plano de pagamento <span className="plano-headline-destaque">está em dia</span></>
          ) : (
            <>Suas contas <span className="plano-headline-destaque">estão no vermelho</span></>
          )}
        </p>
        <p className="plano-caption">
          {resumoPlano.saldoProjetado >= 0
            ? `Saldo previsto de ${fmtValor(resumoPlano.saldoProjetado)} este mês`
            : `Faltam ${fmtValor(Math.abs(resumoPlano.saldoProjetado))} pra fechar ${nomeMes.toLowerCase()} — veja seu plano de pagamento`}
        </p>
        <span className="plano-cta">
          Ver meu plano
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
        </span>
      </Link>
        </>
      )}

      {limiteSeguro && <LimiteSeguroCard limite={limiteSeguro} />}

      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M12 20V4M20 20v-7" /></svg>
          </span>
          <span className="title-label">Resumo</span>
        </p>
        <Link href="/minha-conta/movimentacoes" className="card-link">
          Ver detalhes
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      </div>
      <section className="card resumo-card" id="resumo">
        {quantidadeLancamentos === 0 ? (
          <p className="mc-empty">Nenhum gasto ou receita registrado em {nomeMes}/{ano}.</p>
        ) : (
          <>
            <div className="rsm-duo">
              <div className="rsm-tile entra">
                <span className="rsm-tile-rot">Entradas</span>
                {/* Mesma renda da hero: receitas lançadas, ou a renda do Perfil quando ainda não há lançamento. */}
                <strong>{fmtValor(rendaEfetiva ?? totalReceitasMes)}</strong>
              </div>
              <div className="rsm-tile sai">
                <span className="rsm-tile-rot">Saídas</span>
                <strong>{fmtValor(somaDespesasMes)}</strong>
              </div>
            </div>

            {linhasSaida.length > 0 && (
              <>
                <div className="rsm-pilha" role="img" aria-label="Composição das saídas do mês">
                  {linhasSaida.map((linha, indice) => (
                    <span key={linha.rotulo} className="rsm-seg" style={{ flexGrow: linha.valor, background: linha.cor, "--i": indice } as React.CSSProperties} />
                  ))}
                </div>
                <ul className="rsm-lista">
                  {linhasSaida.map((linha) => (
                    <li key={linha.rotulo} className="rsm-linha">
                      <span className="rsm-chip" style={{ background: `${linha.cor}1f`, color: linha.cor }}>{ICONE_LINHA_RESUMO[linha.icone]}</span>
                      <span className="rsm-nome">{linha.rotulo}</span>
                      <span className="rsm-pct">{Math.round((linha.valor / baseDespesas) * 100)}%</span>
                      <span className="rsm-valor">{fmtValor(linha.valor)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {(totalSaidasOperacionais > 0 || temInvestimentosNoMes) && (
              <div className="rsm-extra">
                {totalSaidasOperacionais > 0 && (
                  <div className="rsm-extra-linha">
                    <span>Resultado antes de investimentos</span>
                    <strong>{fmtValor(resultadoAntesInvestimentos)}</strong>
                  </div>
                )}
                {temInvestimentosNoMes && (
                  <div className="rsm-extra-linha">
                    <span>Investimentos</span>
                    <strong className="pos">{totalMetasMes < 0 ? "+ " : ""}{fmtValor(Math.abs(totalMetasMes))}</strong>
                  </div>
                )}
              </div>
            )}

            <div className={`rsm-resultado ${resumoPlano.saldoProjetado >= 0 ? "pos" : "neg"}`}>
              <span className="rsm-resultado-rot">{resumoPlano.saldoProjetado >= 0 ? "Sobra livre do mês" : "Déficit do mês"}</span>
              <strong>{resumoPlano.saldoProjetado >= 0 ? "" : "− "}{fmtValor(Math.abs(resumoPlano.saldoProjetado))}</strong>
            </div>
          </>
        )}
      </section>

      {saude && <SaudeFinanceiraCard saude={saude} />}

      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
          </span>
          <span className="title-label">Últimos lançamentos</span>
        </p>
        <Link href="/minha-conta/movimentacoes" className="card-link">
          Ver tudo
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      </div>
      <section className="card ult-card" id="lancamentos">
        <div className="ult-semana">
          <div className="ult-semana-topo">
            <span>Gastos nos últimos 7 dias</span>
            <strong>{fmtValor(totalJanela)}</strong>
          </div>
          <div className="ult-barras" role="img" aria-label={`Gastos por dia: ${gastoPorDia.map((d) => `${d.dia.slice(8)}/${d.dia.slice(5, 7)} ${fmtValor(d.total)}`).join(", ")}`}>
            {gastoPorDia.map((d, indice) => (
              <div key={d.dia} className={`ult-col${indice === gastoPorDia.length - 1 ? " hoje" : ""}`}>
                <span className="ult-trilho">
                  <span className="ult-barra" style={{ height: `${d.total > 0 ? Math.max((d.total / maiorGastoDia) * 100, 8) : 4}%`, "--i": indice } as React.CSSProperties} />
                </span>
                <span className="ult-letra">{d.letra.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>

        {ultimosLancamentos.length === 0 ? (
          <p className="mc-empty">Nenhum lançamento registrado ainda.</p>
        ) : (
          <ul className="ult-lista">
            {ultimosLancamentos.map((l) => {
              const dias = diasAte(l.data, hoje);
              const quando = dias === 0 ? "Hoje" : dias === -1 ? "Ontem" : fmtData(l.data);
              const entrada = l.tipo === "RECEITA";
              const tom = entrada ? "entrada" : l.tipo === "DESPESA_FIXA" ? "fixa" : l.tipo === "COMPRA_CARTAO" || l.tipo === "FATURA_FECHADA" ? "cartao" : "variavel";
              return (
                <li key={l.id} className="ult-linha">
                  <span className={`ult-chip ${tom}`}>
                    {entrada ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="3" /><circle cx="12" cy="12" r="2.6" /><path d="M5.5 9v6M18.5 9v6" /></svg>
                    ) : tom === "fixa" ? (
                      ICONE_LINHA_RESUMO.fixa
                    ) : tom === "cartao" ? (
                      ICONE_LINHA_RESUMO.cartao
                    ) : (
                      ICONE_LINHA_RESUMO.variavel
                    )}
                  </span>
                  <span className="ult-corpo">
                    <span className="ult-desc">{l.descricao}</span>
                    <span className="ult-meta">
                      {ROTULO_TIPO_LANCAMENTO[l.tipo] ?? l.tipo}
                      {l.cartao ? ` · ${l.cartao.nome}` : ""}
                      {l.recorrente && (
                        <svg className="lanc-recorrente" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Recorrente"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
                      )}
                    </span>
                  </span>
                  <span className="ult-lado">
                    <span className={`ult-valor${entrada ? " entrada" : ""}`}>
                      {entrada ? "+" : l.tipo === "FATURA_FECHADA" ? "" : "−"}{fmtValor(l.valor)}
                    </span>
                    <span className="ult-quando">{quando}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>
          </span>
          <span className="title-label">Cartões</span>
        </p>
        <Link href="/minha-conta/cartoes" className="card-link">
          Ver cartões
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      </div>
      <section className="card crt-card" id="cartoes">
        {cartoes.length === 0 ? (
          <p className="mc-empty">Nenhum cartão cadastrado ainda.</p>
        ) : (
          <>
            <div className="crt-topo">
              <div>
                <p className="crt-rot">Compras no cartão este mês</p>
                <p className="crt-total">{fmtValor(totalCartaoMes)}</p>
              </div>
              <span className="crt-qtd">{cartoes.length} cartõ{cartoes.length === 1 ? "o" : "es"}</span>
            </div>

            {totalCartaoMes > 0 && (
              <div className="rsm-pilha" role="img" aria-label="Divisão das compras entre os cartões">
                {cartoes
                  .filter((c) => (gastoCartaoMes.get(c.nome) ?? 0) > 0)
                  .map((c, indice) => {
                    const [cor1, cor2] = gradienteDoCartao(c.nome);
                    return (
                      <span
                        key={c.id}
                        className="rsm-seg"
                        style={{ flexGrow: gastoCartaoMes.get(c.nome) ?? 0, background: `linear-gradient(90deg, ${cor1}, ${cor2})`, "--i": indice } as React.CSSProperties}
                      />
                    );
                  })}
              </div>
            )}

            <ul className="crt-lista">
              {cartoes.map((c) => {
                const [cor1, cor2] = gradienteDoCartao(c.nome);
                const gasto = gastoCartaoMes.get(c.nome) ?? 0;
                const dias = c.diaVencimento ? diasParaVencer(c.diaVencimento) : null;
                return (
                  <li key={c.id} className="crt-linha">
                    <span className="crt-mini" style={{ background: `linear-gradient(160deg, ${cor1}, ${cor2})` }}>
                      <span className="crt-mini-chip" />
                      <span className="crt-mini-inicial">{c.nome.charAt(0).toUpperCase()}</span>
                    </span>
                    <span className="crt-corpo">
                      <span className="crt-nome">{c.nome}</span>
                      <span className="crt-meta">
                        {c.diaFechamento ? `Fecha dia ${c.diaFechamento}` : ""}
                        {c.diaFechamento && c.diaVencimento ? " · " : ""}
                        {c.diaVencimento ? `Vence dia ${c.diaVencimento}` : ""}
                      </span>
                      <span className="crt-trilho">
                        <span className="crt-barra" style={{ width: `${gasto > 0 ? Math.max((gasto / maiorGastoCartao) * 100, 6) : 0}%`, background: `linear-gradient(90deg, ${cor1}, ${cor2})` }} />
                      </span>
                    </span>
                    <span className="crt-lado">
                      <span className="crt-valor">{fmtValor(gasto)}</span>
                      {dias != null && (
                        <span className={`crt-prazo${dias <= 5 ? " perto" : ""}`}>
                          {dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="4" /><path d="M3 9.5h18" /><path d="M8 3v3M16 3v3" /><circle cx="9" cy="14" r="1.15" fill="currentColor" stroke="none" /><circle cx="15" cy="14" r="1.15" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.15" fill="currentColor" stroke="none" /></svg>
          </span>
          <span className="title-label">Compromissos</span>
        </p>
        <Link href="/minha-conta/agenda" className="card-link">
          Ver agenda
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      </div>
      <section className="card cmp-card" id="tarefas">
        {proximosCompromissos.length === 0 ? (
          <div className="cmp-vazio">
            <span className="cmp-vazio-icone" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="4" /><path d="M3 9.5h18" /><path d="M8 3v3M16 3v3" /><path d="M9 15l2 2 4-4" /></svg>
            </span>
            <p>Nenhum compromisso com vencimento marcado.</p>
          </div>
        ) : (
          <>
            <div className="cmp-topo">
              <div>
                <p className="cmp-rot">Compromissos pendentes</p>
                <p className="cmp-total">{compromissosComData.length}{totalCompromissos > 0 ? <small> · {fmtValor(totalCompromissos)}</small> : null}</p>
              </div>
              {compromissosAtrasados > 0 && <span className="cmp-atraso">{compromissosAtrasados} atrasado{compromissosAtrasados === 1 ? "" : "s"}</span>}
            </div>
            <ul className="cmp-lista">
              {proximosCompromissos.map((t) => {
                const dias = diasAte(t.vencimento as Date, hoje);
                const prazo = dias < 0 ? "atrasado" : dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`;
                const tom = dias < 0 ? "atrasado" : dias <= 1 ? "perto" : "ok";
                const partes = fmtDiaMes.formatToParts(t.vencimento as Date);
                const diaTxt = partes.find((p) => p.type === "day")?.value ?? "";
                const mesTxt = (partes.find((p) => p.type === "month")?.value ?? "").replace(".", "");
                return (
                  <li key={t.id} className="cmp-linha">
                    <span className={`cmp-data ${tom}`}>
                      <strong>{diaTxt}</strong>
                      <span>{mesTxt}</span>
                    </span>
                    <span className="cmp-corpo">
                      <span className="cmp-desc">{t.descricao}</span>
                      <span className={`cmp-prazo ${tom}`}>{prazo}</span>
                    </span>
                    {t.valor != null && <span className="cmp-valor">{fmtValor(t.valor)}</span>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );

  const totalReceitasAba = receitasDoMes.reduce((soma, r) => soma + r.valor, 0);
  const painelReceita = (
    <AbaResumo
      titulo={`Receitas — ${nomeMes}/${ano}`}
      destaque={{ rotulo: "Total de entradas", valor: fmtValor(totalReceitasAba), chip: `${receitasDoMes.length} entrada${receitasDoMes.length === 1 ? "" : "s"}`, tom: "verde" }}
      delta={compararComAnterior(totalReceitasAba, receitasAnt._sum.valor, false)}
      temItens={maioresReceitas.length > 0}
      vazio={`Nenhuma receita registrada em ${nomeMes.toLowerCase()}.`}
      href={`/minha-conta/receitas${sufixoMesPagina}`}
      rotuloLink="Ver página completa"
    >
      <ul className="ult-lista">
        {maioresReceitas.map((r) => (
          <li key={r.id} className="ult-linha">
            <span className="ult-chip entrada">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="3" /><circle cx="12" cy="12" r="2.6" /><path d="M5.5 9v6M18.5 9v6" /></svg>
            </span>
            <span className="ult-corpo">
              <span className="ult-desc">{r.descricao}</span>
              <span className="ult-meta">{r.categoria ?? ROTULO_TIPO_LANCAMENTO[r.tipo] ?? r.tipo}</span>
            </span>
            <span className="ult-lado">
              <span className="ult-valor entrada">+{fmtValor(r.valor)}</span>
              <span className="ult-quando">{fmtData(r.data)}</span>
            </span>
          </li>
        ))}
      </ul>
    </AbaResumo>
  );

  const totalDespesasAba = totalFixasMes + totalVariaveisMes;
  const painelDespesas = (
    <AbaResumo
      titulo={`Despesas — ${nomeMes}/${ano}`}
      destaque={{ rotulo: "Total de despesas", valor: fmtValor(totalDespesasAba), tom: "vermelho" }}
      delta={compararComAnterior(totalDespesasAba, despesasAnt._sum.valor, true)}
      segmentos={[
        { rotulo: "Fixas", valor: totalFixasMes, valorTxt: fmtValor(totalFixasMes), cor: "#1E63E9" },
        { rotulo: "Variáveis", valor: totalVariaveisMes, valorTxt: fmtValor(totalVariaveisMes), cor: "#17B4D8" },
      ]}
      temItens={maioresDespesas.length > 0}
      vazio={`Nenhuma despesa registrada em ${nomeMes.toLowerCase()}.`}
      href={`/minha-conta/despesas${sufixoMesPagina}`}
      rotuloLink="Ver página completa"
    >
      <ul className="ult-lista">
        {maioresDespesas.map((d) => (
          <li key={d.id} className="ult-linha">
            <span className={`ult-chip ${d.tipo === "DESPESA_FIXA" ? "fixa" : "variavel"}`}>
              {d.tipo === "DESPESA_FIXA" ? ICONE_LINHA_RESUMO.fixa : ICONE_LINHA_RESUMO.variavel}
            </span>
            <span className="ult-corpo">
              <span className="ult-desc">{d.descricao}</span>
              <span className="ult-meta">
                {ROTULO_TIPO_LANCAMENTO[d.tipo] ?? d.tipo}
                {d.categoria ? ` · ${d.categoria}` : ""}
              </span>
            </span>
            <span className="ult-lado">
              <span className="ult-valor">−{fmtValor(d.valor)}</span>
              <span className="ult-quando">{fmtData(d.data)}</span>
            </span>
          </li>
        ))}
      </ul>
    </AbaResumo>
  );

  const faltaMetas = Math.max(totalAlvoMetas - totalGuardadoMetas, 0);
  const painelMetas = (
    <AbaResumo
      titulo="Metas"
      destaque={{ rotulo: "Guardado nas metas", valor: fmtValor(totalGuardadoMetas), chip: percentualMetas != null ? `${Math.round(percentualMetas * 100)}% do alvo` : undefined, tom: "azul" }}
      segmentos={
        totalAlvoMetas > 0
          ? [
              { rotulo: "Guardado", valor: Math.max(totalGuardadoMetas, 0), valorTxt: fmtValor(totalGuardadoMetas), cor: "#12A150" },
              { rotulo: "Falta", valor: faltaMetas, valorTxt: fmtValor(faltaMetas), cor: "#B8C7E6" },
            ]
          : undefined
      }
      temItens={metasResumo.length > 0}
      vazio="Nenhuma meta ainda. Crie um cofrinho na página completa."
      href="/minha-conta/metas"
      rotuloLink="Ver página completa"
    >
      <ul className="ult-lista">
        {metasResumo.map((m) => {
          const guardado = m.depositos.reduce((soma, d) => soma + d.valor, 0);
          const pct = m.valorAlvo > 0 ? Math.max(0, Math.min(guardado / m.valorAlvo, 1)) : 0;
          return (
            <li key={m.id} className="aba-meta">
              <div className="aba-meta-topo">
                <span className="aba-meta-nome">{m.nome}</span>
                <span className="aba-meta-pct">{Math.round(pct * 100)}%</span>
              </div>
              <span className="aba-meta-trilho"><span className="aba-meta-barra" style={{ width: `${Math.max(pct * 100, pct > 0 ? 4 : 0)}%` }} /></span>
              <p className="aba-meta-valores">{fmtValor(guardado)} <span>de {fmtValor(m.valorAlvo)}</span></p>
            </li>
          );
        })}
      </ul>
    </AbaResumo>
  );

  return (
    <div>
      <AbasHome
        hero={heroShell}
        paineis={{ home: painelHome, receita: painelReceita, despesas: painelDespesas, metas: painelMetas }}
        mesAnterior={paramMes(mesAnterior.ano, mesAnterior.mes)}
        mesSeguinte={ehMesAtual ? null : paramMes(mesSeguinte.ano, mesSeguinte.mes)}
        mesNaUrl={mesNaUrl}
        rotuloMes={`${nomeMes}/${ano}`}
      />
    </div>
  );
}
