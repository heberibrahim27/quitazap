// ─────────────────────────────────────────
// Detectores dos agentes Cartões, Compromissos, Metas, Dívidas e Lançamentos
// (parte pura, sem banco)
// ─────────────────────────────────────────
// Cada agente observa os dados do cliente e PROPÕE candidatos de alerta;
// quem decide se algum sai é o portão único (politica.ts: 1/dia, 4/semana,
// silêncio, opt-out, dedupe, disjuntor). Todo número do texto é calculado
// aqui, no backend — nunca por LLM.

import { brl, type CandidatoAlerta } from "./alertas";

const FUSO = "America/Sao_Paulo";

function componentes(data: Date): { ano: number; mes: number; dia: number; semana: number } {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(data)
    .split("-")
    .map(Number);
  const semana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay(); // 0 = domingo, 1 = segunda
  return { ano, mes, dia, semana };
}

const iso = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const ddmm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO }).format(d);
const diaCalendario = (d: Date) => {
  const c = componentes(d);
  return Date.UTC(c.ano, c.mes - 1, c.dia);
};
const mesChave = (d: Date) => {
  const c = componentes(d);
  return `${c.ano}-${String(c.mes).padStart(2, "0")}`;
};

/** Segunda-feira (yyyy-mm-dd, Brasília) da semana de `d` — identidade semanal dos alertas. */
export function inicioDaSemana(d: Date): string {
  const c = componentes(d);
  const atras = (c.semana + 6) % 7; // segunda = 0
  const alvo = new Date(Date.UTC(c.ano, c.mes - 1, c.dia - atras));
  return iso(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, alvo.getUTCDate());
}

// ── Agente CARTÕES ───────────────────────────────────────────────────────

export interface CartaoLimite {
  id: string;
  nome: string;
  limite: number | null;
  /** Limite comprometido: faturas ainda não vencidas + futuras (ver comprometidoDoCartao). */
  comprometido: number;
}

export const LIMIAR_LIMITE_CARTAO = 0.8;

export function detectarLimiteCartao(cartoes: CartaoLimite[], periodKey: string): CandidatoAlerta[] {
  const out: CandidatoAlerta[] = [];
  for (const c of cartoes) {
    if (!c.limite || c.limite <= 0) continue;
    const razao = c.comprometido / c.limite;
    const faixa = razao >= 1 ? 100 : razao >= 0.9 ? 90 : razao >= LIMIAR_LIMITE_CARTAO ? 80 : null;
    if (faixa == null) continue;
    const livre = Math.max(c.limite - c.comprometido, 0);
    out.push({
      tipo: "CARD_LIMIT_HIGH",
      entityId: c.id,
      qualifier: String(faixa),
      periodKey,
      prioridade: faixa === 100 ? 98 : faixa === 90 ? 92 : 84,
      mensagem:
        faixa === 100
          ? `💳 *Limite do ${c.nome}:* você usou todo o limite (${brl(c.comprometido)} de ${brl(c.limite)}). Novas compras podem ser recusadas.`
          : `💳 *Limite do ${c.nome}:* ${Math.round(razao * 100)}% comprometido (${brl(c.comprometido)} de ${brl(c.limite)}). Ainda tem ${brl(livre)} disponíveis.`,
      payload: { cartao: c.nome, limite: c.limite, comprometido: c.comprometido, faixa },
    });
  }
  return out;
}

export interface FaturaFutura {
  cartaoId: string;
  cartaoNome: string;
  /** "Nov/2026" */
  rotulo: string;
  /** yyyy-mm do vencimento da fatura futura (identidade do período) */
  periodoFatura: string;
  valor: number;
}

export const LIMIAR_FATURA_PESADA = 0.3;
/** Piso absoluto: sem ele, renda baixa + fatura pequena disparava alerta ridículo. */
export const PISO_FATURA_PESADA = 300;

export function detectarFaturaFuturaPesada(faturas: FaturaFutura[], renda: number | null): CandidatoAlerta[] {
  if (!renda || renda <= 0) return [];
  const out: CandidatoAlerta[] = [];
  for (const f of faturas) {
    const razao = f.valor / renda;
    if (razao < LIMIAR_FATURA_PESADA || f.valor < PISO_FATURA_PESADA) continue;
    out.push({
      tipo: "CARD_NEXT_INVOICE_HEAVY",
      entityId: f.cartaoId,
      qualifier: "30",
      periodKey: f.periodoFatura,
      prioridade: 80,
      mensagem: `💳 *Fatura de ${f.rotulo} do ${f.cartaoNome}:* já está em ${brl(f.valor)} só com compras e parcelas agendadas — ${Math.round(razao * 100)}% da sua renda mensal. Vale segurar novas compras nesse cartão.`,
      payload: { cartao: f.cartaoNome, valor: f.valor, rotulo: f.rotulo },
    });
  }
  return out;
}

// ── Agente COMPROMISSOS ──────────────────────────────────────────────────

export interface Compromisso {
  descricao: string;
  data: Date;
  valor: number | null;
}

/** Resumo semanal na segunda-feira: o que vence nos próximos 7 dias. */
export function detectarCompromissosDaSemana(itens: Compromisso[], agora: Date): CandidatoAlerta[] {
  const hoje = componentes(agora);
  if (hoje.semana !== 1) return []; // só segunda-feira
  const base = diaCalendario(agora);
  const proximos = itens
    .filter((i) => {
      const dias = Math.round((diaCalendario(i.data) - base) / 86_400_000);
      return dias >= 0 && dias <= 6;
    })
    .sort((a, b) => a.data.getTime() - b.data.getTime());
  if (proximos.length === 0) return [];
  const total = proximos.reduce((s, i) => s + (i.valor ?? 0), 0);
  const linhas = proximos.slice(0, 5).map((i) => `• ${ddmm(i.data)} — ${i.descricao}${i.valor ? ` — ${brl(i.valor)}` : ""}`);
  if (proximos.length > 5) linhas.push(`• e mais ${proximos.length - 5}`);
  return [
    {
      tipo: "COMMITMENTS_WEEK",
      entityId: "GLOBAL",
      qualifier: "WEEK",
      periodKey: inicioDaSemana(agora),
      prioridade: 65,
      mensagem:
        `📅 *Semana que começa:* ${proximos.length} ${proximos.length === 1 ? "compromisso" : "compromissos"} nos próximos 7 dias` +
        (total > 0 ? `, somando ${brl(total)}` : "") +
        `.\n${linhas.join("\n")}`,
      payload: { quantidade: proximos.length, total },
    },
  ];
}

// ── Agente METAS ─────────────────────────────────────────────────────────

export interface MetaProgresso {
  id: string;
  nome: string;
  alvo: number;
  guardado: number;
  /** Última movimentação (depósito) ou, se nunca houve, a criação da meta. */
  ultimaAtividade: Date;
}

export const DIAS_META_PARADA = 30;

export function detectarMetas(metas: MetaProgresso[], agora: Date): CandidatoAlerta[] {
  const out: CandidatoAlerta[] = [];
  for (const m of metas) {
    if (!(m.alvo > 0)) continue;
    const pct = (m.guardado / m.alvo) * 100;
    const marco = pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : null;
    if (marco != null) {
      out.push({
        tipo: "GOAL_MILESTONE",
        entityId: m.id,
        qualifier: String(marco),
        periodKey: "VIDA", // marco só se comemora uma vez na vida da meta
        prioridade: marco === 100 ? 60 : marco === 75 ? 52 : marco === 50 ? 48 : 44,
        mensagem:
          marco === 100
            ? `🎉 *Meta ${m.nome} concluída!* Você guardou ${brl(m.guardado)} de ${brl(m.alvo)}. Parabéns!`
            : `🎯 *Meta ${m.nome}:* você chegou a ${marco}% — ${brl(m.guardado)} de ${brl(m.alvo)}. Continue assim!`,
        payload: { meta: m.nome, marco, guardado: m.guardado, alvo: m.alvo },
      });
    }
    const diasParada = Math.floor((diaCalendario(agora) - diaCalendario(m.ultimaAtividade)) / 86_400_000);
    if (m.guardado < m.alvo && diasParada >= DIAS_META_PARADA) {
      out.push({
        tipo: "GOAL_STALLED",
        entityId: m.id,
        qualifier: "30D",
        periodKey: mesChave(agora),
        prioridade: 35,
        mensagem: `🎯 A meta *${m.nome}* está parada há ${diasParada} dias (${Math.round(pct)}% de ${brl(m.alvo)}). Que tal guardar um pouco este mês? Ex.: "guardar 100 na ${m.nome.toLowerCase()}".`,
        payload: { meta: m.nome, diasParada },
      });
    }
  }
  return out;
}

// ── Agente DÍVIDAS ───────────────────────────────────────────────────────

export interface ParcelaAtrasada {
  credor: string;
  numero: number;
  valor: number;
  vencimento: Date;
}

/** Parcelas pendentes com vencimento antes de hoje (dívidas descontadas em folha ficam de fora na consulta). */
export function detectarDividasAtrasadas(parcelas: ParcelaAtrasada[], agora: Date): CandidatoAlerta[] {
  const base = diaCalendario(agora);
  const atrasadas = parcelas.filter((p) => diaCalendario(p.vencimento) < base).sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());
  if (atrasadas.length === 0) return [];
  const total = atrasadas.reduce((s, p) => s + p.valor, 0);
  const maisAntiga = atrasadas[0];
  const dias = Math.round((base - diaCalendario(maisAntiga.vencimento)) / 86_400_000);
  return [
    {
      tipo: "DEBT_OVERDUE",
      entityId: "GLOBAL",
      qualifier: `${atrasadas.length}P`,
      periodKey: inicioDaSemana(agora), // no máximo 1x por semana por quantidade de parcelas em atraso
      prioridade: 100,
      mensagem:
        `⚠️ *Parcelas em atraso:* ${atrasadas.length === 1 ? "1 parcela vencida" : `${atrasadas.length} parcelas vencidas`}, somando ${brl(total)}. ` +
        `A mais antiga é ${maisAntiga.credor} (${ddmm(maisAntiga.vencimento)}, ${dias} ${dias === 1 ? "dia" : "dias"} de atraso).\n` +
        `Se já pagou, marque como paga em Meu Plano. Se não, responda *plano* pra ver por onde começar.`,
      payload: { quantidade: atrasadas.length, total },
    },
  ];
}

// ── Agente LANÇAMENTOS ───────────────────────────────────────────────────

export interface AtividadeLancamentos {
  /** Data do último lançamento do cliente, ou null se nunca registrou. */
  ultimoLancamento: Date | null;
  /** Dias DISTINTOS com lançamento nos 14 dias que terminam no último lançamento (hábito comprovado). */
  diasComRegistroAntesDaPausa: number;
  /** Total de gastos do mês e quanto está em "Outros". */
  gastoMes: number;
  gastoOutrosMes: number;
}

export const DIAS_SEM_REGISTRO = 5;
export const LIMIAR_OUTROS = 0.3;
/** Piso absoluto: R$ 40 de R$ 100 em "Outros" não vale uma mensagem. */
export const PISO_OUTROS = 150;
/** Só cobra quem tinha hábito: pelo menos 8 dos 14 dias antes da pausa com registro. */
export const DIAS_DE_HABITO_MINIMO = 8;

export function detectarLancamentos(a: AtividadeLancamentos, agora: Date): CandidatoAlerta[] {
  const out: CandidatoAlerta[] = [];

  if (a.ultimoLancamento && a.diasComRegistroAntesDaPausa >= DIAS_DE_HABITO_MINIMO) {
    const dias = Math.floor((diaCalendario(agora) - diaCalendario(a.ultimoLancamento)) / 86_400_000);
    if (dias >= DIAS_SEM_REGISTRO) {
      out.push({
        tipo: "LOGGING_GAP",
        entityId: "GLOBAL",
        qualifier: dias >= 14 ? "14D" : "5D",
        periodKey: mesChave(agora),
        prioridade: 22,
        mensagem: `📝 Faz ${dias} dias que não vejo lançamentos seus. Quer registrar o que gastou? É só mandar, por exemplo: "gastei 30 no mercado".`,
        payload: { dias },
      });
    }
  }

  if (a.gastoMes > 0 && a.gastoOutrosMes >= PISO_OUTROS && a.gastoOutrosMes / a.gastoMes >= LIMIAR_OUTROS) {
    const pct = Math.round((a.gastoOutrosMes / a.gastoMes) * 100);
    out.push({
      tipo: "OUTROS_HIGH",
      entityId: "GLOBAL",
      qualifier: "30",
      periodKey: mesChave(agora),
      prioridade: 28,
      mensagem: `🏷️ Cerca de ${pct}% dos seus gastos deste mês (${brl(a.gastoOutrosMes)}) estão em "Outros". Se me disser o que foram, eu classifico melhor e seus relatórios ficam mais certos.`,
      payload: { pct, valor: a.gastoOutrosMes },
    });
  }
  return out;
}
