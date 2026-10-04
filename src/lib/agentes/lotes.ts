// ─────────────────────────────────────────
// Lotes e cobertura do Sentinela (parte pura)
// ─────────────────────────────────────────
// A função serverless tem teto de tempo; em vez de "avaliar até estourar e
// esquecer o resto", o Sentinela trabalha em LOTES com checkpoint: cada
// execução continua de onde a anterior do mesmo dia parou, e a tela de
// Agentes mostra a cobertura real (ex.: 300/617 PARCIAL) — nunca um
// "operando" que esconde parte da base sem avaliar (ChatGPT, 04/10/2026).

export const TAMANHO_LOTE_PADRAO = 100;

export interface Cobertura {
  /** yyyy-mm-dd em Brasília */
  dia: string;
  /** Último id já avaliado hoje (ordem crescente de id); null = nenhum ainda. */
  cursor: string | null;
  avaliados: number;
  total: number;
  concluido: boolean;
}

/** Próximo lote: ids estritamente maiores que o cursor, em ordem crescente. */
export function selecionarLote(idsOrdenados: string[], cursor: string | null, tamanho: number = TAMANHO_LOTE_PADRAO): string[] {
  const restantes = cursor == null ? idsOrdenados : idsOrdenados.filter((id) => id > cursor);
  return restantes.slice(0, tamanho);
}

/**
 * Cobertura depois de processar `processados` (prefixo do lote — se o tempo
 * acabou no meio, só parte do lote foi avaliada e o cursor para ali).
 */
export function atualizarCobertura(
  anterior: Cobertura | null,
  dia: string,
  processados: string[],
  todosIds: string[]
): Cobertura {
  const mesmoDia = anterior && anterior.dia === dia ? anterior : null;
  const cursor = processados.length > 0 ? processados[processados.length - 1] : (mesmoDia?.cursor ?? null);
  const avaliados = (mesmoDia?.avaliados ?? 0) + processados.length;
  const ultimo = todosIds.length > 0 ? todosIds[todosIds.length - 1] : null;
  const concluido = todosIds.length === 0 || (cursor != null && ultimo != null && cursor >= ultimo);
  return { dia, cursor, avaliados, total: todosIds.length, concluido };
}

/** Rótulo pra tela: nunca "OPERANDO" quando a cobertura do dia está incompleta. */
export function rotuloCobertura(c: Cobertura | null, diaHoje: string): "CONCLUIDO" | "PARCIAL" | "SEM_DADOS" {
  if (!c || c.dia !== diaHoje) return "SEM_DADOS";
  return c.concluido ? "CONCLUIDO" : "PARCIAL";
}
