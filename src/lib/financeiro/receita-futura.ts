// ─────────────────────────────────────────
// Receita com data futura = A RECEBER, não disponível
// ─────────────────────────────────────────
// Achado do Ibrahim (06/10/2026): "o aluguel só recebo amanhã, não deveria estar como disponível".
// Receita lançada para uma data que ainda não chegou não entra em renda/disponível/entradas; aparece
// na lista marcada como "a receber" e passa a contar no dia. Despesa futura não muda (já é compromisso).

/** Início de amanhã no fuso de Brasília (00:00 BRT = 03:00 UTC): daqui pra frente a receita é futura. */
export function inicioDeAmanhaBrasil(agora: Date = new Date()): Date {
  const brt = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + 1, 3, 0, 0));
}

export function ehReceitaFutura(data: Date, agora: Date = new Date()): boolean {
  return data.getTime() >= inicioDeAmanhaBrasil(agora).getTime();
}
