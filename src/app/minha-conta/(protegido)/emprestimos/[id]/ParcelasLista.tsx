"use client";

import { useState } from "react";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type ParcelaView = {
  id: string;
  numero: number;
  valor: number;
  vencimentoFmt: string;
  status: string;
};

export function ParcelasLista({
  parcelas,
  marcarParcelaPaga,
  desfazerPagamento,
  pagarVariasParcelas,
}: {
  parcelas: ParcelaView[];
  marcarParcelaPaga: (fd: FormData) => Promise<void>;
  desfazerPagamento: (fd: FormData) => Promise<void>;
  pagarVariasParcelas: (fd: FormData) => Promise<void>;
}) {
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  const pendentes = parcelas.filter((p) => p.status !== "PAGA");

  function alternarSelecao() {
    setModoSelecao((v) => !v);
    setSelecionadas(new Set());
  }

  function alternarParcela(id: string) {
    setSelecionadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  const totalSelecionado = parcelas
    .filter((p) => selecionadas.has(p.id))
    .reduce((soma, p) => soma + p.valor, 0);

  return (
    <div>
      {pendentes.length > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 16px 0" }}>
          <button
            type="button"
            onClick={alternarSelecao}
            style={{
              all: "unset", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
              color: modoSelecao ? "var(--red)" : "var(--blue)",
            }}
          >
            {modoSelecao ? "Cancelar seleção" : "Selecionar"}
          </button>
        </div>
      )}

      <div style={{ maxHeight: "52vh", overflowY: "auto" }}>
        {parcelas.length === 0 ? (
          <p className="mc-empty">Esse empréstimo não tem parcelas cadastradas.</p>
        ) : (
          <div className="mc-list">
            {parcelas.map((p) => (
              <div key={p.id} className="parcela-row">
                <div className="parcela-info">
                  {modoSelecao && p.status !== "PAGA" ? (
                    <button
                      type="button"
                      className={`parcela-check ${selecionadas.has(p.id) ? "checked" : ""}`}
                      onClick={() => alternarParcela(p.id)}
                      aria-label={`Selecionar parcela ${p.numero}`}
                      style={{ background: "none", cursor: "pointer", padding: 0 }}
                    >
                      {selecionadas.has(p.id) && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                  ) : (
                    <span className={`parcela-check ${p.status === "PAGA" ? "checked" : ""}`}>
                      {p.status === "PAGA" && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      )}
                    </span>
                  )}
                  <div>
                    <div className="mc-list-desc">Parcela {p.numero}</div>
                    <div className="mc-list-meta">Vence {p.vencimentoFmt}</div>
                  </div>
                </div>

                {p.status === "PAGA" ? (
                  <form action={desfazerPagamento} className="parcela-acao">
                    <input type="hidden" name="parcelaId" value={p.id} />
                    <span className="parcela-valor-pago">{fmtValor(p.valor)}</span>
                    <button type="submit" className="parcela-desfazer">Desfazer</button>
                  </form>
                ) : modoSelecao ? (
                  <span className="parcela-valor-pago">{fmtValor(p.valor)}</span>
                ) : (
                  <form action={marcarParcelaPaga} className="parcela-acao">
                    <input type="hidden" name="parcelaId" value={p.id} />
                    <input
                      name="valorPago"
                      type="text"
                      inputMode="decimal"
                      defaultValue={p.valor.toFixed(2).replace(".", ",")}
                      className="parcela-input-valor"
                      aria-label={`Valor pago da parcela ${p.numero}`}
                    />
                    <button type="submit" className="parcela-marcar">Marcar paga</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modoSelecao && selecionadas.size > 0 && (
        <form action={pagarVariasParcelas} style={{ padding: "12px 16px", borderTop: "1px solid var(--mc-line)" }}>
          {Array.from(selecionadas).map((pid) => (
            <input key={pid} type="hidden" name="parcelaId" value={pid} />
          ))}
          <button
            type="submit"
            className="mc-btn-primary"
            style={{ border: "none", width: "100%" }}
          >
            Pagar {selecionadas.size} parcela{selecionadas.size > 1 ? "s" : ""} — {fmtValor(totalSelecionado)}
          </button>
        </form>
      )}
    </div>
  );
}
