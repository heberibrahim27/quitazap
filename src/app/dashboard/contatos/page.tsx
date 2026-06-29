"use client";

import { useState, useEffect } from "react";

type Contato = { id: string; nome: string; telefone: string; email?: string; obs?: string; pendencias?: { id: string }[] };

export default function ContatosPage() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({ nome: "", telefone: "", email: "", obs: "" });
  const [criando, setCriando]   = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function carregar() {
    setLoading(true);
    const res = await fetch("/api/contatos");
    const d   = await res.json();
    setContatos(d.contatos ?? []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  async function criarContato(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    await fetch("/api/contatos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ nome: "", telefone: "", email: "", obs: "" });
    setMostrarForm(false);
    carregar();
    setCriando(false);
  }

  const inp = (f: keyof typeof form, label: string, ph: string, req = true, type = "text") => (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6 }}>{label}</label>
      <input type={type} required={req} placeholder={ph} value={form[f]}
        onChange={(e) => setForm({ ...form, [f]: e.target.value })}
        style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
      />
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>👥 Contatos</h1>
        <button onClick={() => setMostrarForm(!mostrarForm)} style={{
          background: "#16a34a", color: "white", fontWeight: 700, fontSize: 14,
          padding: "10px 18px", borderRadius: 12, border: "none", cursor: "pointer",
        }}>
          ＋ Novo contato
        </button>
      </div>

      {mostrarForm && (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <form onSubmit={criarContato} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {inp("nome",     "NOME *",     "João Silva")}
            {inp("telefone", "WHATSAPP *", "71999999999", true, "tel")}
            {inp("email",    "E-MAIL",     "joao@email.com", false, "email")}
            {inp("obs",      "OBS",        "Cliente fiel", false)}
            <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setMostrarForm(false)}
                style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button type="submit" disabled={criando}
                style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#16a34a", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                {criando ? "Salvando..." : "Salvar contato"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>Carregando...</div>
      ) : contatos.length === 0 ? (
        <div style={{ background: "white", border: "2px dashed #e2e8f0", borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <p style={{ fontWeight: 700, color: "#0f172a" }}>Nenhum contato ainda</p>
          <p style={{ color: "#64748b", fontSize: 13 }}>Adicione seus clientes para criar pendências mais rápido.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {contatos.map((c) => (
            <div key={c.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#2563eb", flexShrink: 0 }}>
                {c.nome.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{c.telefone}{c.email ? ` · ${c.email}` : ""}</div>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                {c.pendencias?.length ?? 0} pendência{(c.pendencias?.length ?? 0) !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
