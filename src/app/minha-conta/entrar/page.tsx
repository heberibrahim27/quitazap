"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inter } from "./fontes";
import "./login-neo.css";

// Visual neomórfico aprovado em 09/10/2026. A lógica de login (telefone +
// senha → /api/auth-cliente/login → /minha-conta) é a de sempre.
export default function EntrarPage() {
  const router = useRouter();
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
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
    <div className={`qzn-entrar ${inter.className}`}>
      <div className="qzn-blob alto b1" />
      <div className="qzn-blob alto b2" />
      <div className="qzn-blob fundo b3" />

      <div className="qzn-stage">
        <div className="qzn-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qzn-brand-logo" src="/minha-conta/logo-simbolo.webp" alt="QuitaZAP" />
          <div>
            <h1 className="qzn-title">Bem-vindo de volta</h1>
            <p className="qzn-sub">Entre para continuar</p>
          </div>
        </div>

        <form className="qzn-form" onSubmit={enviar} autoComplete="off">
          <label className="qzn-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="2.5" width="12" height="19" rx="3" />
              <path d="M11 18h2" />
            </svg>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="Login (WhatsApp)"
              required
              autoComplete="username"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </label>

          <label className="qzn-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="10.5" width="14" height="10" rx="3" />
              <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
            </svg>
            <input
              type={mostrarSenha ? "text" : "password"}
              placeholder="Senha"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button
              type="button"
              className="qzn-eye-btn"
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setMostrarSenha((v) => !v)}
            >
              {mostrarSenha ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l18 18" />
                  <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                  <path d="M9.5 5.2A10.8 10.8 0 0 1 12 5c7 0 11 7 11 7a13.2 13.2 0 0 1-3.1 3.6M6.6 6.6C4 8.3 2 12 2 12s4 7 11 7a10.6 10.6 0 0 0 4-0.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </label>

          <button
            type="button"
            className="qzn-forgot-link"
            onClick={() =>
              setErro("Mande “esqueci minha senha” no WhatsApp do QuitaZAP e enviamos um link pra criar uma senha nova.")
            }
          >
            Esqueci minha senha
          </button>

          {erro && <div className="qzn-error-banner" role="alert">{erro}</div>}

          <button className="qzn-btn-enter" type="submit" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
            <span className="qzn-btn-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </button>
        </form>

        <div className="qzn-foot">
          <div className="qzn-lema">Quite dívidas · Respire</div>
          <a href="/privacidade">Privacidade e Termos de Uso</a>
        </div>
      </div>
    </div>
  );
}
