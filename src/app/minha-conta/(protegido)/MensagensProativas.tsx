"use client";

import { useState } from "react";
import { atualizarAceitaProativas } from "./proativas-actions";

export function MensagensProativas({ aceitaProativasInicial }: { aceitaProativasInicial: boolean }) {
  const [ativo, setAtivo] = useState(aceitaProativasInicial);
  const [processando, setProcessando] = useState(false);

  async function alternar() {
    const novoValor = !ativo;
    setProcessando(true);
    setAtivo(novoValor); // otimista — é só um toggle simples, sem passo externo que possa falhar
    try {
      await atualizarAceitaProativas(novoValor);
    } catch {
      setAtivo(!novoValor); // desfaz se der erro
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="mc-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            width: 38, height: 38, borderRadius: 12, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: ativo ? "var(--green-soft)" : "rgba(148,163,184,0.15)",
            color: ativo ? "var(--green)" : "var(--ink-dim)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Mensagens proativas no WhatsApp</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.4 }}>
            Lembretes de tarefa/vencimento e avisos de novidade que o QuitaZAP manda por conta própria.
            Não afeta as respostas de quando você manda mensagem pro bot — essas continuam sempre.
          </p>
        </div>
        <button
          type="button"
          className={ativo ? "mc-btn-secondary" : "mc-btn-primary"}
          style={ativo ? undefined : { border: "none" }}
          onClick={alternar}
          disabled={processando}
        >
          {processando ? "..." : ativo ? "Desativar" : "Ativar"}
        </button>
      </div>
    </div>
  );
}
