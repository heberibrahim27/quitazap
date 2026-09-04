// ─────────────────────────────────────────
// QuitaZAP Controle — Detecção de anomalia por categoria (Skill Analista, prioridade 3)
// ─────────────────────────────────────────
// Regra determinística mais simples possível: gasto de uma categoria no mês
// corrente > 1.3x a média das últimas 3 meses (calcularMediaMensal, motor.ts).
// Nenhuma IA decide se a anomalia existe — a IA (usada só pelo cron que
// consome esta função) apenas redige o texto de um insight já detectado
// aqui, em cima dos números que saem daqui.
//
// Piso mínimo em R$ evita ruído de categoria insignificante (R$ 6 contra
// média de R$ 4 já bate 1.3x, mas não é um insight útil pra ninguém).

import { calcularResumoFinanceiro, calcularMediaMensal, limitesDoMes, anoMesAtualBrasil } from "./motor";

export const MULTIPLICADOR_ANOMALIA = 1.3;
export const PISO_MINIMO_MES_ATUAL = 50;

export interface AnomaliaCategoria {
  categoria: string;
  totalMesAtual: number;
  mediaUltimosMeses: number;
  multiplicador: number;
}

/** "YYYY-MM" do mês de referência, em Brasília — mesma chave usada em
 * InsightDetectado.mes pro upsert idempotente do cron. */
export function mesReferenciaStr(referencia: Date = new Date()): string {
  const { ano, mes } = anoMesAtualBrasil(referencia);
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export async function detectarAnomaliasCategoria(
  clienteId: string,
  referencia: Date = new Date(),
): Promise<AnomaliaCategoria[]> {
  const { ano, mes } = anoMesAtualBrasil(referencia);
  const periodo = limitesDoMes(ano, mes);

  const [resumo, media] = await Promise.all([
    calcularResumoFinanceiro({ clienteId, periodo }),
    calcularMediaMensal(clienteId, periodo, 3),
  ]);

  const mediaPorCategoria = new Map(media.porCategoria.map((c) => [c.categoria, c.total]));

  const anomalias: AnomaliaCategoria[] = [];
  for (const { categoria, total } of resumo.porCategoria) {
    if (total < PISO_MINIMO_MES_ATUAL) continue;
    const mediaCategoria = mediaPorCategoria.get(categoria) ?? 0;
    if (mediaCategoria <= 0) continue; // sem histórico suficiente ainda pra comparar
    const multiplicador = total / mediaCategoria;
    if (multiplicador > MULTIPLICADOR_ANOMALIA) {
      anomalias.push({ categoria, totalMesAtual: total, mediaUltimosMeses: mediaCategoria, multiplicador });
    }
  }

  return anomalias.sort((a, b) => b.multiplicador - a.multiplicador);
}
