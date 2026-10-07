// Empréstimo lido de um PRINT (tela do app do banco: "valor restante", parcelas pagas e
// agendadas). Parte pura (sem banco): valida e converte a leitura da IA no cadastro que
// criarDividaComParcelas já sabe gravar (total de parcelas, valor, 1ª data, parcelas pagas).

export interface EmprestimoDetectado {
  /** Banco/credor + nome do contrato quando impresso (ex.: "Nubank - Dinheiro do negócio"). */
  credor: string;
  totalParcelas: number;
  valorParcela: number;
  /** Vencimento da parcela 1 (YYYY-MM-DD) — mesmo dia nos meses seguintes. */
  primeiraData: string;
  /** Quantas das primeiras parcelas já estão pagas. */
  parcelasPagas: number;
  /** "Valor restante" impresso na tela, só pra conferência no card. */
  valorRestanteImpresso?: number;
}

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.replace(/[^\d,.-]/g, "");
    const n = t.includes(",") ? parseFloat(t.replace(/\./g, "").replace(",", ".")) : parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function dataValida(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Volta `meses` meses mantendo o dia (parcela 2 em 24/out → parcela 1 em 24/set). */
function voltarMeses(d: Date, meses: number): string {
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() - meses;
  const ano = Math.floor(total / 12);
  const mes = total % 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d.getUTCDate(), ultimoDia);
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function interpretarEmprestimo(r: Record<string, unknown>): EmprestimoDetectado | null {
  const banco = typeof r.credor === "string" ? r.credor.trim() : "";
  const nome = typeof r.nome === "string" ? r.nome.trim() : "";
  if (!banco) return null;

  const lidas: { numero: number; vencimento: Date; valor: number; paga: boolean }[] = [];
  for (const item of Array.isArray(r.parcelas) ? r.parcelas : []) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const n = numero(p.numero);
    const valor = numero(p.valor);
    const vencimento = dataValida(p.vencimento);
    if (n == null || !Number.isInteger(n) || n < 1 || valor == null || valor <= 0 || !vencimento) continue;
    lidas.push({ numero: n, vencimento, valor: Math.round(valor * 100) / 100, paga: p.paga === true });
  }
  // Uma parcela só não diz que é empréstimo (pode ser outra coisa na tela).
  if (lidas.length < 2) return null;
  lidas.sort((a, b) => a.numero - b.numero);

  const totalParcelas = lidas[lidas.length - 1].numero;
  if (totalParcelas < 2 || totalParcelas > 360) return null;

  // Valor da parcela = o mais frequente (última parcela às vezes difere por centavos).
  const freq = new Map<number, number>();
  for (const l of lidas) freq.set(l.valor, (freq.get(l.valor) ?? 0) + 1);
  const valorParcela = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];

  const parcelasPagas = lidas.filter((l) => l.paga).reduce((m, l) => Math.max(m, l.numero), 0);
  // Tudo pago = nada a controlar.
  if (parcelasPagas >= totalParcelas) return null;

  const primeira = lidas[0];
  const restante = numero(r.valorRestante);
  return {
    credor: nome && !banco.toLowerCase().includes(nome.toLowerCase()) ? `${banco} - ${nome}` : banco,
    totalParcelas,
    valorParcela,
    primeiraData: voltarMeses(primeira.vencimento, primeira.numero - 1),
    parcelasPagas,
    ...(restante != null && restante > 0 ? { valorRestanteImpresso: Math.round(restante * 100) / 100 } : {}),
  };
}
