"use client";

import { useState } from "react";

export default function ConfiguracoesPage() {
  const [form, setForm]     = useState({ nomeNegocio: "", horarioEnvio: "09:00", fusoHorario: "America/Bahia" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg]           = useState("");

  function set(f: string, v: string) { setForm((p) => ({ ...p, [f]: v })); }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const res = await fetch("/api/usuario/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSalvando(false);
    setMsg(res.ok ? "✅ Configurações salvas!" : "❌ Erro ao salvar.");
  }

  const inp = (label: string, field: string, type = "text", ph = "") => (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 8, textTransform: "uppercase" }}>{label}</label>
      <input type={type} placeholder={ph} value={(form as Record<string, string>)[field]}
        onChange={(e) => set(field, e.target.value)}
        style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
      />
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>⚙️ Configurações</h1>
      <p style={{ color: "#64748b", marginBottom: 28 }}>Personalize o comportamento do sistema de cobranças.</p>

      <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 20, padding: 22 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 0, marginBottom: 18 }}>🏢 Seu negócio</h2>
          {inp("Nome do negócio", "nomeNegocio", "text", "Ex: Salão da Maria")}
        </div>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 20, padding: 22 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 0, marginBottom: 18 }}>⏰ Horário de envio</h2>
          {inp("Horário padrão de envio dos lembretes", "horarioEnvio", "time")}
          <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>Os lembretes serão enviados neste horário, a menos que você agende manualmente.</p>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 8, textTransform: "uppercase" }}>Fuso horário</label>
            <select value={form.fusoHorario} onChange={(e) => set("fusoHorario", e.target.value)}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}>
              <option value="America/Sao_Paulo">São Paulo (GMT-3)</option>
              <option value="America/Bahia">Bahia (GMT-3)</option>
              <option value="America/Manaus">Manaus (GMT-4)</option>
              <option value="America/Belem">Belém (GMT-3)</option>
              <option value="America/Fortaleza">Fortaleza (GMT-3)</option>
              <option value="America/Recife">Recife (GMT-3)</option>
            </select>
          </div>
        </div>

        {msg && <div style={{ fontSize: 13, color: msg.startsWith("✅") ? "#166534" : "#dc2626", fontWeight: 600 }}>{msg}</div>}

        <button type="submit" disabled={salvando} style={{
          padding: "13px", borderRadius: 12, border: "none",
          background: salvando ? "#94a3b8" : "#16a34a", color: "white",
          fontWeight: 700, fontSize: 15, cursor: salvando ? "not-allowed" : "pointer",
          boxShadow: salvando ? "none" : "0 4px 12px rgba(22,163,74,0.3)",
        }}>
          {salvando ? "Salvando..." : "Salvar configurações"}
        </button>
      </form>
    </div>
  );
}
