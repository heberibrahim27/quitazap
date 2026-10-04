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
  | "MONTH_CLOSING";

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
}

export function chaveDedupe(c: Pick<CandidatoAlerta, "tipo" | "entityId" | "qualifier" | "periodKey">): string {
  return [c.tipo, c.entityId, c.qualifier, c.periodKey].join("|");
}

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}

const ORDEM_DESEMPATE: Record<TipoAlerta, number> = {
  NEGATIVE_PROJECTION: 0,
  CATEGORY_BUDGET: 1,
  CARD_CLOSING: 2,
  SPENDING_ANOMALY: 3,
  MONTH_CLOSING: 4,
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
    const base = faixa === 100 ? 75 : faixa === 90 ? 60 : 45;
    // Sobra mês pela frente = mais espaço pra reagir = mais vale avisar.
    const prioridade = base + (dias >= 10 ? 5 : 0);

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
      prioridade: faixa === "BELOW_1000" ? 90 : 85,
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
      prioridade: 55,
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
  linhas.push(``, `_Considera só o que foi registrado no QuitaZAP._`);
  return [
    {
      tipo: "MONTH_CLOSING",
      entityId: "GLOBAL",
      qualifier: "MONTH",
      periodKey: f.periodKey,
      prioridade: 70,
      mensagem: linhas.join("\n"),
      payload: { receitas: f.receitas, saidas: f.saidas, resultado: f.resultado },
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
    prioridade: 50,
    mensagem: `🔎 ${i.textoGerado}`,
    payload: { categoria: i.categoria, totalMesAtual: i.totalMesAtual, mediaUltimosMeses: i.mediaUltimosMeses, multiplicador: i.multiplicador },
  }));
}
