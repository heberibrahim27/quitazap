"use client";

import { useState } from "react";

export function ParcelasAccordion({
  resumo,
  children,
  defaultAberto = false,
}: {
  resumo: string;
  children: React.ReactNode;
  defaultAberto?: boolean;
}) {
  const [aberto, setAberto] = useState(defaultAberto);

  return (
    <div className="mc-card" style={{ padding: 0 }}>
      <button
        type="button"
        className="parcelas-toggle"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span>{resumo}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: aberto ? "rotate(90deg)" : "none", transition: "transform 0.2s ease" }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {aberto && <div className="parcelas-conteudo">{children}</div>}
    </div>
  );
}
