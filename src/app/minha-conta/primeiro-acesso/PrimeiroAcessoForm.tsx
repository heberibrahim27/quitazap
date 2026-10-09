"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PrimeiroAcessoForm({ token }: { token: string }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);

    if (senha !== confirmacao) {
      setErro("As duas senhas precisam ser iguais.");
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/auth-cliente/primeiro-acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, senha }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data?.error || "Não foi possível criar sua senha.");
        return;
      }
      router.push("/minha-conta");
    } catch {
      setErro("Não foi possível criar sua senha. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="qzn-form" onSubmit={enviar} autoComplete="off">
      <p className="qzn-dica">Mínimo de 8 caracteres. Depois é só entrar com seu WhatsApp e essa senha.</p>

      <label className="qzn-field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="10.5" width="14" height="10" rx="3" />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </svg>
        <input
          type={mostrar ? "text" : "password"}
          placeholder="Nova senha"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </label>

      <label className="qzn-field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="10.5" width="14" height="10" rx="3" />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </svg>
        <input
          type={mostrar ? "text" : "password"}
          placeholder="Repita a senha"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
      </label>

      <button type="button" className="qzn-forgot-link" onClick={() => setMostrar((v) => !v)}>
        {mostrar ? "Ocultar senha" : "Mostrar senha"}
      </button>

      {erro && <div className="qzn-error-banner" role="alert">{erro}</div>}

      <button className="qzn-btn-enter" type="submit" disabled={enviando}>
        {enviando ? "Criando…" : "Criar senha e entrar"}
      </button>
    </form>
  );
}
