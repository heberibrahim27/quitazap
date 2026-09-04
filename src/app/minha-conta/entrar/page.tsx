"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { anton, inter } from "./fontes";
import "./entrar.css";

// Depois da primeira visita, a abertura cinemática (~1.8s) vira uma entrada
// rápida (~350ms) — ninguém precisa ver o show inteiro de novo a cada login.
const VISITADO_KEY = "qz_entrar_visitado";

export default function EntrarPage() {
  const router = useRouter();
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rapido, setRapido] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(VISITADO_KEY)) {
        setRapido(true);
      } else {
        localStorage.setItem(VISITADO_KEY, "1");
      }
    } catch {
      // localStorage indisponível (modo privado etc.) — mantém a abertura completa.
    }
  }, []);

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
    <div className={`qz-entrar ${inter.className} ${rapido ? "qz-fast" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="qz-bg-photo" src="/minha-conta/login-fundo.jpg" alt="" />
      <div className="qz-bg-scrim" />

      <div className="qz-stage">
        <div className="qz-zone-top">
          <div className="qz-brand-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qz-brand-logo" src="/minha-conta/logo-simbolo.webp" alt="QuitaZAP" />
            <div className="qz-brand-sub">Minha Conta</div>
          </div>
          <h1 className={`qz-headline ${anton.className}`}>
            <span><em>Seu dinheiro,</em></span>
            <span><em>sob controle.</em></span>
          </h1>
        </div>

        <div className="qz-zone-mid">
          <div className="qz-scene">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/minha-conta/login-mulher.webp"
              alt="Mulher com a mão aberta, apresentando o cartão de acesso ao QuitaZAP"
            />

            <form className="qz-login-card" onSubmit={enviar} autoComplete="off">
              <label>
                <span className="qz-input-box">
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="Login (WhatsApp)"
                    required
                    autoComplete="username"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                  />
                </span>
              </label>

              <label>
                <span className="qz-input-box">
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
                    className="qz-eye-btn"
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setMostrarSenha((v) => !v)}
                  >
                    {mostrarSenha ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                        <path d="M9.5 5.2A10.8 10.8 0 0 1 12 5c7 0 11 7 11 7a13.2 13.2 0 0 1-3.1 3.6M6.6 6.6C4 8.3 2 12 2 12s4 7 11 7a10.6 10.6 0 0 0 4-0.8" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </span>
              </label>

              <button
                type="button"
                className="qz-forgot-link"
                onClick={() => setErro("Fale com quem administra sua conta QuitaZAP.")}
              >
                Esqueci minha senha
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
                  <span className="qz-btn-label">{enviando ? "Entrando…" : "Entrar"}</span>
                  <svg className="qz-btn-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </span>
              </button>
            </form>
          </div>
        </div>

        <div className="qz-zone-bottom">
          <a href="/privacidade" style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", textDecoration: "underline" }}>
            Privacidade e Termos de Uso
          </a>
        </div>
      </div>
    </div>
  );
}
