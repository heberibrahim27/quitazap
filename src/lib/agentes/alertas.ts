// ─────────────────────────────────────────
// Sentinela — detectores determinísticos de alerta (parte pura, sem banco)
// ─────────────────────────────────────────
// Desenho acordado com o ChatGPT (04/10/2026): o Sentinela observa, gera
// CANDIDATOS de alerta, ranqueia e escolhe no máximo um por dia sob a
// política de envio (politica.ts). Nenhum número aqui vem de LLM: tudo é
// calculado pelo backend e entra em template fixo. LLM só entra, no
// serviço, pra redigir anomalia que o código já detectou.
//
// Vencimento de dívida/tarefa NÃO é detectado aqui: os crons de lembretes e
// de tarefas já avisam (D-3/D-1/D0) e são pedidos explícitos do cliente.

export type TipoAlerta =
  | "CATEGORY_BUDGET"
  | "NEGATIVE_PROJECTION"
  | "CARD_CLOSING"
  | "SPENDING_ANOMALY"
  | "MONTH_CLOSING"
  | "CARD_LIMIT_HIGH"
  | "CARD_NEXT_INVOICE_HEAVY"
  | "COMMITMENTS_WEEK"
  | "GOAL_MILESTONE"
  | "GOAL_STALLED"
  | "DEBT_OVERDUE"
  | "LOGGING_GAP"
  | "OUTROS_HIGH"
  | "QUIT_PLAN"
  | "DEBT_MILESTONE";

/** Quem PROPÕE cada tipo de alerta. Os agentes propõem; o portão único (politica.ts) decide. */
export type AgenteId = "sentinela" | "cartoes" | "compromissos" | "metas" | "dividas" | "lancamentos" | "fechamento" | "orientador";

/** Assunto do alerta: o portão evita duas mensagens do MESMO assunto em dias seguidos (exceto crítico). */
export type TopicoAlerta = "CASHFLOW_RISK" | "CARD_RISK" | "BUDGET_RISK" | "DEBT_RISK" | "GOALS" | "AGENDA" | "REVIEW" | "DATA_HYGIENE" | "ANOMALY" | "DEBT_PLAN";

export const TOPICO_DO_TIPO: Record<TipoAlerta, TopicoAlerta> = {
  NEGATIVE_PROJECTION: "CASHFLOW_RISK",
  CARD_NEXT_INVOICE_HEAVY: "CASHFLOW_RISK",
  CARD_LIMIT_HIGH: "CARD_RISK",
  CARD_CLOSING: "CARD_RISK",
  CATEGORY_BUDGET: "BUDGET_RISK",
  DEBT_OVERDUE: "DEBT_RISK",
  GOAL_MILESTONE: "GOALS",
  GOAL_STALLED: "GOALS",
  COMMITMENTS_WEEK: "AGENDA",
  MONTH_CLOSING: "REVIEW",
  LOGGING_GAP: "DATA_HYGIENE",
  OUTROS_HIGH: "DATA_HYGIENE",
  SPENDING_ANOMALY: "ANOMALY",
  QUIT_PLAN: "DEBT_PLAN",
  DEBT_MILESTONE: "DEBT_PLAN",
};

export const AGENTE_DO_TIPO: Record<TipoAlerta, AgenteId> = {
  CATEGORY_BUDGET: "sentinela",
  NEGATIVE_PROJECTION: "sentinela",
  SPENDING_ANOMALY: "sentinela",
  CARD_CLOSING: "cartoes",
  CARD_LIMIT_HIGH: "cartoes",
  CARD_NEXT_INVOICE_HEAVY: "cartoes",
  COMMITMENTS_WEEK: "compromissos",
  GOAL_MILESTONE: "metas",
  GOAL_STALLED: "metas",
  DEBT_OVERDUE: "dividas",
  LOGGING_GAP: "lancamentos",
  OUTROS_HIGH: "lancamentos",
  MONTH_CLOSING: "fechamento",
  QUIT_PLAN: "orientador",
  DEBT_MILESTONE: "orientador",
};

export interface CandidatoAlerta {
  tipo: TipoAlerta;
  /** Identidade estável do que o alerta é sobre (categoria, cartão, insight). */
  entityId: string;
  /** Faixa/estágio: "80", "BELOW_500", "D-2"… — mudar de faixa libera novo alerta. */
  qualifier: string;
  /** Identidade temporal própria do tipo: mês, data do fechamento… */
  periodKey: string;
  /** 0–100; abaixo de `prioridadeMinima` da política nunca é enviado. */
  prioridade: number;
  mensagem: string;
  payload?: Record<string, unknown>;
  /** Instante lógico do ciclo em que os dados foram lidos (todos os candidatos de um ciclo compartilham). */
  asOf?: Date;
}

export function chaveDedupe(c: Pick<CandidatoAlerta, "tipo" | "entityId" | "qualifier" | "periodKey">): string {
  return [c.tipo, c.entityId, c.qualifier, c.periodKey].join("|");
}

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}

const ORDEM_DESEMPATE: Record<TipoAlerta, number> = {
  DEBT_OVERDUE: 0,
  NEGATIVE_PROJECTION: 1,
  CATEGORY_BUDGET: 2,
  CARD_LIMIT_HIGH: 3,
  CARD_CLOSING: 4,
  MONTH_CLOSING: 5,
  COMMITMENTS_WEEK: 6,
  CARD_NEXT_INVOICE_HEAVY: 7,
  GOAL_MILESTONE: 8,
  SPENDING_ANOMALY: 9,
  GOAL_STALLED: 10,
  LOGGING_GAP: 11,
  OUTROS_HIGH: 12,
  DEBT_MILESTONE: 8.5,
  QUIT_PLAN: 6.5,
};

/** Mais prioritário primeiro; empate resolvido pelo tipo (ordem fixa) e pela chave. */
export function ordenarCandidatos(candidatos: CandidatoAlerta[]): CandidatoAlerta[] {
  return [...candidatos].sort(
    (a, b) =>
      b.prioridade - a.prioridade ||
      ORDEM_DESEMPATE[a.tipo] - ORDEM_DESEMPATE[b.tipo] ||
      chaveDedupe(a).localeCompare(chaveDedupe(b))
  );
}

// ── Orçamento por categoria: 80 / 90 / 100 % ─────────────────────────────

export interface CategoriaOrcamento {
  categoria: string;
  limite: number;
  gasto: number;
}

export function detectarOrcamento(
  categorias: CategoriaOrcamento[],
  contexto: { periodKey: string; diasRestantes: number }
): CandidatoAlerta[] {
  const candidatos: CandidatoAlerta[] = [];
  for (const c of categorias) {
    if (!(c.limite > 0)) continue;
    const razao = c.gasto / c.limite;
    // Só a faixa MAIS ALTA atingida vira candidato: pular de 70% a 120% manda
    // um alerta de estouro, não três.
    const faixa = razao >= 1 ? 100 : razao >= 0.9 ? 90 : razao >= 0.8 ? 80 : null;
    if (faixa == null) continue;

    const restante = Math.max(c.limite - c.gasto, 0);
    const dias = Math.max(contexto.diasRestantes, 0);
    // Prioridades por EVENTO (tabela acordada com o ChatGPT): 100% = 94, 90% = 88, 80% = 78.
    const prioridade = faixa === 100 ? 94 : faixa === 90 ? 88 : 78;

    const mensagem =
      faixa === 100
        ? `🚨 *Orçamento de ${c.categoria}:* você passou do limite — gastou ${brl(c.gasto)} de ${brl(c.limite)} (${brl(c.gasto - c.limite)} acima).`
        : `📊 *Orçamento de ${c.categoria}:* você já usou ${Math.round(razao * 100)}% do limite (${brl(c.gasto)} de ${brl(c.limite)}).` +
          (dias > 0 ? ` Restam ${brl(restante)} para ${dias} ${dias === 1 ? "dia" : "dias"} — cerca de ${brl(restante / dias)} por dia.` : ` Restam ${brl(restante)}.`);

    candidatos.push({
      tipo: "CATEGORY_BUDGET",
      entityId: c.categoria,
      qualifier: String(faixa),
      periodKey: contexto.periodKey,
      prioridade,
      mensagem,
      payload: { categoria: c.categoria, limite: c.limite, gasto: c.gasto, faixa },
    });
  }
  return candidatos;
}

// ── Projeção do mês no vermelho ──────────────────────────────────────────

export function detectarProjecaoNegativa(
  entrada: { saldoLivre: number; semDadosSuficientes: boolean; diasRestantes: number },
  contexto: { periodKey: string }
): CandidatoAlerta[] {
  if (entrada.semDadosSuficientes || !(entrada.saldoLivre < 0)) return [];
  const falta = Math.abs(entrada.saldoLivre);
  // Faixas de severidade: só um alerta novo se o buraco piorar de patamar.
  const faixa = falta >= 1000 ? "BELOW_1000" : falta >= 500 ? "BELOW_500" : "BELOW_0";
  const dias = Math.max(entrada.diasRestantes, 0);
  return [
    {
      tipo: "NEGATIVE_PROJECTION",
      entityId: "GLOBAL",
      qualifier: faixa,
      periodKey: contexto.periodKey,
      // severa (>= R$ 1.000 no vermelho) 96; moderada 90
      prioridade: faixa === "BELOW_1000" ? 96 : 90,
      mensagem:
        `⚠️ *Atenção ao mês:* pelo que está registrado (renda, contas e dívidas), a projeção fecha em *${brl(falta)} no vermelho*` +
        (dias > 0 ? ` — ainda faltam ${dias} ${dias === 1 ? "dia" : "dias"}.` : ".") +
        `\nQuer ver o plano de pagamento? Responda *plano*.`,
      payload: { saldoLivre: entrada.saldoLivre, faixa },
    },
  ];
}

// ── Fechamento de fatura em 2 dias ───────────────────────────────────────

export interface CartaoParaAlerta {
  id: string;
  nome: string;
  diaFechamento: number | null;
  /** Fatura aberta atual (já calculada pelo ciclo do cartão), se conhecida. */
  valorFaturaAberta?: number;
}

function componentesBrasil(data: Date): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(data)
    .split("-")
    .map(Number);
  return { ano, mes, dia };
}

function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Próxima data de fechamento (>= hoje, em Brasília) como yyyy-mm-dd. */
export function proximoFechamento(diaFechamento: number, agora: Date): { iso: string; diasAte: number } {
  const hoje = componentesBrasil(agora);
  let ano = hoje.ano;
  let mes = hoje.mes;
  let dia = Math.min(diaFechamento, ultimoDia(ano, mes));
  if (dia < hoje.dia) {
    mes = mes === 12 ? 1 : mes + 1;
    ano = mes === 1 ? ano + 1 : ano;
    dia = Math.min(diaFechamento, ultimoDia(ano, mes));
  }
  const alvo = Date.UTC(ano, mes - 1, dia);
  const base = Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia);
  return {
    iso: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
    diasAte: Math.round((alvo - base) / 86_400_000),
  };
}

export function detectarFechamentoFatura(cartoes: CartaoParaAlerta[], agora: Date): CandidatoAlerta[] {
  const candidatos: CandidatoAlerta[] = [];
  for (const c of cartoes) {
    if (c.diaFechamento == null) continue;
    const { iso, diasAte } = proximoFechamento(c.diaFechamento, agora);
    if (diasAte !== 2) continue;
    const dd = iso.slice(8, 10) + "/" + iso.slice(5, 7);
    candidatos.push({
      tipo: "CARD_CLOSING",
      entityId: c.id,
      qualifier: "D-2",
      periodKey: iso,
      prioridade: 82,
      mensagem:
        `💳 *Fatura do ${c.nome}:* fecha em 2 dias (${dd}).` +
        (c.valorFaturaAberta != null && c.valorFaturaAberta > 0 ? ` Até agora a fatura aberta soma ${brl(c.valorFaturaAberta)}.` : "") +
        ` Compras feitas depois do fechamento entram na fatura seguinte.`,
      payload: { cartao: c.nome, fechamento: iso },
    });
  }
  return candidatos;
}

// ── Fechamento do mês (resumo determinístico do mês que acabou) ──────────

export interface FechamentoMes {
  /** "setembro de 2026" */
  nomeMes: string;
  /** yyyy-mm do mês que fechou */
  periodKey: string;
  receitas: number;
  saidas: number;
  /** receitas − saídas (antes de guardar em metas) */
  resultado: number;
  /** depósitos − saques em metas no mês (pode ser negativo) */
  guardadoEmMetas: number;
  topCategoria: { categoria: string; total: number } | null;
  quantidadeLancamentos: number;
}

/**
 * Coach: UMA dica determinística calculada pelo backend (nada de LLM). Só
 * aparece quando a categoria pesa de verdade no mês (>= 20% das saídas).
 */
export function dicaDoCoach(topCategoria: { categoria: string; total: number } | null, saidas: number): string | null {
  if (!topCategoria || !(saidas > 0)) return null;
  if (topCategoria.total / saidas < 0.2) return null;
  const economia = Math.round(topCategoria.total * 0.1 * 100) / 100;
  return `💡 *Dica do Coach:* sua maior categoria foi ${topCategoria.categoria} (${brl(topCategoria.total)}). Reduzir 10% libera ${brl(economia)} por mês.`;
}

/** O resumo só é oferecido nos 3 primeiros dias do mês (se a cota do dia 1
 * estiver ocupada, tenta no 2 e no 3); depois disso o mês "já passou". */
export function detectarFechamentoMes(f: FechamentoMes | null, diaDoMes: number): CandidatoAlerta[] {
  if (!f || diaDoMes < 1 || diaDoMes > 3 || f.quantidadeLancamentos === 0) return [];
  const sinal = f.resultado >= 0 ? "sobrou" : "faltou";
  const linhas = [
    `📅 *Fechamento de ${f.nomeMes}*`,
    ``,
    `💰 Entrou: ${brl(f.receitas)}`,
    `💸 Saiu: ${brl(f.saidas)}`,
    `📊 No mês ${sinal}: ${brl(Math.abs(f.resultado))}`,
  ];
  if (f.guardadoEmMetas > 0) linhas.push(`🎯 Guardado em metas: ${brl(f.guardadoEmMetas)}`);
  if (f.topCategoria) linhas.push(`🏷️ Onde mais gastou: ${f.topCategoria.categoria} (${brl(f.topCategoria.total)})`);
  const dica = dicaDoCoach(f.topCategoria, f.saidas);
  if (dica) linhas.push(``, dica);
  linhas.push(``, `_Considera só o que foi registrado no QuitaZAP._`);
  return [
    {
      tipo: "MONTH_CLOSING",
      entityId: "GLOBAL",
      qualifier: "MONTH",
      periodKey: f.periodKey,
      prioridade: 70,
      mensagem: linhas.join("\n"),
      payload: { receitas: f.receitas, saidas: f.saidas, resultado: f.resultado, coach: dica != null },
    },
  ];
}

// ── Gasto anômalo (insight já detectado por deteccao-anomalia.ts) ────────

export interface InsightParaAlerta {
  id: string;
  categoria: string;
  mes: string;
  totalMesAtual: number;
  mediaUltimosMeses: number;
  multiplicador: number;
  textoGerado: string;
}

export function detectarAnomalias(insights: InsightParaAlerta[]): CandidatoAlerta[] {
  return insights.map((i) => ({
    tipo: "SPENDING_ANOMALY" as const,
    entityId: i.id,
    qualifier: "ANOMALY",
    periodKey: i.mes,
    // variável: leve 55, moderada 70, forte 85 (segue desligada enquanto em modo sombra)
    prioridade: i.multiplicador >= 2.5 ? 85 : i.multiplicador >= 1.5 ? 70 : 55,
    mensagem: `🔎 ${i.textoGerado}`,
    payload: { categoria: i.categoria, totalMesAtual: i.totalMesAtual, mediaUltimosMeses: i.mediaUltimosMeses, multiplicador: i.multiplicador },
  }));
}
