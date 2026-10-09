import type { TetoCredito } from "@/lib/financeiro/teto-credito";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Teto de compras no crédito do ciclo (ver teto-credito.ts). Tom de respiro,
// sem culpa: o objetivo é o cliente ter dinheiro em caixa pra se livrar das
// dívidas, não proibir compras. É uma ESTIMATIVA e a tela diz isso.
const MENSAGEM: Record<TetoCredito["nivel"], (t: TetoCredito) => string> = {
  OK: (t) => `Você pode assumir até ${fmt(t.restante)} em novas compras no crédito neste ciclo sem apertar o mês.`,
  ATENCAO: (t) => `Você já usou ${Math.round(t.pct * 100)}% do teto. Restam ${fmt(t.restante)} pra este ciclo.`,
  QUASE: (t) => `Falta pouco pro teto de compras no crédito deste ciclo: restam ${fmt(t.restante)}.`,
  ACIMA: () => "Você passou do teto de compras no crédito deste ciclo. Novas compras vão pesar no próximo salário — que tal esperar a próxima fatura pra ganhar respiro?",
};

export function TetoCreditoCard({ teto }: { teto: TetoCredito }) {
  const largura = Math.min(teto.pct, 1) * 100;
  return (
    <>
      <div className="card-head">
        <p className="card-title" style={{ fontSize: 14 }}>
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19" /></svg>
          </span>
          <span className="title-label">Teto no crédito deste ciclo</span>
        </p>
      </div>
      <div className="card teto-card">
        <div className="teto-topo">
          <div>
            <p className="teto-rot">Usado</p>
            <p className="teto-valor">{fmt(teto.usado)}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p className="teto-rot">Teto</p>
            <p className="teto-valor">{fmt(teto.teto)}</p>
          </div>
        </div>
        <div className="teto-trilho" role="img" aria-label={`${Math.round(teto.pct * 100)}% do teto usado`}>
          <span className={`teto-fill ${teto.nivel.toLowerCase()}`} style={{ width: `${largura}%` }} />
        </div>
        <p className="teto-msg">{MENSAGEM[teto.nivel](teto)}</p>
        <p className="teto-nota">Estimativa: renda prevista menos contas fixas, gastos do mês, parcelas de dívida e faturas já fechadas.</p>
      </div>
    </>
  );
}
