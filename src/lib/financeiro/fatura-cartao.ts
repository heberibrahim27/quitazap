// ─────────────────────────────────────────
// QuitaZAP Controle — ciclo de fatura de cartão
// ─────────────────────────────────────────
// Em qual mês/ano de FATURA uma compra cai, a partir do dia de fechamento
// (e, quando cadastrado, do dia de vencimento) do cartão — achado real do
// Ibrahim (14/09/2026): a tela de Cartões agrupava compra pelo mês
// CALENDÁRIO da data, ignorando o ciclo de fatura por completo (compra em
// 01/09 com fechamento dia 25 sempre caía em "setembro", nunca em
// "outubro", mesmo o ciclo fechando 25/09 e vencendo só 01/10). Regra: se
// o dia da compra já passou do fechamento deste mês, ela pertence ao
// ciclo que fecha no mês seguinte; a fatura em si é rotulada pelo mês em
// que VENCE (convenção comum no Brasil — "fatura de outubro" é a que cai
// na conta em outubro), não pelo mês em que fechou — só dá pra fazer esse
// segundo deslocamento quando o vencimento também está cadastrado. Sem
// diaFechamento, mantém o comportamento antigo (mês calendário puro): não
// dá pra calcular ciclo nenhum sem essa data.
//
// Escopo deliberado (pedido do Ibrahim, 14/09/2026): só a TELA de Cartões
// usa isso. O Dashboard/Resumo do mês/Saúde Financeira/Orçamento (todos
// em motor.ts) continuam contando gasto pelo mês CALENDÁRIO em que a
// compra realmente aconteceu — "quanto gastei este mês" e "em qual fatura
// essa compra vai cair" são perguntas diferentes, e mexer no motor.ts
// arriscava quebrar cálculos já ajustados a dedo. motor.ts continua sendo
// o único lugar autorizado a somar Lancamento/Parcela pro resto do app.

export interface AnoMes {
  ano: number;
  mes: number;
}

// Ano/mês/dia em Brasília de uma data qualquer — mesma âncora usada no
// resto do Controle (ver anoMesAtualBrasil em motor.ts).
export function anoMesDiaBrasil(data: Date): { ano: number; mes: number; dia: number } {
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

// Desloca (ano, mes) por `delta` meses (aceita negativo).
export function deslocarMes(ano: number, mes: number, delta: number): AnoMes {
  const total = ano * 12 + (mes - 1) + delta;
  return { ano: Math.floor(total / 12), mes: (((total % 12) + 12) % 12) + 1 };
}

export function mesFaturaDaCompra(data: Date, diaFechamento: number | null, diaVencimento: number | null): AnoMes {
  const { ano, mes, dia } = anoMesDiaBrasil(data);
  if (diaFechamento == null) return { ano, mes };

  const fechamento = dia > diaFechamento ? deslocarMes(ano, mes, 1) : { ano, mes };
  if (diaVencimento == null || diaVencimento >= diaFechamento) return fechamento;
  return deslocarMes(fechamento.ano, fechamento.mes, 1);
}
