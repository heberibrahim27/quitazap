"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExcluirForm } from "@/components/ExcluirForm";
import { criarDeposito, apagarMeta } from "./metas-actions";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type DepositoView = { id: string; valor: number; dataFmt: string };
export type MetaView = {
  id: string;
  nome: string;
  valorAlvo: number;
  guardado: number;
  depositos: DepositoView[];
};

export function MetaCard({ meta }: { meta: MetaView }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [valorDeposito, setValorDeposito] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const percentual = meta.valorAlvo > 0 ? Math.min(100, (meta.guardado / meta.valorAlvo) * 100) : 0;
  const atingida = meta.guardado >= meta.valorAlvo;

  function aoDepositar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const formData = new FormData();
    formData.set("metaId", meta.id);
    formData.set("valor", valorDeposito);
    startTransition(async () => {
      const resultado = await criarDeposito(formData);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setValorDeposito("");
      setMostrarForm(false);
      setAberto(true);
      router.refresh();
    });
  }

  return (
    <div className="mc-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{meta.nome}</p>
          {atingida && (
            <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 700, color: "var(--green)" }}>Meta batida! 🎉</p>
          )}
        </div>
        <ExcluirForm
          action={apagarMeta}
          mensagem={`Apagar a meta "${meta.nome}"? Os depósitos registrados nela também somem.`}
          label="Apagar"
          tamanho="pequeno"
          fields={{ metaId: meta.id }}
        />
      </div>

      <p style={{ margin: "14px 0 0", fontSize: 24, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" }}>
        {fmtValor(meta.guardado)}
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-faint)" }}> de {fmtValor(meta.valorAlvo)}</span>
      </p>

      <div className="cartoes-total-bar-track" style={{ marginTop: 10 }}>
        <span
          className="cartoes-total-bar-fill"
          style={{ width: `${percentual}%`, background: atingida ? "var(--green)" : undefined }}
        />
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 11.5, fontWeight: 700, color: "var(--ink-dim)" }}>
        {percentual.toFixed(0)}% da meta
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="mc-btn-primary"
          style={{ border: "none", flex: 1 }}
          onClick={() => setMostrarForm((v) => !v)}
        >
          + Depositar
        </button>
        <button
          type="button"
          aria-label={aberto ? "Esconder depósitos" : "Ver depósitos"}
          onClick={() => setAberto((v) => !v)}
          style={{
            width: 42, flexShrink: 0, border: "1px solid var(--mc-line)", borderRadius: 12,
            background: "var(--card-tint)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            style={{ width: 16, height: 16, transform: aberto ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={aoDepositar} style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 100,00"
              className="mc-input"
              value={valorDeposito}
              onChange={(e) => setValorDeposito(e.target.value)}
              autoFocus
            />
            {erro && <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600, color: "var(--red)" }}>{erro}</p>}
          </div>
          <button type="submit" className="mc-btn-primary" style={{ border: "none" }} disabled={enviando}>
            {enviando ? "..." : "OK"}
          </button>
        </form>
      )}

      {aberto && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--mc-line)" }}>
          {meta.depositos.length === 0 ? (
            <p className="mc-empty">Nenhum depósito ainda.</p>
          ) : (
            <div className="mc-list">
              {meta.depositos.map((d) => (
                <div key={d.id} className="mc-list-row">
                  <div className="mc-list-body">
                    <div className="mc-list-desc">Depósito</div>
                    <div className="mc-list-meta">{d.dataFmt}</div>
                  </div>
                  <div className="mc-list-side">
                    <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: "var(--green)" }}>
                      +{fmtValor(d.valor)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
