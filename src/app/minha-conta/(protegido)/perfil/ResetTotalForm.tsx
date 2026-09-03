"use client";

import { useState, useTransition } from "react";

const PALAVRA_CONFIRMACAO = "RESETAR";

export function ResetTotalForm({ acao }: { acao: (fd: FormData) => Promise<{ erro?: string } | void> }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const habilitado = texto.trim().toUpperCase() === PALAVRA_CONFIRMACAO;

  function aoConfirmar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!habilitado) return;
    setErro(null);
    const formData = new FormData();
    formData.set("confirmacao", texto);
    startTransition(async () => {
      const resultado = await acao(formData);
      if (resultado?.erro) setErro(resultado.erro);
    });
  }

  function cancelar() {
    setAberto(false);
    setTexto("");
    setErro(null);
  }

  if (!aberto) {
    return (
      <div className="mc-card" style={{ marginBottom: 16, border: "1px solid rgba(226,59,92,0.25)" }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--red)" }}>Zona de risco</p>
        <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.5 }}>
          Apaga receitas, despesas, compras no cartão, cartões, agenda e orçamentos por categoria — pra recomeçar
          o controle financeiro do zero. Seu login e perfil continuam intactos, e isso não mexe em
          Empréstimos/Dívidas.
        </p>
        <button
          type="button"
          className="mc-btn-secondary"
          style={{ borderColor: "rgba(226,59,92,0.3)", color: "var(--red)", width: "100%" }}
          onClick={() => setAberto(true)}
        >
          Resetar dados financeiros
        </button>
      </div>
    );
  }

  return (
    <div className="mc-card" style={{ marginBottom: 16, border: "1px solid rgba(226,59,92,0.3)", background: "var(--red-soft)" }}>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--red)" }}>Tem certeza?</p>
      <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.5 }}>
        Essa ação é <strong>irreversível</strong>. Vai apagar receitas, despesas, compras no cartão, cartões
        cadastrados, agenda e orçamentos por categoria. Não mexe em Empréstimos/Dívidas nem no seu login.
      </p>
      <form onSubmit={aoConfirmar}>
        <label className="mc-label">
          Digite RESETAR pra confirmar
          <input
            className="mc-input"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="RESETAR"
            autoComplete="off"
            autoCapitalize="characters"
          />
        </label>
        {erro && <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--red)", fontWeight: 600 }}>{erro}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            className="mc-btn-primary"
            style={{
              border: "none",
              flex: 1,
              background: habilitado ? "var(--red)" : "var(--ink-faint)",
              cursor: habilitado ? "pointer" : "not-allowed",
            }}
            disabled={!habilitado || enviando}
          >
            {enviando ? "Apagando..." : "Confirmar reset"}
          </button>
          <button type="button" className="mc-btn-secondary" onClick={cancelar} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
