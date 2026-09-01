"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { manrope } from "../fonte";
import "../(protegido)/minha-conta.css";

const wrapperStyle: React.CSSProperties = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
};

export default function EntrarPage() {
  const router = useRouter();
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/auth-cliente/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone, senha }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data?.error || "Não foi possível entrar.");
        return;
      }
      router.push("/minha-conta");
    } catch {
      setErro("Não foi possível entrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={`mc-shell ${manrope.className}`} style={wrapperStyle}>
      <div className="mc-form-card" style={{ width: "100%", maxWidth: 400 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Minha Conta QuitaZAP</h1>
          <p style={{ color: "var(--mc-ink-dim)", marginTop: 8 }}>
            Entre com o número de WhatsApp e a senha cadastrados.
          </p>
        </div>

        {erro && (
          <div style={{ background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.3)", color: "#fda4af", borderRadius: 12, padding: "10px 14px", fontSize: 13 }}>
            {erro}
          </div>
        )}

        <form onSubmit={enviar} style={{ display: "grid", gap: 16 }}>
          <label className="mc-label">
            WhatsApp
            <input
              required
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(71) 99999-9999"
              autoComplete="username"
              className="mc-input"
            />
          </label>
          <label className="mc-label">
            Senha
            <input
              required
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="mc-input"
            />
          </label>
          <button type="submit" disabled={enviando} className="mc-btn-primary" style={{ border: "none", opacity: enviando ? 0.6 : 1 }}>
            {enviando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p style={{ color: "var(--mc-ink-dim)", fontSize: 13, textAlign: "center" }}>
          Esqueceu a senha? Fale com quem administra sua conta QuitaZAP.
        </p>
      </div>
    </div>
  );
}
