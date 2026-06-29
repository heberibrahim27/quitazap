"use client";

import { useState } from "react";

export default function WhatsAppPage() {
  const [instancia, setInstancia] = useState("");
  const [salvando, setSalvando]   = useState(false);
  const [msg, setMsg]             = useState("");

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const res = await fetch("/api/usuario/whatsapp", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wpInstancia: instancia }),
    });
    setSalvando(false);
    setMsg(res.ok ? "✅ Instância salva! Escaneie o QR no painel da Z-API." : "❌ Erro ao salvar.");
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>📱 WhatsApp</h1>
      <p style={{ color: "#64748b", marginBottom: 28 }}>Conecte seu WhatsApp Business para enviar lembretes automaticamente.</p>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 20, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 16, marginTop: 0 }}>🔌 Integração via Z-API</h2>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#166534" }}>
          <strong>Como conectar:</strong>
          <ol style={{ margin: "8px 0 0 16px", padding: 0, lineHeight: 2 }}>
            <li>Crie uma instância em <strong>z-api.io</strong></li>
            <li>Cole o ID da instância abaixo</li>
            <li>Acesse o painel da Z-API e escaneie o QR Code com seu WhatsApp</li>
          </ol>
        </div>
        <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 8, textTransform: "uppercase" }}>
              ID da Instância Z-API
            </label>
            <input
              required value={instancia} onChange={(e) => setInstancia(e.target.value)}
              placeholder="ex: 3C0B1234567890ABCDEF"
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          {msg && <div style={{ fontSize: 13, color: msg.startsWith("✅") ? "#166534" : "#dc2626" }}>{msg}</div>}
          <button type="submit" disabled={salvando} style={{
            padding: "11px", borderRadius: 12, border: "none",
            background: salvando ? "#94a3b8" : "#16a34a", color: "white",
            fontWeight: 700, fontSize: 14, cursor: salvando ? "not-allowed" : "pointer",
          }}>
            {salvando ? "Salvando..." : "Salvar instância"}
          </button>
        </form>
      </div>

      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 16, padding: "16px 20px", fontSize: 13, color: "#92400e" }}>
        <strong>⚠️ Atenção:</strong> Use um número de WhatsApp Business exclusivo para cobranças.
        Não use seu número pessoal para evitar bloqueios.
      </div>
    </div>
  );
}
