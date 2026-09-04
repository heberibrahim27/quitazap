import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { calcularResumoFinanceiro, calcularMediaMensal } from "@/lib/financeiro/motor";
import { calcularSaudeFinanceira } from "@/lib/financeiro/saude-financeira";
import { SaudeFinanceiraCard } from "./SaudeFinanceiraCard";
import { gradienteDoCartao } from "@/lib/cartoes-conhecidos";
import { ValorAutoAjustavel } from "./ValorAutoAjustavel";
import { MesSwipe } from "./MesSwipe";
import { AnimarAoAparecer } from "./AnimarAoAparecer";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNumero(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const ms = new Date(data).setHours(0, 0, 0, 0) - new Date(hoje).setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
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
  const resumoDoMes = [
    { rotulo: "Receitas", valor: totalReceitasMes, icone: "receita", classe: "green" },
    { rotulo: "Despesas fixas", valor: totalFixasMes, icone: "fixa", classe: "blue" },
    { rotulo: "Desp. variáveis", valor: totalVariaveisMes, icone: "variavel", classe: "cyan" },
    { rotulo: "Cartões", valor: totalCartaoMes, icone: "cartao", classe: "blue" },
    { rotulo: "Empréstimos", valor: totalEmprestimosMes, icone: "divida", classe: "blue" },
    { rotulo: "Outras dívidas", valor: totalOutrasDividasMes, icone: "divida", classe: "blue" },
  ].filter((linha) => linha.valor > 0);
  // Base de cálculo ÚNICA pra todas as barrinhas do Resumo (incluindo a de
  // Investimentos, renderizada à parte logo abaixo): o maior valor entre
  // TODAS as linhas mostradas, não só a Receita. Usar só a Receita como
  // referência (bug anterior) fazia a barra de qualquer categoria de
  // despesa/investimento menor que a receita do mês parecer artificialmente
  // vazia mesmo quando ela já era a maior categoria de saída — e, no caso
  // oposto (mês com dívida/despesa maior que a receita), forçava mais de
  // uma barra a bater 100% ao mesmo tempo, sem diferenciação nenhuma.
  const maiorValorResumo = Math.max(
    totalReceitasMes, totalFixasMes, totalVariaveisMes, totalCartaoMes,
    totalEmprestimosMes, totalOutrasDividasMes, Math.abs(totalMetasMes), 1,
  );
  // totalSaidasOperacionais/resultadoAntesInvestimentos já vêm prontos do
  // motor (mesma fórmula de antes) — sem resomar `resumoDoMes` aqui.
  const totalSaidasOperacionais = totais.totalSaidasOperacionais;
  const resultadoAntesInvestimentos = totais.resultadoAntesInvestimentos;
  // totalMetasMes pode ser negativo (mês em que se sacou mais do que se
  // guardou) — nesse caso o aporte "negativo" devolve dinheiro pra sobra,
  // e ainda faz sentido mostrar a linha.
  const temInvestimentosNoMes = totalMetasMes !== 0;

  const dividasEmAtraso = dividas.filter((d) => d.emAtraso).slice(0, 2);

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
  const proximosCompromissos = tarefasPendentes
    .filter((t) => t.vencimento != null)
    .slice(0, 2);

  return (
    <div>
      <MesSwipe
        hrefAnterior={`/minha-conta?mes=${paramMes(mesAnterior.ano, mesAnterior.mes)}`}
        hrefSeguinte={ehMesAtual ? null : `/minha-conta?mes=${paramMes(mesSeguinte.ano, mesSeguinte.mes)}`}
      >
      <div className="hero">
        <div className="hero-shell">
          <div className="hero-top">
            <p className="hero-eyebrow">{ehMesAtual ? "Resumo do mês" : `Resumo de ${nomeMes}/${ano}`}</p>
          </div>

          <div className="hero-body">
            <div className="hero-main">
              <div className="hero-label-row">
                <p className="hero-label">Disponível no mês</p>
              </div>
              <ValorAutoAjustavel texto={fmtValor(heroDisponivel)} className="hero-amount" />
              <p className="hero-caption">
                {resumoPlano.calculavel ? "Após despesas, dívidas e compras no cartão" : "Após despesas e compras no cartão"}
              </p>
            </div>
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
          </div>
          {percentualComprometido != null && (
            <div className="hero-glass-bar">
              <div className="hero-glass-bar-top">
                <span>Da renda comprometida</span>
                <span className="hero-glass-bar-value">{Math.round(percentualComprometido * 100)}%</span>
              </div>
              <div className="hero-glass-bar-track">
                <div className="hero-glass-bar-fill" style={{ width: `${Math.min(percentualComprometido * 100, 100)}%` }} />
              </div>
            </div>
          )}
          {percentualMetas != null && (
            <div className="hero-glass-bar">
              <div className="hero-glass-bar-top">
                <span>Guardado nas metas</span>
                <span className="hero-glass-bar-value" style={{ color: "var(--green)" }}>{Math.round(percentualMetas * 100)}%</span>
              </div>
              <div className="hero-glass-bar-track">
                <div className="hero-glass-bar-fill" style={{ width: `${percentualMetas * 100}%`, background: "var(--green)" }} />
              </div>
            </div>
          )}
        </div>
      </div>
      </MesSwipe>

      {resumoPlano.calculavel && (
        <>
          <p className="section-eyebrow">
            <span className="title-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M13 7l-4.5 6.2H12l-1 4L15.5 11H12l1-4z" /></svg>
            </span>
            PLANO DE PAGAMENTO
          </p>
          <Link href="/minha-conta/plano" className="plano-card">
            <div className="plano-top">
              <div>
                {/* "Saúde financeira" como veredito é só do card dedicado
                    abaixo (SaudeFinanceiraCard) — esse aqui fala só do
                    plano de pagamento deste mês, pra nunca contradizer o
                    outro (ex: saldo positivo aqui + dívida em atraso lá). */}
                <p className={`plano-headline ${resumoPlano.saldoProjetado >= 0 ? "pos" : "neg"}`}>
                  {resumoPlano.saldoProjetado >= 0 ? "Seu plano de pagamento está em dia" : "Suas contas estão no vermelho"}
                </p>
                <p className="plano-caption">
                  {resumoPlano.saldoProjetado >= 0
                    ? `Saldo previsto de ${fmtValor(resumoPlano.saldoProjetado)} este mês`
                    : `Faltam ${fmtValor(Math.abs(resumoPlano.saldoProjetado))} pra fechar ${nomeMes.toLowerCase()} — veja seu plano de pagamento`}
                </p>
              </div>
              <span className={`plano-icon ${resumoPlano.saldoProjetado >= 0 ? "pos" : ""}`}>
                {resumoPlano.saldoProjetado >= 0 ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>
                )}
              </span>
            </div>
            <span className="plano-cta">
              Ver meu plano
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
            </span>
          </Link>
        </>
      )}

      {saude && <SaudeFinanceiraCard saude={saude} />}

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
      <AnimarAoAparecer>
      <section className="card" id="resumo" style={{ paddingBottom: 0 }}>
        {quantidadeLancamentos === 0 ? (
          <p className="mc-empty">Nenhum gasto ou receita registrado em {nomeMes}/{ano}.</p>
        ) : (
          <>
            {resumoDoMes.map((linha, indice) => (
              <Fragment key={linha.rotulo}>
                <div className="resumo-row">
                  <span className={`resumo-icon ${linha.classe}`}>
                    {linha.icone === "receita" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
                    {linha.icone === "fixa" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11L12 4l8 7" /><path d="M6 9.5V20a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1V9.5" /></svg>}
                    {linha.icone === "variavel" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.7 12.5h9.8l2.1-8H6.4" /></svg>}
                    {linha.icone === "cartao" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>}
                    {linha.icone === "divida" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>}
                  </span>
                  <span className="resumo-label">{linha.rotulo}</span>
                  <span className="resumo-bar-track">
                    <span
                      className="resumo-bar-fill"
                      style={{ "--to": Math.min(linha.valor / maiorValorResumo, 1), "--i": indice, background: `var(--${linha.classe})` } as React.CSSProperties}
                    />
                  </span>
                  <span className="resumo-value">
                    <span className="resumo-value-cifrao">R$</span>
                    <span className="resumo-value-numero">{fmtNumero(linha.valor)}</span>
                  </span>
                </div>
                {/* Separa a Receita (entrada) do resto (saídas) — mesma
                    lógica visual de uma DRE: receita bruta em cima, uma
                    linha, depois cada dedução até o resultado final. */}
                {linha.rotulo === "Receitas" && <div className="resumo-divisor" />}
              </Fragment>
            ))}
            {totalSaidasOperacionais > 0 && (
              <div className="resumo-subtotal">
                <span className="resumo-subtotal-label">Resultado antes de investimentos</span>
                <span className="resumo-subtotal-value">{fmtValor(resultadoAntesInvestimentos)}</span>
              </div>
            )}
            {temInvestimentosNoMes && (
              <>
                <div className="resumo-divisor" />
                <div className="resumo-row">
                  <span className="resumo-icon green">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
                  </span>
                  <span className="resumo-label">Investimentos</span>
                  <span className="resumo-bar-track">
                    <span
                      className="resumo-bar-fill"
                      style={{ "--to": Math.min(Math.abs(totalMetasMes) / maiorValorResumo, 1), "--i": resumoDoMes.length, background: "var(--green)" } as React.CSSProperties}
                    />
                  </span>
                  <span className="resumo-value">
                    <span className="resumo-value-cifrao">{totalMetasMes < 0 ? "+ R$" : "R$"}</span>
                    <span className="resumo-value-numero">{fmtNumero(Math.abs(totalMetasMes))}</span>
                  </span>
                </div>
              </>
            )}
            <div className={`resumo-footer ${resumoPlano.saldoProjetado >= 0 ? "pos" : "neg"}`}>
              <span className="resumo-footer-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M7.5 10h9M7.5 14h9" /></svg>
                <span>
                  {resumoPlano.saldoProjetado >= 0 ? "Sobra livre do mês" : "Déficit do mês"}
                  <span className="resumo-footer-sub">Resultado previsto de {nomeMes.toLowerCase()}</span>
                </span>
              </span>
              <span className="resumo-footer-value">
                {resumoPlano.saldoProjetado >= 0 ? "" : "− "}{fmtValor(Math.abs(resumoPlano.saldoProjetado))}
              </span>
            </div>
          </>
        )}
      </section>
      </AnimarAoAparecer>

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
      <section className="card" id="lancamentos">
        {ultimosLancamentos.length === 0 ? (
          <p className="mc-empty">Nenhum lançamento registrado ainda.</p>
        ) : (
          ultimosLancamentos.map((l) => (
            <div key={l.id} className="lanc-row">
              <span className={`lanc-icon ${l.tipo === "RECEITA" ? "pos" : ""}`}>
                {l.tipo === "RECEITA" ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="3" /><circle cx="12" cy="12" r="2.6" /><path d="M5.5 9v6M18.5 9v6" /></svg>
                ) : l.tipo === "DESPESA_FIXA" ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11L12 4l8 7" /><path d="M6 9.5V20a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1V9.5" /></svg>
                ) : l.tipo === "COMPRA_CARTAO" || l.tipo === "FATURA_FECHADA" ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.7 12.5h9.8l2.1-8H6.4" /></svg>
                )}
              </span>
              <span className="lanc-body">
                <p className="lanc-desc">{l.descricao}</p>
                <p className="lanc-meta">
                  {ROTULO_TIPO_LANCAMENTO[l.tipo] ?? l.tipo}
                  {l.cartao ? ` · ${l.cartao.nome}` : ""}
                  {l.recorrente && (
                    <svg className="lanc-recorrente" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
                  )}
                </p>
              </span>
              <span className="lanc-side">
                <p className={`lanc-value ${l.tipo === "RECEITA" ? "pos" : ""}`}>
                  {l.tipo === "RECEITA" ? "+" : l.tipo === "FATURA_FECHADA" ? "" : "-"}{fmtValor(l.valor)}
                </p>
                <p className="lanc-date">{fmtData(l.data)}</p>
              </span>
            </div>
          ))
        )}
      </section>

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
          <div className="alerta-card" id="atencao">
            {dividasEmAtraso.map((d) => (
              <div key={d.id} className="alerta-row">
                <span className="alerta-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>
                </span>
                <span className="alerta-body">
                  <p className="alerta-desc">{d.credor} — parcela em atraso</p>
                  <p className="alerta-meta">{d.diasAtraso != null ? `${d.diasAtraso} dias em atraso` : "Em atraso"}</p>
                </span>
                <span className="alerta-side">
                  <p className="alerta-value">{fmtValor(d.valorTotal - d.valorPago)}</p>
                </span>
              </div>
            ))}
            <Link href="/minha-conta/plano" className="alerta-cta">
              Resolver agora
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
        </>
      )}

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
      <section className="card" id="cartoes">
        {cartoes.length === 0 ? (
          <p className="mc-empty">Nenhum cartão cadastrado ainda.</p>
        ) : (
          <>
            <div className="cartoes-total">
              <div className="cartoes-total-top">
                <span>
                  <p className="cartoes-total-label">Compras no cartão este mês</p>
                  <p className="cartoes-total-value">{fmtValor(totalCartaoMes)}</p>
                </span>
                <span className="cartoes-total-icon">
                  <span className="cartoes-total-icon-chip" />
                </span>
              </div>
            </div>
            {cartoes.map((c) => {
              const [cor1, cor2] = gradienteDoCartao(c.nome);
              return (
              <div key={c.id} className="cartao-row">
                <span className="cartao-mark" style={{ background: `linear-gradient(160deg, ${cor1}, ${cor2})` }}>
                  <span className="cartao-chip" />
                  <span className="cartao-initial">{c.nome.charAt(0).toUpperCase()}</span>
                </span>
                <span className="cartao-body">
                  <p className="cartao-nome">{c.nome}</p>
                  <p className="cartao-meta">
                    {c.diaFechamento ? `Fecha dia ${c.diaFechamento}` : ""}
                    {c.diaFechamento && c.diaVencimento ? " · " : ""}
                    {c.diaVencimento ? `Vence dia ${c.diaVencimento}` : ""}
                  </p>
                </span>
                <span className="cartao-side">
                  <p className="cartao-value">{fmtValor(gastoCartaoMes.get(c.nome) ?? 0)}</p>
                </span>
              </div>
              );
            })}
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
      <section className="card" id="tarefas">
        {proximosCompromissos.length === 0 ? (
          <p className="mc-empty">Nenhum compromisso com vencimento marcado.</p>
        ) : (
          proximosCompromissos.map((t) => {
            const dias = diasAte(t.vencimento as Date, hoje);
            const prazo = dias < 0 ? "atrasado" : dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`;
            return (
              <div key={t.id} className="compromisso-row">
                <span className="compromisso-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a5 5 0 0 0-5 5v3.2c0 .8-.3 1.6-.9 2.1L5 15h14l-1.1-1.7a3 3 0 0 1-.9-2.1V8a5 5 0 0 0-5-5z" /><path d="M9.5 18a2.5 2.5 0 0 0 5 0" /></svg>
                </span>
                <span className="compromisso-body">
                  <p className="compromisso-desc">{t.descricao}</p>
                  <p className="compromisso-meta">Vencimento {fmtData(t.vencimento as Date)}</p>
                </span>
                <span className="compromisso-side">
                  <p className="compromisso-value">{t.valor != null ? fmtValor(t.valor) : ""}</p>
                  <p className="compromisso-prazo">{prazo}</p>
                </span>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
