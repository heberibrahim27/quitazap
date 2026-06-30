// ─────────────────────────────────────────
// QuitaScore — Cálculo de score financeiro
// Score de 0 a 1000 baseado em pendências
// ─────────────────────────────────────────

export interface PendenciaScore {
  status: string;
  valor?: number;
  vencimento?: Date;
  pagoEm?: Date | null;
}

export interface QuitaScoreInfo {
  score:         number;
  classificacao: string;
  cor:           string;
  pagas:         number;
  vencidas:      number;
  pendentes:     number;
  total:         number;
}

const IGNORAR = new Set(["RASCUNHO", "CANCELADA"]);

/**
 * Calcula o QuitaScore (0-1000) baseado no histórico de pendências do contato.
 *
 * Lógica:
 *  - Ignora RASCUNHO e CANCELADA
 *  - Se não há histórico → 500 (neutro)
 *  - Se tudo pendente (sem pagas nem vencidas) → 600 (boa posição)
 *  - Caso contrário: taxa de pagamento (pagas / resolvidas) × 900 + bônus de pontualidade
 */
export function calcularQuitaScore(pendencias: PendenciaScore[]): QuitaScoreInfo {
  const validas  = pendencias.filter((p) => !IGNORAR.has(p.status));
  const pagas    = validas.filter((p) => p.status === "PAGA").length;
  const vencidas = validas.filter((p) => p.status === "VENCIDA").length;
  const pendentes = validas.length - pagas - vencidas;

  let score: number;

  if (validas.length === 0) {
    score = 500; // sem histórico
  } else {
    const resolvidas = pagas + vencidas;
    if (resolvidas === 0) {
      score = 600; // tudo pendente = boa posição
    } else {
      const taxa  = pagas / resolvidas;
      const bonus = vencidas === 0 ? 50 : 0; // bônus por zero inadimplência
      score = Math.round(Math.max(0, Math.min(1000, taxa * 900 + bonus)));
    }
  }

  const { classificacao, cor } = getClassificacao(score);
  return { score, classificacao, cor, pagas, vencidas, pendentes, total: validas.length };
}

export function getClassificacao(score: number): { classificacao: string; cor: string } {
  if (score < 400) return { classificacao: "CRÍTICO",  cor: "#ef4444" };
  if (score < 600) return { classificacao: "REGULAR",  cor: "#f97316" };
  if (score < 750) return { classificacao: "BOM",      cor: "#eab308" };
  return              { classificacao: "EXCELENTE", cor: "#22c55e" };
}

// ── Utilitários de geometria para o velocímetro ──────────

const toRad = (deg: number) => (deg * Math.PI) / 180;
const fmt   = (v: number)   => v.toFixed(2);

/** Ponto na circunferência para um dado ângulo (em graus, convenção SVG). */
function pt(cx: number, cy: number, r: number, deg: number) {
  return {
    x: cx + r * Math.cos(toRad(deg)),
    y: cy + r * Math.sin(toRad(deg)),
  };
}

/**
 * Gera um caminho SVG de arco (stroke-only) de fromDeg→toDeg no sentido
 * horário SVG (sweep=1), percorrendo o topo do semicírculo (180°→270°→360°).
 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  fromDeg: number,
  toDeg: number,
): string {
  const s    = pt(cx, cy, r, fromDeg);
  const e    = pt(cx, cy, r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${fmt(s.x)} ${fmt(s.y)} A ${r} ${r} 0 ${large} 1 ${fmt(e.x)} ${fmt(e.y)}`;
}

/**
 * Converte score (0-1000) em ângulo SVG (180°→360°).
 * 0 = esquerda (180°), 1000 = direita (360°), topo = 270°.
 */
export function scoreParaAngulo(score: number): number {
  return 180 + (score / 1000) * 180;
}
