"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarTarefa } from "./tarefa-actions";

function hojeStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function NovaTarefaForm() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  function aoSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const resultado = await criarTarefa(formData);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setAberto(false);
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        className="mc-btn-primary"
        style={{ border: "none", width: "100%", marginBottom: 16 }}
        onClick={() => setAberto(true)}
      >
        + Adicionar lembrete
      </button>
    );
  }

  return (
    <form onSubmit={aoSalvar} className="mc-form-card" style={{ marginBottom: 16 }}>
      <label className="mc-label">
        Descrição *
        <input name="descricao" required placeholder="Ex: Pagar IPTU, Parcela do curso" className="mc-input" autoFocus />
      </label>
      <label className="mc-label">
        Valor (opcional)
        <input name="valor" type="text" inputMode="decimal" placeholder="Ex: 250,00" className="mc-input" />
      </label>
      <label className="mc-label">
        Data do lembrete *
        <input name="vencimento" type="date" required defaultValue={hojeStr()} className="mc-input" />
      </label>
      <label className="mc-label" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input name="recorrente" type="checkbox" style={{ width: 16, height: 16 }} />
        Recorrente (repete todo mês)
      </label>
      {erro && <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--red)" }}>{erro}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="mc-btn-primary" style={{ border: "none", flex: 1 }} disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar lembrete"}
        </button>
        <button type="button" className="mc-btn-secondary" onClick={() => setAberto(false)} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
