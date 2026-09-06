// ─────────────────────────────────────────
// QuitaZAP — Motor de Marketing (projeção de investimento em ads)
// ─────────────────────────────────────────
// Lógica pura de propósito (sem Prisma/rede), mesmo padrão de
// financeiro/motor.ts e sales-bot-objecao.ts — dá pra testar toda a
// projeção e a lógica de escala em massa sem banco.
//
// Pedido do Ibrahim (2026-09-06, especificação revisada com o ChatGPT):
// tela "Marketing" pra projetar meses seguintes de investimento em Ads
// (CAC, MRR, resultado) e depois comparar projetado x real. Preço
// (R$14,90), taxa da Cakto (~5,3%), custo de IA por cliente ativo e
// infraestrutura mensal NUNCA são redigitados aqui — vêm sempre de
// financeiro-admin/motor.ts (ParametrosMotorFinanceiro abaixo é só o
// contêiner desses valores já calculados, passado por quem chama este
// módulo), pra nunca dessincronizar do resto do sistema.
//
// R$1.000 → 100 assinantes (CAC de R$10) é a meta OTIMISTA do Ibrahim, não
// uma premissa do sistema — o default aqui é CAC projetado = R$25
// (cenário base), editável na tela.

export interface ParametrosMotorFinanceiro {
  /** PRECO_MENSAL — financeiro-admin/motor.ts */
  precoMensal: number;
  /** COMISSAO_CAKTO — financeiro-admin/motor.ts */
  comissaoCakto: number;
  /** custoIA / totalClientesAtivos do mês atual — mesmo cálculo já usado
   * na Projeção de /financeiro. Cuidado: é custo VARIÁVEL por cliente,
   * separado da infraestrutura fixa abaixo — nunca somar os dois como se
   * fossem a mesma coisa (evita contar OpenAI duas vezes). */
  custoIAPorClienteAtivo: number;
  /** custoManual do mês (CustoMensal lançado — Z-API, domínio, hospedagem,
   * a fatia fixa de IA que já estiver lançada como custo manual etc.).
   * Usado como proxy do custo fixo mensal recorrente (~R$190) pros meses
   * futuros da projeção, já que não existe lançamento manual pra um mês
   * que ainda não aconteceu. */
  infraestruturaMensal: number;
}

/** Margem de contribuição por assinante = receita líquida (após comissão
 * da Cakto e custo de IA) de UM assinante — a métrica base tanto do
 * payback quanto do teto de CAC. Com os valores de hoje (R$14,90, 5,3%,
 * R$0,01/cliente): 14,90 − 14,90×0,053 − 0,01 ≈ R$14,10. */
export function margemContribuicaoPorAssinante(motor: ParametrosMotorFinanceiro): number {
  return motor.precoMensal - motor.precoMensal * motor.comissaoCakto - motor.custoIAPorClienteAtivo;
}

/** Teto de CAC pra payback de 2 meses — NUNCA hardcoded (pedido explícito
 * do Ibrahim: precisa continuar certo se o preço ou a taxa da Cakto
 * mudarem). Com os valores de hoje dá ~R$28,20 (14,10 × 2), mas é sempre
 * recalculado a partir da margem de contribuição real. */
export function tetoCacPaybackDoisMeses(motor: ParametrosMotorFinanceiro): number {
  return margemContribuicaoPorAssinante(motor) * 2;
}

/** Payback em meses = quantos meses de margem de contribuição de um
 * assinante são necessários pra pagar o CAC dele. `null` quando a margem
 * não é positiva (payback nunca acontece nesse cenário). */
export function calcularPaybackMeses(cac: number, motor: ParametrosMotorFinanceiro): number | null {
  const margem = margemContribuicaoPorAssinante(motor);
  if (margem <= 0) return null;
  return cac / margem;
}

// ── Projeção mês a mês ─────────────────────

export interface ParametrosProjecaoMarketing {
  /** Assinantes pagantes reais de hoje (whereStatusAssinatura("PAGO")) —
   * ponto de partida da projeção. */
  ativosIniciais: number;
  investimentoMensal: number;
  cacProjetado: number;
  /** Fração (0.15 = 15%), não percentual. */
  churnMensal: number;
  horizonteMeses: number;
  /** "AAAA-MM" do mês 1 da projeção (mês atual) — usado só pra rotular
   * cada linha com o mês de calendário correspondente. */
  mesInicialCalendario: string;
}

export interface LinhaProjecaoMarketing {
  mes: number; // 1..horizonte
  mesCalendario: string; // "AAAA-MM"
  investimentoAds: number;
  cac: number;
  novosPagos: number;
  cancelados: number;
  ativosFim: number;
  mrr: number;
  receitaLiquida: number;
  infraestrutura: number;
  resultadoOperacional: number;
  resultadoAcumulado: number;
}

function proximoMesCalendario(mes: string): string {
  const [ano, mesNum] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mesNum, 1)); // mesNum já é o mês seguinte em base 0
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Projeção pura: investimento mensal CONSTANTE (o valor informado) ao
 * longo de todo o horizonte — a lógica de "quanto investir no mês
 * seguinte" (escala controlada) só entra quando existe dado REAL de
 * campanha pra comparar contra os limiares (ver avaliarEscalaControlada),
 * nunca dentro desta projeção-base "se nada mudar". */
export function projetarMarketing(params: ParametrosProjecaoMarketing, motor: ParametrosMotorFinanceiro): LinhaProjecaoMarketing[] {
  const linhas: LinhaProjecaoMarketing[] = [];
  let ativos = Math.max(0, params.ativosIniciais);
  let acumulado = 0;
  let mesCalendario = params.mesInicialCalendario;

  for (let mes = 1; mes <= params.horizonteMeses; mes++) {
    const novosPagos = params.cacProjetado > 0 ? params.investimentoMensal / params.cacProjetado : 0;
    const cancelados = ativos * params.churnMensal;
    const ativosFim = Math.max(0, ativos - cancelados + novosPagos);

    const receitaBruta = ativosFim * motor.precoMensal;
    const cakto = receitaBruta * motor.comissaoCakto;
    const custoIA = ativosFim * motor.custoIAPorClienteAtivo;
    const receitaLiquida = receitaBruta - cakto - custoIA;
    const resultadoOperacional = receitaLiquida - motor.infraestruturaMensal - params.investimentoMensal;
    acumulado += resultadoOperacional;

    linhas.push({
      mes,
      mesCalendario,
      investimentoAds: params.investimentoMensal,
      cac: params.cacProjetado,
      novosPagos,
      cancelados,
      ativosFim,
      mrr: receitaBruta,
      receitaLiquida,
      infraestrutura: motor.infraestruturaMensal,
      resultadoOperacional,
      resultadoAcumulado: acumulado,
    });

    ativos = ativosFim;
    mesCalendario = proximoMesCalendario(mesCalendario);
  }

  return linhas;
}

// ── Escala controlada (real x limiares) ────

export type NivelEscala = "VERDE" | "AMARELO" | "VERMELHO";

// CAC ≤ R$20 é o único limiar fixo do briefing (o teto de R$28,20 é
// sempre derivado da margem, ver tetoCacPaybackDoisMeses). Amostra mínima
// pra não decidir escalar com base em poucas vendas — número arbitrário,
// mas explícito e ajustável aqui num só lugar.
const CAC_LIMITE_VERDE = 20;
const VENDAS_MINIMAS_PARA_CONFIANCA = 5;
const PERCENTUAL_AUMENTO_VERDE = 0.25;
const PERCENTUAL_MAXIMO_AUMENTO_MES = 0.25;
const PERCENTUAL_REINVESTIMENTO_RESULTADO = 0.5;

export interface DadosReaisMesMarketing {
  investimentoReal: number;
  /** Só assinatura PAGA confirmada pela Cakto — nunca lead, conversa ou
   * clique (exigência explícita do Ibrahim). */
  novasAssinaturasPagas: number;
}

export interface AvaliacaoEscala {
  nivel: NivelEscala;
  motivo: string;
  cacReal: number;
  /** Payback em meses com o CAC real — null se a margem não for positiva. */
  paybackMeses: number | null;
  tetoCac: number;
  investimentoSugerido: number;
}

/** Decide o nível (verde/amarelo/vermelho) e o investimento sugerido pro
 * mês seguinte, a partir do dado real de UM mês de campanha.
 *
 * - `churnRealFracao`: churn real do mês (calcularMetricasNegocio já
 *   calcula isso com precisão a partir de Cliente/EventoCakto reais — não
 *   pedimos esse número de novo ao Ibrahim, só reaproveitamos).
 * - `resultadoOperacionalDoMes`: receitaLiquida real do mês (DRE) menos
 *   infraestrutura real menos o investimento em Ads desse mês — calculado
 *   por quem chama esta função a partir do motor financeiro real do mês
 *   (evita duplicar a fórmula do DRE aqui).
 */
export function avaliarEscalaControlada(params: {
  dados: DadosReaisMesMarketing;
  churnRealFracao: number | null;
  churnMetaFracao: number;
  resultadoOperacionalDoMes: number;
  investimentoAnterior: number;
  motor: ParametrosMotorFinanceiro;
}): AvaliacaoEscala {
  const { dados, churnRealFracao, churnMetaFracao, resultadoOperacionalDoMes, investimentoAnterior, motor } = params;

  const cacReal = dados.novasAssinaturasPagas > 0 ? dados.investimentoReal / dados.novasAssinaturasPagas : Infinity;
  const tetoCac = tetoCacPaybackDoisMeses(motor);
  const paybackMeses = calcularPaybackMeses(cacReal, motor);

  const volumeSuficiente = dados.novasAssinaturasPagas >= VENDAS_MINIMAS_PARA_CONFIANCA;
  const retencaoOk = churnRealFracao != null ? churnRealFracao <= churnMetaFracao : null;

  let nivel: NivelEscala;
  let motivo: string;

  if (!volumeSuficiente) {
    nivel = "AMARELO";
    motivo = `Só ${dados.novasAssinaturasPagas} assinatura${dados.novasAssinaturasPagas === 1 ? "" : "s"} paga${dados.novasAssinaturasPagas === 1 ? "" : "s"} confirmada${dados.novasAssinaturasPagas === 1 ? "" : "s"} este mês — volume baixo demais pra decidir com confiança. Mantendo o investimento.`;
  } else if (retencaoOk === null) {
    nivel = "AMARELO";
    motivo = "Ainda não dá pra confirmar a retenção deste mês — mantendo o investimento.";
  } else if (cacReal > tetoCac || !retencaoOk) {
    nivel = "VERMELHO";
    motivo = cacReal > tetoCac
      ? `CAC atual de R$ ${cacReal.toFixed(2)} ultrapassa o teto definido de R$ ${tetoCac.toFixed(2)} — revisar criativo, público ou funil antes de investir mais.`
      : "Retenção abaixo da meta este mês — revisar antes de escalar.";
  } else if (cacReal <= CAC_LIMITE_VERDE && resultadoOperacionalDoMes > 0) {
    nivel = "VERDE";
    motivo = `CAC de R$ ${cacReal.toFixed(2)} está bem abaixo do teto de R$ ${tetoCac.toFixed(2)}, com retenção dentro da meta e resultado operacional positivo — dá pra escalar.`;
  } else {
    nivel = "AMARELO";
    motivo = `CAC de R$ ${cacReal.toFixed(2)} está entre R$ ${CAC_LIMITE_VERDE.toFixed(2)} e o teto de R$ ${tetoCac.toFixed(2)} — manter o investimento por enquanto.`;
  }

  // Trava de bootstrap: o aumento nunca passa de reinvestir 50% do
  // resultado operacional positivo do mês anterior, nem mais que +25% em
  // relação ao investimento anterior — usa o que for menor. Fora do
  // cenário verde, a sugestão é sempre manter o investimento (nunca
  // reduzir por um número arbitrário sem base no briefing).
  let investimentoSugerido = investimentoAnterior;
  if (nivel === "VERDE") {
    const aumentoDesejado = investimentoAnterior * PERCENTUAL_AUMENTO_VERDE;
    const tetoPorResultado = resultadoOperacionalDoMes > 0 ? resultadoOperacionalDoMes * PERCENTUAL_REINVESTIMENTO_RESULTADO : 0;
    const tetoPorPercentual = investimentoAnterior * PERCENTUAL_MAXIMO_AUMENTO_MES;
    const aumentoMaximo = Math.min(tetoPorResultado, tetoPorPercentual);
    investimentoSugerido = investimentoAnterior + Math.max(0, Math.min(aumentoDesejado, aumentoMaximo));
  }

  return { nivel, motivo, cacReal, paybackMeses, tetoCac, investimentoSugerido };
}
