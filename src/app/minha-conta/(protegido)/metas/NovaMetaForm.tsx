"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarMeta } from "./metas-actions";

export function NovaMetaForm() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [valorAlvo, setValorAlvo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  function aoSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const formData = new FormData();
    formData.set("nome", nome);
    formData.set("valorAlvo", valorAlvo);
    startTransition(async () => {
      const resultado = await criarMeta(formData);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setNome("");
      setValorAlvo("");
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
        + Adicionar meta
      </button>
    );
  }

  return (
    <form onSubmit={aoSalvar} className="mc-form-card" style={{ marginBottom: 16 }}>
      <label className="mc-label">
        Nome da meta
        <input
          className="mc-input"
          placeholder="Ex: Trocar de carro"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
        />
      </label>
      <label className="mc-label">
        Valor que quer guardar
        <input
          className="mc-input"
          inputMode="decimal"
          placeholder="Ex: 15.000,00"
          value={valorAlvo}
          onChange={(e) => setValorAlvo(e.target.value)}
        />
      </label>
      {erro && <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--red)" }}>{erro}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="mc-btn-primary" style={{ border: "none", flex: 1 }} disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar meta"}
        </button>
        <button type="button" className="mc-btn-secondary" onClick={() => setAberto(false)} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
