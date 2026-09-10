// ─────────────────────────────────────────
// QuitaZAP — Gráfico de categoria (chat nativo, Fase 3)
// Reaproveita calcularResumoFinanceiro (motor.ts central) — MESMA
// definição de gasto/categoria/período que /minha-conta/gastos e o
// Dashboard já usam. Nunca recalcula por conta própria (ver
// motor-contrato.ts: único lugar autorizado a somar Lancamento).
// ─────────────────────────────────────────

import { calcularResumoFinanceiro, limitesDoMes, anoMesAtualBrasil } from "@/lib/financeiro/motor";

const NOMES_MES_ABREV = [
  "jan.", "fev.", "mar.", "abr.", "mai.", "jun.",
  "jul.", "ago.", "set.", "out.", "nov.", "dez.",
];

function fmtValor(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type CategoriaGrafico = { nome: string; valor: number; percentual: number };

export type GraficoCategoriaDado = {
  tipo: "grafico_categoria";
  periodoLabel: string;
  escopoLabel: string;
  totalLabel: string;
  totalValor: number;
  categorias: CategoriaGrafico[];
  outros: CategoriaGrafico | null;
  // Mapa completo (não só top-5) — usado pra detectar se o gráfico ficou
  // desatualizado depois de uma edição, sem precisar guardar Lancamento
  // inteiro no snapshot.
  mapaCompleto: Record<string, number>;
  geradoEm: string;
  periodoInicio: string;
  periodoFim: string;
};

const MAX_CATEGORIAS = 5;

/**
 * Calcula o gráfico de categoria pro mês corrente (V1 — período fixo,
 * igual ao Dashboard). Retorna null se não há nenhuma despesa
 * categorizada no período (nada pra mostrar).
 */
export async function calcularGraficoCategoria(clienteId: string): Promise<GraficoCategoriaDado | null> {
  const agora = new Date();
  const { ano, mes } = anoMesAtualBrasil(agora);
  const periodo = limitesDoMes(ano, mes);

  const resumo = await calcularResumoFinanceiro({ clienteId, periodo, rendaMensalDeclarada: null });

  const mapaCompleto: Record<string, number> = {};
  for (const c of resumo.porCategoria) mapaCompleto[c.categoria] = c.total;

  const totalValor = resumo.porCategoria.reduce((s, c) => s + c.total, 0);
  if (totalValor <= 0) return null;

  const ordenado = [...resumo.porCategoria].sort((a, b) => b.total - a.total);
  const top = ordenado.slice(0, MAX_CATEGORIAS);
  const resto = ordenado.slice(MAX_CATEGORIAS);

  const categorias: CategoriaGrafico[] = top.map((c) => ({
    nome: c.categoria,
    valor: c.total,
    percentual: Math.round((c.total / totalValor) * 100),
  }));

  const valorOutros = resto.reduce((s, c) => s + c.total, 0);
  const outros: CategoriaGrafico | null =
    resto.length > 0 ? { nome: "Outros", valor: valorOutros, percentual: Math.round((valorOutros / totalValor) * 100) } : null;

  const diaAtual = ano === anoMesAtualBrasil(agora).ano && mes === anoMesAtualBrasil(agora).mes
    ? Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(agora))
    : new Date(periodo.fim.getTime() - 86_400_000).getUTCDate();

  const periodoLabel = `01–${String(diaAtual).padStart(2, "0")} ${NOMES_MES_ABREV[mes - 1]} ${ano}`;

  return {
    tipo: "grafico_categoria",
    periodoLabel,
    escopoLabel: "Despesas registradas",
    totalLabel: fmtValor(totalValor),
    totalValor,
    categorias,
    outros,
    mapaCompleto,
    geradoEm: agora.toISOString(),
    periodoInicio: periodo.inicio.toISOString(),
    periodoFim: periodo.fim.toISOString(),
  };
}

/** Compara o mapa congelado com o valor recalculado agora — usado pro
 *  card avisar "Registros alterados" em vez de recalcular silenciosamente. */
export function graficoEstaDesatualizado(mapaCongelado: Record<string, number>, mapaAtual: Record<string, number>): boolean {
  const chaves = new Set([...Object.keys(mapaCongelado), ...Object.keys(mapaAtual)]);
  for (const chave of chaves) {
    if ((mapaCongelado[chave] ?? 0) !== (mapaAtual[chave] ?? 0)) return true;
  }
  return false;
}
