"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editarTarefa, excluirTarefa } from "./tarefa-actions";
import { ValorLista } from "../ValorLista";

export type TarefaLinha = {
  id: string;
  descricao: string;
  valor: number | null;
  vencimentoFmt: string | null;
  vencimentoInput: string; // yyyy-mm-dd (Brasília), pro campo de data
  recorrente: boolean;
};

type Modo = "ver" | "editar" | "excluir";

const BOTAO_TEXTO: React.CSSProperties = {
  background: "none", border: "none", padding: "4px 2px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};

// Uma linha da Agenda. Pendente: Concluir + Editar + Excluir. Concluída: só
// Excluir (limpa o histórico). A edição abre um formulário na própria linha e
// a exclusão pede confirmação na linha — sem diálogo do navegador.
export function TarefaItem({
  tarefa,
  pendente,
  concluirAction,
}: {
  tarefa: TarefaLinha;
  pendente: boolean;
  concluirAction: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("ver");
  const [erro, setErro] = useState<string | null>(null);
  const [processando, startTransition] = useTransition();

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await editarTarefa(formData);
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      setModo("ver");
      router.refresh();
    });
  }

  function excluir() {
    setErro(null);
    startTransition(async () => {
      const r = await excluirTarefa(tarefa.id);
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      router.refresh();
    });
  }

  if (modo === "editar") {
    return (
      <form onSubmit={salvar} className="mc-form-card" style={{ margin: "10px 0" }}>
        <input type="hidden" name="id" value={tarefa.id} />
        <label className="mc-label">
          Descrição *
          <input name="descricao" required defaultValue={tarefa.descricao} className="mc-input" autoFocus />
        </label>
        <label className="mc-label">
          Valor (opcional)
          <input
            name="valor"
            type="text"
            inputMode="decimal"
            defaultValue={tarefa.valor != null ? String(tarefa.valor).replace(".", ",") : ""}
            placeholder="Ex: 250,00"
            className="mc-input"
          />
        </label>
        <label className="mc-label">
          Data do lembrete *
          <input name="vencimento" type="date" required defaultValue={tarefa.vencimentoInput} className="mc-input" />
        </label>
        <label className="mc-label" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input name="recorrente" type="checkbox" defaultChecked={tarefa.recorrente} style={{ width: 16, height: 16 }} />
          Recorrente (repete todo mês)
        </label>
        {erro && <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--red)" }}>{erro}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="mc-btn-primary" style={{ border: "none", flex: 1 }} disabled={processando}>
            {processando ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" className="mc-btn-secondary" onClick={() => { setModo("ver"); setErro(null); }} disabled={processando}>
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mc-list-row" style={{ flexWrap: "wrap" }}>
      <div className="mc-list-body">
        <div className="mc-list-desc">{tarefa.descricao}{tarefa.recorrente ? " · recorrente" : ""}</div>
        <div className="mc-list-meta">{tarefa.vencimentoFmt ?? "Sem data marcada"}</div>
      </div>
      <div className="mc-list-side" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {tarefa.valor != null && (
          <div>
            <ValorLista valor={tarefa.valor} />
          </div>
        )}
        {pendente && (
          <form action={concluirAction}>
            <input type="hidden" name="id" value={tarefa.id} />
            <button
              type="submit"
              style={{
                background: "var(--green-soft)",
                color: "var(--green)",
                border: "1px solid rgba(23,166,90,0.3)",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Concluir
            </button>
          </form>
        )}
      </div>

      <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 16, paddingTop: 2 }}>
        {modo === "excluir" ? (
          <>
            <span style={{ fontSize: 12.5, color: "var(--ink-dim)", flex: 1, minWidth: 0 }}>
              {tarefa.recorrente ? "Excluir e parar de repetir?" : "Excluir este lembrete?"}
            </span>
            <button type="button" style={{ ...BOTAO_TEXTO, color: "var(--red)" }} onClick={excluir} disabled={processando}>
              {processando ? "..." : "Sim, excluir"}
            </button>
            <button type="button" style={{ ...BOTAO_TEXTO, color: "var(--ink-dim)" }} onClick={() => setModo("ver")} disabled={processando}>
              Não
            </button>
          </>
        ) : (
          <>
            {pendente && (
              <button type="button" style={{ ...BOTAO_TEXTO, color: "var(--blue)" }} onClick={() => setModo("editar")}>
                Editar
              </button>
            )}
            <button type="button" style={{ ...BOTAO_TEXTO, color: "var(--red)" }} onClick={() => setModo("excluir")}>
              Excluir
            </button>
          </>
        )}
      </div>
      {erro && <p style={{ flexBasis: "100%", margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--red)" }}>{erro}</p>}
    </div>
  );
}
