"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CARTAO_SEM_FOTO } from "./estilo";

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
    <form className="qz-login-card" style={CARTAO_SEM_FOTO} onSubmit={enviar} autoComplete="off">
      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#fff" }}>Crie sua senha de acesso</p>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
        Mínimo de 8 caracteres. Depois é só entrar com seu WhatsApp e essa senha.
      </p>

      <label>
        <span className="qz-input-box">
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
        </span>
      </label>

      <label>
        <span className="qz-input-box">
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
        </span>
      </label>

      <button type="button" className="qz-forgot-link" onClick={() => setMostrar((v) => !v)}>
        {mostrar ? "Ocultar senha" : "Mostrar senha"}
      </button>

      {erro && <div className="qz-error-banner">{erro}</div>}

      <button className="qz-btn-enter" type="submit" disabled={enviando}>
        <span className="qz-btn-beam">
          <span className="qz-btn-beam-spin" />
          <span className="qz-btn-beam-mask" />
        </span>
        <span className="qz-btn-surface">
          <span className="qz-btn-scanlines" />
          <span className="qz-btn-glow" />
          <span className="qz-btn-label">{enviando ? "Criando…" : "Criar senha e entrar"}</span>
        </span>
      </button>
    </form>
  );
}
