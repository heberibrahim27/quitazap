"use client";

import { useState } from "react";
import { atualizarAlertaTipo } from "./alertas-actions";

type Item = { tipo: string; titulo: string; descricao: string };

// Mesmo conjunto dos comandos "parar esse alerta" / "ativar alertas" no
// WhatsApp e no chat: ligar/desligar aqui grava a MESMA preferência.
export function AlertasFinanceiros({
  desligadosIniciais,
  itens,
}: {
  desligadosIniciais: string[];
  itens: Item[];
}) {
  const [desligados, setDesligados] = useState<string[]>(desligadosIniciais);
  const [processando, setProcessando] = useState<string | null>(null);

  const todosDesligados = desligados.includes("TODOS");

  async function alternar(tipo: string) {
    const ligadoAgora = !desligados.includes(tipo);
    const novoLigado = !ligadoAgora;
    setProcessando(tipo);
    setDesligados((atual) => (novoLigado ? atual.filter((t) => t !== tipo) : [...atual, tipo]));
    try {
      await atualizarAlertaTipo(tipo, novoLigado);
    } catch {
      setDesligados((atual) => (novoLigado ? [...atual, tipo] : atual.filter((t) => t !== tipo)));
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="mc-card" style={{ marginBottom: 16 }}>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Alertas financeiros</p>
      <p style={{ margin: "2px 0 12px", fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.4 }}>
        Avisos automáticos do QuitaZAP quando algo merece atenção. No máximo 1 por dia, nunca à noite. Também dá pra
        controlar por mensagem: &ldquo;parar esse alerta&rdquo; ou &ldquo;ativar alertas&rdquo;.
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        {itens.map((item) => {
          const ligado = !todosDesligados && !desligados.includes(item.tipo);
          return (
            <div key={item.tipo} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{item.titulo}</p>
                <p style={{ margin: "1px 0 0", fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.35 }}>{item.descricao}</p>
              </div>
              <button
                type="button"
                className={ligado ? "mc-btn-secondary" : "mc-btn-primary"}
                style={ligado ? undefined : { border: "none" }}
                onClick={() => alternar(item.tipo)}
                disabled={processando !== null || todosDesligados}
                aria-pressed={ligado}
              >
                {processando === item.tipo ? "..." : ligado ? "Desligar" : "Ligar"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line, rgba(148,163,184,0.2))", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Todos os alertas</p>
          <p style={{ margin: "1px 0 0", fontSize: 11.5, color: "var(--ink-dim)" }}>
            Lembretes e vencimentos que você criou continuam normalmente.
          </p>
        </div>
        <button
          type="button"
          className={todosDesligados ? "mc-btn-primary" : "mc-btn-secondary"}
          style={todosDesligados ? { border: "none" } : undefined}
          onClick={() => alternar("TODOS")}
          disabled={processando !== null}
        >
          {processando === "TODOS" ? "..." : todosDesligados ? "Ligar todos" : "Desligar todos"}
        </button>
      </div>
    </div>
  );
}
