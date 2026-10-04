"use server";

import { getClienteAtual } from "@/lib/get-cliente";
import { definirAlertaLigado } from "@/lib/agentes/alertas-store";

const TIPOS_VALIDOS = ["CATEGORY_BUDGET", "CARD_CLOSING", "NEGATIVE_PROJECTION", "MONTH_CLOSING", "SPENDING_ANOMALY", "TODOS"];

/** Liga/desliga um tipo de alerta do Sentinela (ou todos). Mesmo efeito dos comandos de texto. */
export async function atualizarAlertaTipo(tipo: string, ligado: boolean): Promise<void> {
  if (!TIPOS_VALIDOS.includes(tipo)) return;
  const cliente = await getClienteAtual();
  if (!cliente) return;
  await definirAlertaLigado(cliente.id, tipo, ligado);
}
