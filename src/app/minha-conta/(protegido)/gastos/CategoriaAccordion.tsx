"use client";

import { useState } from "react";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CategoriaAccordion({
  nome,
  valorFmt,
  percentual,
  cor,
  indice,
  total,
  limiteMensal,
  estourou,
  salvarOrcamento,
  removerOrcamento,
  children,
}: {
  nome: string;
  valorFmt: string;
  percentual: number;
  cor: "green" | "blue" | "cyan" | "red" | "orange";
  indice: number;
  total: number;
  limiteMensal: number | null;
  estourou: boolean;
  salvarOrcamento: (formData: FormData) => Promise<void>;
  removerOrcamento: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [editandoOrcamento, setEditandoOrcamento] = useState(false);

  return (
    <div>
      <button type="button" className="resumo-row gasto-categoria-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <span className={`resumo-icon ${cor}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.7 12.5h9.8l2.1-8H6.4" /></svg>
        </span>
        <span className="resumo-label" style={{ width: "auto", flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
          {nome}
          {estourou && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>
          )}
        </span>
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
      {aberto && (
        <div className="gasto-categoria-conteudo">
          <div className="gasto-orcamento">
            {limiteMensal != null && !editandoOrcamento ? (
              <>
                <div className="gasto-orcamento-info">
                  <span className={`gasto-orcamento-texto ${estourou ? "estourou" : ""}`}>
                    Orçamento: {fmtValor(total)} de {fmtValor(limiteMensal)} ({Math.round((total / limiteMensal) * 100)}%)
                  </span>
                  <button type="button" className="gasto-orcamento-editar" onClick={() => setEditandoOrcamento(true)}>
                    editar
                  </button>
                </div>
                <div className="gasto-orcamento-bar-track">
                  <div
                    className={`gasto-orcamento-bar-fill ${estourou ? "estourou" : ""}`}
                    style={{ width: `${Math.min(100, Math.round((total / limiteMensal) * 100))}%` }}
                  />
                </div>
              </>
            ) : (
              <form
                action={async (fd) => {
                  await salvarOrcamento(fd);
                  setEditandoOrcamento(false);
                }}
                className="gasto-orcamento-form"
              >
                <input type="hidden" name="categoria" value={nome} />
                <input
                  name="limiteMensal"
                  type="text"
                  inputMode="decimal"
                  placeholder="Definir orçamento mensal (ex: 500,00)"
                  defaultValue={limiteMensal != null ? limiteMensal.toFixed(2).replace(".", ",") : ""}
                  className="gasto-orcamento-input"
                />
                <button type="submit" className="gasto-orcamento-salvar">Salvar</button>
                {limiteMensal != null && (
                  <button
                    type="button"
                    className="gasto-orcamento-cancelar"
                    onClick={() => setEditandoOrcamento(false)}
                  >
                    Cancelar
                  </button>
                )}
              </form>
            )}
            {limiteMensal != null && editandoOrcamento && (
              <form action={removerOrcamento} style={{ marginTop: 6 }}>
                <input type="hidden" name="categoria" value={nome} />
                <button type="submit" className="gasto-orcamento-remover">Remover orçamento</button>
              </form>
            )}
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
