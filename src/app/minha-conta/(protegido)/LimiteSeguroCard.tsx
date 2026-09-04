import type { LimiteSeguro } from "@/lib/financeiro/limite-seguro";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDataDia(diaISO: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${diaISO}T12:00:00`));
}

// "Próximo salário" aqui é aproximado pelo fim do mês corrente — o app
// não tem a data exata do salário do cliente (decisão de produto: não
// adicionar esse campo por enquanto). Mesmos números do motor central
// (src/lib/financeiro/limite-seguro.ts), só reformatados pra cartão.
export function LimiteSeguroCard({ limite }: { limite: LimiteSeguro }) {
  const negativo = limite.saldoLivre < 0;
  const cor = negativo ? "var(--red)" : "var(--green)";

  return (
    <div className="card" style={{ paddingBottom: 18 }}>
      <div className="card-head">
        <p className="card-title" style={{ fontSize: 14 }}>
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
          </span>
          <span className="title-label">Até o próximo salário</span>
        </p>
      </div>

      <div style={{ padding: "0 18px 4px", display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--mc-ink-dim)" }}>
          {limite.diasRestantes > 0
            ? `Faltam ${limite.diasRestantes} dia${limite.diasRestantes !== 1 ? "s" : ""} pro fim do mês`
            : "Hoje é o último dia do mês"}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--mc-ink-faint, var(--mc-ink-dim))" }}>Livre até lá</p>
            <p style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 800, color: cor }}>{fmt(limite.saldoLivre)}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--mc-ink-faint, var(--mc-ink-dim))" }}>Compromissos restantes</p>
            <p style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 800, color: "var(--mc-ink)" }}>{fmt(limite.compromissosRestantes)}</p>
          </div>
        </div>

        {!negativo && (
          <div style={{ background: "var(--card-tint)", borderRadius: 10, padding: "10px 12px" }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--mc-ink-dim)" }}>Limite seguro por dia</p>
            <p style={{ margin: "2px 0 0", fontSize: 19, fontWeight: 800, color: "var(--mc-ink)" }}>{fmt(Math.max(limite.limiteSeguroDiario, 0))}</p>
          </div>
        )}

        {negativo && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--red)", fontWeight: 600 }}>
            ✗ Sua sobra prevista até o fim do mês já está negativa.
          </p>
        )}

        {limite.diaApertado && (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--orange)", lineHeight: 1.4 }}>
            ⚠ Dia {fmtDataDia(limite.diaApertado.data)} aperta: {limite.diaApertado.itens.length} contas vencem juntas, somando {fmt(limite.diaApertado.totalNoDia)}.
          </p>
        )}
      </div>
    </div>
  );
}
