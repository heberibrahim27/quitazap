"use client";

import { useState } from "react";

export function CategoriaAccordion({
  nome,
  valorFmt,
  percentual,
  cor,
  indice,
  children,
}: {
  nome: string;
  valorFmt: string;
  percentual: number;
  cor: "green" | "blue" | "cyan" | "red" | "orange";
  indice: number;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div>
      <button type="button" className="resumo-row gasto-categoria-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <span className={`resumo-icon ${cor}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.7 12.5h9.8l2.1-8H6.4" /></svg>
        </span>
        <span className="resumo-label" style={{ width: "auto", flex: 1 }}>{nome}</span>
        <span className="resumo-bar-track" style={{ flex: "0 0 56px" }}>
          <span className="resumo-bar-fill" style={{ background: `var(--${cor})`, "--to": percentual / 100, "--i": indice } as React.CSSProperties} />
        </span>
        <span className="resumo-value">
          <span className="resumo-value-cifrao">R$</span>
          <span className="resumo-value-numero">{valorFmt}</span>
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2, flexShrink: 0, transform: aberto ? "rotate(90deg)" : "none", transition: "transform 0.2s ease" }}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {aberto && <div className="gasto-categoria-conteudo">{children}</div>}
    </div>
  );
}
