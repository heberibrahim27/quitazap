// ─────────────────────────────────────────
// QuitaZAP — Parcelas que já passaram (empréstimos/consignados antigos)
// ─────────────────────────────────────────
// Quem cadastra um empréstimo que já vem andando (ex: consignado em 30/120)
// normalmente não lembra quando pegou, mas sabe quantas parcelas já pagou e
// quando vence a próxima. Em vez de exigir a data da primeira parcela, o
// cadastro aceita "já paguei N" + "próxima vence em X" e daqui sai a data da
// primeira parcela, pelo mesmo calendário mensal (adicionarMeses, com o dia
// ajustado em meses curtos) que gera o cronograma.

import { adicionarMeses } from "../calculos";

/** Data da 1ª parcela a partir da data da próxima a pagar e de quantas já foram pagas. */
export function primeiraDataPelaProxima(proximaData: Date, parcelasJaPagas: number): Date {
  return adicionarMeses(proximaData, -parcelasJaPagas);
}

/** Quantas parcelas de um cronograma mensal já venceram antes de `hoje` (dia
 * de calendário: a que vence hoje ainda não conta como vencida). */
export function contarParcelasVencidas(primeiraData: Date, totalParcelas: number, hoje: Date): number {
  const inicioDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  let vencidas = 0;
  for (let i = 0; i < totalParcelas; i++) {
    const v = adicionarMeses(primeiraData, i);
    const diaV = new Date(v.getFullYear(), v.getMonth(), v.getDate()).getTime();
    if (diaV < inicioDeHoje) vencidas++;
    else break;
  }
  return vencidas;
}
