// ─────────────────────────────────────────
// NotificationPolicy — quando um alerta proativo PODE sair (função pura)
// ─────────────────────────────────────────
// Trava de autonomia do Sentinela (desenho acordado com o ChatGPT,
// 04/10/2026). O agente decide O QUE vale avisar; esta política decide SE
// pode sair agora. WhatsApp via Z-API não-oficial: o risco real é denúncia/
// bloqueio do número, não janela de 24h — por isso limites baixos, silêncio
// à noite, opt-out por tipo e dedupe.

import { AGENTE_DO_TIPO, TOPICO_DO_TIPO, chaveDedupe, ordenarCandidatos, type AgenteId, type CandidatoAlerta, type TipoAlerta } from "./alertas";

export interface ConfigPolitica {
  maxPorDia: number;
  maxPorSemana: number;
  /** Hora (Brasília) em que o silêncio começa (inclusive) e termina (exclusive). */
  silencioInicio: number;
  silencioFim: number;
  prioridadeMinima: number;
  diasSemRepetirTopico: number;
  criticoAcima: number;
}

export const POLITICA_PADRAO: ConfigPolitica = {
  maxPorDia: 1,
  maxPorSemana: 4,
  silencioInicio: 21,
  silencioFim: 8,
  // 20: o menor evento da tabela de prioridades (parou de registrar) vale 22 —
  // o piso só barra candidato sem peso nenhum.
  prioridadeMinima: 20,
  /** Mesmo ASSUNTO em dias seguidos só passa se for crítico (prioridade >= criticoAcima). */
  diasSemRepetirTopico: 2,
  criticoAcima: 90,
};

export interface HistoricoAlerta {
  dedupeKey: string;
  tipo: TipoAlerta;
  enviadoEm: Date;
}

export type MotivoBloqueio =
  | "PROATIVAS_DESLIGADAS"
  | "TIPO_DESLIGADO"
  | "HORARIO_SILENCIO"
  | "LIMITE_DIARIO"
  | "LIMITE_SEMANAL"
  | "JA_ENVIADO"
  | "TOPICO_RECENTE"
  | "AGENTE_PAUSADO"
  | "PRIORIDADE_BAIXA";

export type DecisaoPolitica = { enviar: true } | { enviar: false; motivo: MotivoBloqueio };

export interface EntradaPolitica {
  agora: Date;
  aceitaProativas: boolean;
  /** Tipos silenciados pelo cliente ("parar esse alerta"); "TODOS" desliga tudo. */
  tiposDesligados: string[];
  historico: HistoricoAlerta[];
  config?: ConfigPolitica;
}

function dataBrasil(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

function horaBrasil(d: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(d);
  return Number(h) % 24;
}

export function emHorarioDeSilencio(agora: Date, config: ConfigPolitica = POLITICA_PADRAO): boolean {
  const h = horaBrasil(agora);
  return config.silencioInicio > config.silencioFim
    ? h >= config.silencioInicio || h < config.silencioFim
    : h >= config.silencioInicio && h < config.silencioFim;
}

/** Bloqueios que valem pra QUALQUER candidato (cliente, horário, cotas). */
export function bloqueioGlobal(e: EntradaPolitica): MotivoBloqueio | null {
  const config = e.config ?? POLITICA_PADRAO;
  if (!e.aceitaProativas || e.tiposDesligados.includes("TODOS")) return "PROATIVAS_DESLIGADAS";
  if (emHorarioDeSilencio(e.agora, config)) return "HORARIO_SILENCIO";

  const hoje = dataBrasil(e.agora);
  const enviadosHoje = e.historico.filter((h) => dataBrasil(h.enviadoEm) === hoje).length;
  if (enviadosHoje >= config.maxPorDia) return "LIMITE_DIARIO";

  const seteDias = e.agora.getTime() - 7 * 86_400_000;
  const naSemana = e.historico.filter((h) => h.enviadoEm.getTime() > seteDias).length;
  if (naSemana >= config.maxPorSemana) return "LIMITE_SEMANAL";
  return null;
}

/** Bloqueios que dependem do candidato (tipo, dedupe, prioridade). */
export function bloqueioDoCandidato(c: CandidatoAlerta, e: EntradaPolitica): MotivoBloqueio | null {
  const config = e.config ?? POLITICA_PADRAO;
  if (e.tiposDesligados.includes(c.tipo)) return "TIPO_DESLIGADO";
  if (c.prioridade < config.prioridadeMinima) return "PRIORIDADE_BAIXA";
  const chave = chaveDedupe(c);
  if (e.historico.some((h) => h.dedupeKey === chave)) return "JA_ENVIADO";
  // Duplicidade semântica: dois alertas do mesmo ASSUNTO em dias seguidos
  // (ex.: "mês no vermelho" e "próxima fatura pesada") — exceto crítico.
  if (c.prioridade < config.criticoAcima) {
    const topico = TOPICO_DO_TIPO[c.tipo];
    const limite = e.agora.getTime() - config.diasSemRepetirTopico * 86_400_000;
    if (e.historico.some((h) => TOPICO_DO_TIPO[h.tipo] === topico && h.enviadoEm.getTime() > limite)) return "TOPICO_RECENTE";
  }
  return null;
}

export function decidirEnvio(c: CandidatoAlerta, e: EntradaPolitica): DecisaoPolitica {
  const motivo = bloqueioGlobal(e) ?? bloqueioDoCandidato(c, e);
  return motivo ? { enviar: false, motivo } : { enviar: true };
}

// ── Disjuntor global ─────────────────────────────────────────────────────
// Se nos últimos 7 dias uma fatia grande dos alertas foi marcada como ERRADA
// ou levou o cliente a silenciar, a proatividade pausa até alguém olhar — um
// alerta errado em escala é pior do que nenhum alerta (ChatGPT, 04/10/2026).

export interface SaudeAlertas {
  enviados: number;
  errados: number;
  silenciados: number;
}

export const DISJUNTOR = { minimoEnviados: 10, taxaMaxima: 0.3 };

export function disjuntorAberto(s: SaudeAlertas): boolean {
  if (s.enviados < DISJUNTOR.minimoEnviados) return false;
  return (s.errados + s.silenciados) / s.enviados > DISJUNTOR.taxaMaxima;
}

export interface EstatisticaAgente {
  /** candidatos brutos que o agente gerou neste cliente */
  brutos: number;
  /** barrados pela política (dedupe, tópico recente, tipo desligado...) */
  bloqueados: number;
  /** o UNICO candidato que o agente entregou ao árbitro (null = nada a propor) */
  proposto: string | null;
}

export interface ResultadoEscolha {
  escolhido: CandidatoAlerta | null;
  /** Por que nada saiu (bloqueio global) ou quais candidatos foram pulados. */
  bloqueioGlobal: MotivoBloqueio | null;
  pulados: Array<{ chave: string; motivo: MotivoBloqueio }>;
  /** Um candidato por agente (o melhor que a política libera) — o pool do árbitro. */
  propostos: CandidatoAlerta[];
  porAgente: Partial<Record<AgenteId, EstatisticaAgente>>;
}

/**
 * Arbitragem em dois passos (desenho acordado com o ChatGPT, 04/10/2026):
 * 1) cada AGENTE entrega no máximo 1 candidato por cliente por ciclo — o melhor
 *    dele que a política libera;
 * 2) o árbitro escolhe, entre esses, o de maior prioridade. Um vencedor no máximo.
 * Bloqueio global (silêncio, cota, opt-out) encerra na hora; bloqueio por
 * candidato (dedupe, tópico recente, tipo desligado, prioridade) só pula pro próximo.
 */
export function escolherAlerta(candidatos: CandidatoAlerta[], e: EntradaPolitica): ResultadoEscolha {
  const vazio: ResultadoEscolha = { escolhido: null, bloqueioGlobal: null, pulados: [], propostos: [], porAgente: {} };
  const global = bloqueioGlobal(e);
  if (global) return { ...vazio, bloqueioGlobal: global };

  const resultado: ResultadoEscolha = { ...vazio, pulados: [], propostos: [], porAgente: {} };
  for (const c of ordenarCandidatos(candidatos)) {
    const agente = AGENTE_DO_TIPO[c.tipo];
    const stats = (resultado.porAgente[agente] ??= { brutos: 0, bloqueados: 0, proposto: null });
    stats.brutos++;
    const motivo = bloqueioDoCandidato(c, e);
    if (motivo) {
      stats.bloqueados++;
      resultado.pulados.push({ chave: chaveDedupe(c), motivo });
      continue;
    }
    if (stats.proposto == null) {
      stats.proposto = chaveDedupe(c);
      resultado.propostos.push(c);
    }
  }
  // candidatos já vêm em ordem de prioridade: o primeiro proposto é o vencedor
  resultado.escolhido = resultado.propostos[0] ?? null;
  return resultado;
}

// ── Disjuntor por agente ─────────────────────────────────────────────────

export interface SaudeTipo {
  tipo: string;
  enviados: number;
  errados: number;
  silenciados: number;
}

/** Agentes cuja taxa de errado/silenciado passou do limite (mesma regra do disjuntor global, por agente). */
export function agentesPausadosPorDisjuntor(saude: SaudeTipo[]): AgenteId[] {
  const soma = new Map<AgenteId, SaudeAlertas>();
  for (const s of saude) {
    const agente = AGENTE_DO_TIPO[s.tipo as TipoAlerta];
    if (!agente) continue; // "TODOS" etc.
    const atual = soma.get(agente) ?? { enviados: 0, errados: 0, silenciados: 0 };
    atual.enviados += s.enviados;
    atual.errados += s.errados;
    atual.silenciados += s.silenciados;
    soma.set(agente, atual);
  }
  return [...soma.entries()].filter(([, s]) => disjuntorAberto(s)).map(([agente]) => agente);
}
