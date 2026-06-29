"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Contato = { id: string; nome: string; telefone: string };

const TIPOS = [
  { val: "SERVICO",     label: "Serviço prestado" },
  { val: "VENDA_FIADA", label: "Venda fiada" },
  { val: "MENSALIDADE", label: "Mensalidade" },
  { val: "PARCELA",     label: "Parcela" },
  { val: "ALUGUEL",     label: "Aluguel" },
  { val: "OUTRO",       label: "Outro" },
];

export default function NovaPendenciaPage() {
  const router = useRouter();
  const [contatos, setContatos]   = useState<Contato[]>([]);
  const [salvando, setSalvando]   = useState(false);
  const [erro, setErro]           = useState("");
  const [form, setForm]           = useState({
    contatoId:     "",
    nomeManual:    "",
    telefoneManual:"",
    descricao:     "",
    tipo:          "SERVICO",
    valor:         "",
    vencimento:    "",
    pixChave:      "",
    mensagemCustom:"",
    enviarEm:      "",
  });

  useEffect(() => {
    fetch("/api/contatos")
      .then((r) => r.json())
      .then((d) => setContatos(d.contatos ?? []));
  }, []);

  function set(field: string, val: string) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    const valor = parseFloat(form.valor.replace(",", "."));
    if (isNaN(valor) || valor <= 0) { setErro("Valor inválido."); return; }
    if (!form.vencimento)            { setErro("Informe o vencimento."); return; }

    if (!form.contatoId && !form.nomeManual) {
      setErro("Selecione um contato ou informe o nome."); return;
    }

    setSalvando(true);
    try {
      const body: Record<string, unknown> = {
        descricao:      form.descricao || form.tipo,
        tipo:           form.tipo,
        valor,
        vencimento:     form.vencimento,
        pixChave:       form.pixChave || null,
        mensagemCustom: form.mensagemCustom || null,
        enviarEm:       form.enviarEm || null,
        status:         form.enviarEm ? "AGENDADA" : "RASCUNHO",
      };

      if (form.contatoId) {
        body.contatoId = form.contatoId;
      } else {
        body.nomeManual    = form.nomeManual;
        body.telefoneManual= form.telefoneManual;
      }

      const res = await fetch("/api/pendencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error ?? "Erro ao criar."); return; }
      router.push("/dashboard/receber");
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  const input = (field: string, label: string, placeholder: string, type = "text", required = true) => (
    <div>
      <label style={labelStyle}>{label}{required && " *"}</label>
      <input
        type={type} required={required} placeholder={placeholder}
        value={(form as Record<string, string>)[field]}
        onChange={(e) => set(field, e.target.value)}
        style={inputStyle}
      />
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <Link href="/dashboard/receber" style={{ color: "#64748b", textDecoration: "none", fontSize: 20 }}>←</Link>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>Nova pendência</h1>
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 3 }}>Crie um lembrete de pagamento</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Seção: Pagador */}
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>👤 Quem vai pagar?</h2>

          {contatos.length > 0 && (
            <div>
              <label style={labelStyle}>Contato cadastrado</label>
              <select
                value={form.contatoId}
                onChange={(e) => set("contatoId", e.target.value)}
                style={inputStyle}
              >
                <option value="">— Selecionar contato —</option>
                {contatos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome} ({c.telefone})</option>
                ))}
              </select>
            </div>
          )}

          {!form.contatoId && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {input("nomeManual",     "Nome",      "João Silva",    "text", !form.contatoId)}
              {input("telefoneManual", "WhatsApp",  "71999999999",   "tel",  false)}
            </div>
          )}
        </section>

        {/* Seção: Cobrança */}
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>💰 Detalhes da cobrança</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Tipo *</label>
              <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} style={inputStyle}>
                {TIPOS.map((t) => <option key={t.val} value={t.val}>{t.label}</option>)}
              </select>
            </div>
            {input("valor",      "Valor (R$)",  "500,00",     "text")}
            {input("descricao",  "Descrição",   "Corte de cabelo — junho", "text", false)}
            {input("vencimento", "Vencimento",  "", "date")}
          </div>
        </section>

        {/* Seção: Pagamento */}
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>🔑 Facilitar pagamento (opcional)</h2>
          {input("pixChave", "Chave Pix", "CPF, e-mail, telefone ou chave aleatória", "text", false)}
          <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
            O pagador receberá o link para pagar via Pix diretamente.
          </p>
        </section>

        {/* Seção: Envio */}
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>📅 Quando enviar?</h2>
          {input("enviarEm", "Data/hora do envio (deixe vazio para rascunho)", "", "datetime-local", false)}
          <div>
            <label style={labelStyle}>Mensagem personalizada (opcional)</label>
            <textarea
              value={form.mensagemCustom}
              onChange={(e) => set("mensagemCustom", e.target.value)}
              placeholder="João, lembro que combinamos R$500 pelo serviço de terça..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </section>

        {erro && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", color: "#dc2626", fontSize: 13 }}>
            {erro}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <Link href="/dashboard/receber" style={{
            padding: "12px 20px", borderRadius: 12, border: "1px solid #e2e8f0",
            background: "white", color: "#64748b", fontWeight: 600, fontSize: 14, textDecoration: "none",
          }}>
            Cancelar
          </Link>
          <button type="submit" disabled={salvando} style={{
            padding: "12px 28px", borderRadius: 12, border: "none",
            background: salvando ? "#94a3b8" : "#16a34a", color: "white",
            fontWeight: 700, fontSize: 14, cursor: salvando ? "not-allowed" : "pointer",
            boxShadow: salvando ? "none" : "0 4px 12px rgba(22,163,74,0.3)",
          }}>
            {salvando ? "Salvando..." : "Criar pendência →"}
          </button>
        </div>
      </form>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16, marginTop: 0,
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 0.5,
  display: "block", marginBottom: 8, textTransform: "uppercase",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 10, fontSize: 14,
  border: "1px solid #e2e8f0", background: "#f8fafc", color: "#0f172a",
  outline: "none", boxSizing: "border-box",
};
