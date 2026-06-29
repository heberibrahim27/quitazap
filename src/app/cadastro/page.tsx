"use client";

// /cadastro — Cadastro do QuitaZAP Receber

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CadastroPage() {
  const router = useRouter();
  const [form, setForm]       = useState({ nome: "", email: "", telefone: "", senha: "", confirmar: "" });
  const [erro, setErro]       = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (form.senha !== form.confirmar) {
      setErro("As senhas não coincidem."); return;
    }
    if (form.senha.length < 6) {
      setErro("Senha deve ter pelo menos 6 caracteres."); return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: form.nome, email: form.email, telefone: form.telefone, senha: form.senha }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error ?? "Erro ao criar conta."); return; }
      router.push("/dashboard");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const campo = (field: keyof typeof form, label: string, placeholder: string, type = "text") => (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", letterSpacing: 1, display: "block", marginBottom: 8 }}>
        {label}
      </label>
      <input
        type={type} value={form[field]}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
        placeholder={placeholder}
        required={field !== "telefone"}
        style={{
          width: "100%", padding: "13px 16px", borderRadius: 12, fontSize: 14,
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
          color: "white", outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 56, height: 56, background: "#16a34a", borderRadius: 16,
            fontSize: 24, fontWeight: 900, color: "white", marginBottom: 14,
            boxShadow: "0 8px 24px rgba(22,163,74,0.4)",
          }}>Q</div>
          <h1 style={{ color: "white", fontSize: 22, fontWeight: 800, margin: 0 }}>Criar conta grátis</h1>
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>QuitaZAP Receber — comece agora</p>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: "28px 24px",
        }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {campo("nome",      "SEU NOME",         "Ibrahim Silva")}
            {campo("email",     "E-MAIL",            "seu@email.com", "email")}
            {campo("telefone",  "WHATSAPP (opção)", "71999999999",   "tel")}
            {campo("senha",     "SENHA",             "••••••••",      "password")}
            {campo("confirmar", "CONFIRMAR SENHA",   "••••••••",      "password")}

            {erro && (
              <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", color: "#fca5a5", fontSize: 13 }}>
                {erro}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              background: loading ? "#374151" : "#16a34a",
              border: "none", color: "white", fontWeight: 700, fontSize: 15,
              padding: "14px", borderRadius: 12, cursor: loading ? "not-allowed" : "pointer",
              marginTop: 4, boxShadow: loading ? "none" : "0 4px 16px rgba(22,163,74,0.35)",
            }}>
              {loading ? "Criando conta..." : "Criar conta grátis →"}
            </button>

            <p style={{ textAlign: "center", color: "#475569", fontSize: 11, margin: 0 }}>
              Ao criar a conta você concorda com os termos de uso do QuitaZAP.
            </p>
          </form>

          <div style={{ textAlign: "center", marginTop: 18, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
              Já tem conta?{" "}
              <Link href="/entrar" style={{ color: "#4ade80", fontWeight: 700, textDecoration: "none" }}>
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
