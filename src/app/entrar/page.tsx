"use client";

// /entrar — Login do QuitaZAP Receber (multi-tenant)
// Mantém /login original para o admin

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function EntrarPage() {
  const router = useRouter();
  const [form, setForm]       = useState({ email: "", senha: "" });
  const [erro, setErro]       = useState("");
  const [loading, setLoading] = useState(false);

  // Se já autenticado, vai direto pro dashboard
  useEffect(() => {
    fetch("/api/auth/me").then((r) => {
      if (r.ok) router.replace("/dashboard");
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error ?? "Erro ao fazer login."); return; }
      router.push("/dashboard");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 56, height: 56, background: "#16a34a", borderRadius: 16,
            fontSize: 24, fontWeight: 900, color: "white", marginBottom: 16,
            boxShadow: "0 8px 24px rgba(22,163,74,0.4)",
          }}>Q</div>
          <h1 style={{ color: "white", fontSize: 24, fontWeight: 800, margin: 0 }}>QuitaZAP</h1>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 6 }}>Receber — Acesse sua conta</p>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: "32px 28px", backdropFilter: "blur(10px)",
        }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", letterSpacing: 1, display: "block", marginBottom: 8 }}>
                E-MAIL
              </label>
              <input
                type="email" required autoFocus
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="seu@email.com"
                style={{
                  width: "100%", padding: "13px 16px", borderRadius: 12, fontSize: 15,
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                  color: "white", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", letterSpacing: 1, display: "block", marginBottom: 8 }}>
                SENHA
              </label>
              <input
                type="password" required
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                placeholder="••••••••"
                style={{
                  width: "100%", padding: "13px 16px", borderRadius: 12, fontSize: 15,
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                  color: "white", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {erro && (
              <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", color: "#fca5a5", fontSize: 13 }}>
                {erro}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              background: loading ? "#374151" : "#16a34a",
              border: "none", color: "white", fontWeight: 700, fontSize: 15,
              padding: "14px", borderRadius: 12, cursor: loading ? "not-allowed" : "pointer",
              marginTop: 4, transition: "background 0.2s",
              boxShadow: loading ? "none" : "0 4px 16px rgba(22,163,74,0.35)",
            }}>
              {loading ? "Entrando..." : "Entrar →"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
              Não tem conta?{" "}
              <Link href="/cadastro" style={{ color: "#4ade80", fontWeight: 700, textDecoration: "none" }}>
                Criar conta grátis
              </Link>
            </p>
          </div>
        </div>

        <p style={{ textAlign: "center", color: "#334155", fontSize: 12, marginTop: 20 }}>
          É admin?{" "}
          <Link href="/login" style={{ color: "#475569", textDecoration: "underline" }}>
            Painel administrativo
          </Link>
        </p>
      </div>
    </div>
  );
}
