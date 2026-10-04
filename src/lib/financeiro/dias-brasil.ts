// Contagem de dias de CALENDÁRIO no fuso de Brasília — arquivo puro (sem
// banco) pra poder ser testado.

function inicioDoDia(data: Date): number {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(data)
    .split("-")
    .map(Number);
  return Date.UTC(ano, mes - 1, dia, 3, 0, 0, 0);
}

/**
 * Dias de calendário (Brasília) entre `referencia` e `data`: 0 = hoje,
 * 1 = amanhã, negativo = já passou. Não é diferença em horas arredondada —
 * achado em QA (04/10/2026): "vence amanhã" virava "vence hoje" depois do
 * meio-dia (e o painel, calculando no fuso do servidor, à noite na Vercel).
 */
export function diasCalendarioBrasil(data: Date, referencia: Date = new Date()): number {
  return Math.round((inicioDoDia(data) - inicioDoDia(referencia)) / 86_400_000);
}
