import type { SaudeFinanceira } from "@/lib/financeiro/saude-financeira-contrato";

const COR_CLASSIFICACAO: Record<SaudeFinanceira["classificacao"], string> = {
  Excelente: "var(--green)",
  Boa: "var(--green)",
  Atenção: "var(--orange)",
  Crítica: "var(--red)",
};

const COR_RAZAO: Record<"positiva" | "atencao" | "negativa", string> = {
  positiva: "var(--green)",
  atencao: "var(--orange)",
  negativa: "var(--red)",
};

// Score 0-100 determinístico (src/lib/financeiro/saude-financeira.ts) — a
// IA não participa desse número. Só é chamado quando o mês já tem algum
// lançamento (ver page.tsx); com zero dado, um score "neutro" mais
// confundiria do que ajudaria.
export function SaudeFinanceiraCard({ saude }: { saude: SaudeFinanceira }) {
  const cor = COR_CLASSIFICACAO[saude.classificacao];

  return (
    <div className="card" style={{ paddingBottom: 18 }}>
      <div className="card-head">
        <p className="card-title" style={{ fontSize: 14 }}>
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>
          </span>
          <span className="title-label">Saúde financeira</span>
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 18px 14px" }}>
        <div
          style={{
            width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: `conic-gradient(${cor} ${saude.score * 3.6}deg, var(--card-tint) 0deg)`,
          }}
        >
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <strong style={{ fontSize: 17, fontWeight: 800, color: "var(--mc-ink)" }}>{saude.score}</strong>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: cor }}>{saude.classificacao}</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--mc-ink-dim)" }}>{saude.score}/100 pontos</p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, padding: "0 18px 4px" }}>
        {saude.razoes.map((razao, i) => (
          <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: COR_RAZAO[razao.tipo] }}>
            {razao.texto}
          </p>
        ))}
      </div>
    </div>
  );
}
