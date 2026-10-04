// ─────────────────────────────────────────
// NotificationPolicy — quando um alerta proativo PODE sair (função pura)
// ─────────────────────────────────────────
// Trava de autonomia do Sentinela (desenho acordado com o ChatGPT,
// 04/10/2026). O agente decide O QUE vale avisar; esta política decide SE
// pode sair agora. WhatsApp via Z-API não-oficial: o risco real é denúncia/
// bloqueio do número, não janela de 24h — por isso limites baixos, silêncio
// à noite, opt-out por tipo e dedupe.

import { chaveDedupe, ordenarCandidatos, type CandidatoAlerta, type TipoAlerta } from "./alertas";

export interface ConfigPolitica {
  maxPorDia: number;
  maxPorSemana: number;
  /** Hora (Brasília) em que o silêncio começa (inclusive) e termina (exclusive). */
  silencioInicio: number;
  silencioFim: number;
  prioridadeMinima: number;
}

export const POLITICA_PADRAO: ConfigPolitica = {
  maxPorDia: 1,
  maxPorSemana: 4,
  silencioInicio: 21,
  silencioFim: 8,
  prioridadeMinima: 30,
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

export interface ResultadoEscolha {
  escolhido: CandidatoAlerta | null;
  /** Por que nada saiu (bloqueio global) ou quais candidatos foram pulados. */
  bloqueioGlobal: MotivoBloqueio | null;
  pulados: Array<{ chave: string; motivo: MotivoBloqueio }>;
}

/**
 * Decisão do agente: dos candidatos, o mais prioritário que a política
 * libera. Bloqueio global (silêncio, cota, opt-out) encerra na hora; bloqueio
 * por candidato (dedupe, tipo desligado, prioridade) só pula pro próximo.
 */
export function escolherAlerta(candidatos: CandidatoAlerta[], e: EntradaPolitica): ResultadoEscolha {
  const global = bloqueioGlobal(e);
  if (global) return { escolhido: null, bloqueioGlobal: global, pulados: [] };

  const pulados: ResultadoEscolha["pulados"] = [];
  for (const c of ordenarCandidatos(candidatos)) {
    const motivo = bloqueioDoCandidato(c, e);
    if (motivo) {
      pulados.push({ chave: chaveDedupe(c), motivo });
      continue;
    }
    return { escolhido: c, bloqueioGlobal: null, pulados };
  }
  return { escolhido: null, bloqueioGlobal: null, pulados };
}
