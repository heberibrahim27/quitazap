"use client";

// ─────────────────────────────────────────
// QuitaZAP — Cobrador Automático (painel)
// /cobrador — redesign v3 (inline styles para prod)
// Suporta link mágico: /cobrador?id=clienteId&token=hmac
// ─────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface Cobranca {
  id: string;
  credorNome: string;
  devedorNome: string;
  devedorFone: string;
  valor: number;
  vencimento: string;
  mensagem: string | null;
  pixChave: string | null;
  status: "PENDENTE" | "ENVIADA" | "PAGA" | "CANCELADA";
  etapa: number;
  tentativas: number;
  ultimoEnvio: string | null;
  criadoEm: string;
}

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDataCurta(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function diasRestantes(vencimento: string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const venc = new Date(vencimento); venc.setHours(0, 0, 0, 0);
  return Math.round((venc.getTime() - hoje.getTime()) / 86_400_000);
}

const STATUS_COLOR: Record<string, string> = {
  PENDENTE: "#f59e0b", ENVIADA: "#3b82f6", PAGA: "#10b981", CANCELADA: "#9ca3af",
};
const STATUS_BG: Record<string, string> = {
  PENDENTE: "#fef3c7", ENVIADA: "#dbeafe", PAGA: "#d1fae5", CANCELADA: "#f3f4f6",
};
const STATUS_TEXT: Record<string, string> = {
  PENDENTE: "#92400e", ENVIADA: "#1e40af", PAGA: "#065f46", CANCELADA: "#6b7280",
};
const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente", ENVIADA: "Enviada", PAGA: "Paga", CANCELADA: "Cancelada",
};
const ETAPA_BG: Record<number, string> = { 1: "#dbeafe", 2: "#ffedd5", 3: "#fee2e2" };
const ETAPA_TEXT: Record<number, string> = { 1: "#1e40af", 2: "#9a3412", 3: "#991b1b" };
const ETAPA_LABEL: Record<number, string> = { 1: "Amigável", 2: "Firme", 3: "Última chance" };

const DARK = "#1a1f36";
const DARK2 = "#2e3a6e";

export default function CobradorPage() {
  const searchParams = useSearchParams();
  const clienteIdParam = searchParams.get("id")   ?? "";
  const tokenParam     = searchParams.get("token") ?? "";
  // Modo cliente: tem id+token na URL → mostra só cobranças daquele cliente
  const modoCliente = !!(clienteIdParam && tokenParam);

  const [cobrancas, setCobrancas]     = useState<Cobranca[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [filtro, setFiltro]           = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarBroadcast, setMostrarBroadcast] = useState(false);
  const [criando, setCriando]         = useState(false);
  const [disparando, setDisparando]   = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastPreview, setBroadcastPreview] = useState<{ totalDestinatarios: number; mensagemPreview: string } | null>(null);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [form, setForm]               = useState({
    devedorNome: "", devedorFone: "", valor: "", diaVencimento: "", mensagem: "", pixChave: "",
  });

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    const qs = filtro ? `&status=${filtro}` : "";
    const authQs = modoCliente
      ? `&clienteId=${encodeURIComponent(clienteIdParam)}&token=${encodeURIComponent(tokenParam)}`
      : "";
    const res = await fetch(`/api/cobrador?limit=100${qs}${authQs}`);
    if (res.ok) {
      const d = await res.json();
      setCobrancas(d.cobrancas ?? []);
      setTotal(d.total ?? 0);
    }
    setLoading(false);
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  async function marcarPaga(id: string) {
    const res = await fetch("/api/cobrador", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "PAGA", ...(modoCliente ? { clienteId: clienteIdParam, token: tokenParam } : {}) }),
    });
    if (res.ok) {
      setCobrancas((prev) => prev.map((c) => c.id === id ? { ...c, status: "PAGA" } : c));
      showToast("✅ Marcada como paga!");
    } else showToast("Erro ao atualizar.", false);
  }

  async function cancelarCobranca(id: string) {
    const res = await fetch("/api/cobrador", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "CANCELADA", ...(modoCliente ? { clienteId: clienteIdParam, token: tokenParam } : {}) }),
    });
    if (res.ok) {
      setCobrancas((prev) => prev.map((c) => c.id === id ? { ...c, status: "CANCELADA" } : c));
      showToast("Cobrança cancelada.");
    } else showToast("Erro ao cancelar.", false);
  }

  async function dispararTodas() {
    setDisparando("all");
    const res = await fetch("/api/cobrador/disparar", { method: "POST" });
    const d   = await res.json();
    setDisparando(null);
    if (res.ok) {
      showToast(d.disparadas > 0 ? `🚀 ${d.disparadas} mensagem(ns) enviada(s)!` : "Nenhuma pendente para hoje.");
      carregar();
    } else showToast(`Erro: ${d.error ?? "desconhecido"}`, false);
  }

  async function enviarAgora() {
    setDisparando("now");
    const res = await fetch("/api/cobrador/disparar", { method: "POST" });
    const d   = await res.json();
    setDisparando(null);
    if (res.ok) { showToast(`📤 ${d.disparadas ?? 0} enviada(s)!`); carregar(); }
    else showToast("Erro ao disparar.", false);
  }

  async function criarCobranca(e: React.FormEvent) {
    e.preventDefault(); setCriando(true);
    const res = await fetch("/api/cobrador", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId:     modoCliente ? clienteIdParam : undefined,
        devedorNome:   form.devedorNome.trim(),
        devedorFone:   form.devedorFone.trim(),
        valor:         parseFloat(form.valor.replace(",", ".")),
        diaVencimento: parseInt(form.diaVencimento),
        mensagem:      form.mensagem.trim() || undefined,
        pixChave:      form.pixChave.trim() || undefined,
      }),
    });
    setCriando(false);
    if (res.ok) {
      showToast("✅ Cobrança criada!");
      setForm({ devedorNome: "", devedorFone: "", valor: "", diaVencimento: "", mensagem: "", pixChave: "" });
      setMostrarForm(false); carregar();
    } else {
      const err = await res.json();
      showToast(`Erro: ${err.error ?? "desconhecido"}`, false);
    }
  }

  async function abrirBroadcast() {
    const res = await fetch("/api/broadcast/cobrador", {
      headers: { "x-internal-call": "1" },
    });
    if (res.ok) {
      const d = await res.json();
      setBroadcastPreview(d);
    }
    setMostrarBroadcast(true);
  }

  async function enviarBroadcast() {
    setBroadcasting(true);
    const res = await fetch("/api/broadcast/cobrador", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-call": "1" },
      body: JSON.stringify({}),
    });
    const d = await res.json();
    setBroadcasting(false);
    setMostrarBroadcast(false);
    if (res.ok) showToast(`📣 Broadcast enviado para ${d.enviados} cliente(s)!`);
    else showToast("Erro no broadcast.", false);
  }

  // KPIs
  const pendentes     = cobrancas.filter((c) => c.status === "PENDENTE").length;
  const enviadas      = cobrancas.filter((c) => c.status === "ENVIADA").length;
  const pagas         = cobrancas.filter((c) => c.status === "PAGA").length;
  const valorAberto   = cobrancas.filter((c) => c.status !== "PAGA" && c.status !== "CANCELADA").reduce((s, c) => s + c.valor, 0);
  const valorRecebido = cobrancas.filter((c) => c.status === "PAGA").reduce((s, c) => s + c.valor, 0);

  const heroStyle: React.CSSProperties = {
    background: `linear-gradient(135deg, ${DARK} 0%, ${DARK2} 100%)`,
    color: "white",
    padding: "24px 20px 20px",
    borderRadius: "0 0 0 0",
  };

  const kpis = [
    { label: "Pendentes",  val: String(pendentes),         icon: "⏳", bg: "rgba(245,158,11,0.25)",  border: "rgba(245,158,11,0.4)",  color: "#fcd34d" },
    { label: "Enviadas",   val: String(enviadas),          icon: "📤", bg: "rgba(59,130,246,0.25)",  border: "rgba(59,130,246,0.4)",  color: "#93c5fd" },
    { label: "Pagas",      val: String(pagas),             icon: "✅", bg: "rgba(16,185,129,0.25)", border: "rgba(16,185,129,0.4)", color: "#6ee7b7" },
    { label: "Em aberto",  val: fmtValor(valorAberto),     icon: "💰", bg: "rgba(249,115,22,0.25)",  border: "rgba(249,115,22,0.4)",  color: "#fdba74" },
    { label: "Recebido",   val: fmtValor(valorRecebido),   icon: "🏆", bg: "rgba(5,150,105,0.25)",  border: "rgba(5,150,105,0.4)",  color: "#6ee7b7" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6fb" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          padding: "12px 20px", borderRadius: 14,
          background: toast.ok ? "#059669" : "#dc2626",
          color: "white", fontWeight: 600, fontSize: 14,
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Hero ── */}
      <div style={heroStyle}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          {/* Topo */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#93c5fd", textTransform: "uppercase", marginBottom: 4 }}>QuitaZAP</p>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>💸 Cobrador Automático</h1>
              <p style={{ fontSize: 12, color: "#bfdbfe", marginTop: 4 }}>
                {modoCliente ? "🔐 Seu painel privado — " : ""}{total} cobrança{total !== 1 ? "s" : ""} registradas
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {!modoCliente && (
                <button onClick={abrirBroadcast}
                  style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "white", fontSize: 12, fontWeight: 600, padding: "9px 14px", borderRadius: 10, cursor: "pointer" }}>
                  📣 Avisar clientes
                </button>
              )}
              <button onClick={() => setMostrarForm(!mostrarForm)}
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "white", fontSize: 12, fontWeight: 600, padding: "9px 14px", borderRadius: 10, cursor: "pointer" }}>
                + Nova cobrança
              </button>
              <button onClick={dispararTodas} disabled={disparando === "all"}
                style={{ background: "#3b82f6", border: "none", color: "white", fontSize: 12, fontWeight: 700, padding: "9px 18px", borderRadius: 10, cursor: "pointer", opacity: disparando === "all" ? 0.6 : 1 }}>
                {disparando === "all" ? "⏳ Enviando..." : "🚀 Disparar pendentes"}
              </button>
            </div>
          </div>

          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 14, padding: "10px 12px" }}>
                <div style={{ fontSize: 18, marginBottom: 2 }}>{k.icon}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: k.color, lineHeight: 1.2 }}>{k.val}</div>
                <div style={{ fontSize: 10, color: k.color, opacity: 0.85, marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Corpo ── */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}>

        {/* Modal broadcast */}
        {mostrarBroadcast && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "white", borderRadius: 20, padding: 28, maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>📣 Avisar clientes</h2>
                  <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                    Envia mensagem sobre o Cobrador para <strong>{broadcastPreview?.totalDestinatarios ?? "..."}</strong> cliente(s) ativo(s)
                  </p>
                </div>
                <button onClick={() => setMostrarBroadcast(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>✕</button>
              </div>
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, fontSize: 12, color: "#374151", whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto", fontFamily: "monospace", lineHeight: 1.6, marginBottom: 16 }}>
                {broadcastPreview?.mensagemPreview ?? "Carregando..."}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setMostrarBroadcast(false)}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 13 }}>
                  Cancelar
                </button>
                <button onClick={enviarBroadcast} disabled={broadcasting}
                  style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: DARK2, color: "white", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: broadcasting ? 0.6 : 1 }}>
                  {broadcasting ? "⏳ Enviando..." : `📣 Enviar para ${broadcastPreview?.totalDestinatarios ?? "..."} clientes`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Formulário nova cobrança */}
        {mostrarForm && (
          <div style={{ background: "white", borderRadius: 20, border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ background: "linear-gradient(to right, #f0fdf4, #ecfdf5)", padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Nova cobrança</h2>
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Ou pelo WhatsApp: <em>Cobrar João, 71999..., R$500, dia 20</em></p>
              </div>
              <button onClick={() => setMostrarForm(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9ca3af" }}>✕</button>
            </div>
            <form onSubmit={criarCobranca} style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { field: "devedorNome",   label: "Nome do devedor",      placeholder: "João Silva",        req: true  },
                { field: "devedorFone",   label: "WhatsApp do devedor",   placeholder: "71999999999",       req: true  },
                { field: "valor",         label: "Valor (R$)",            placeholder: "500,00",            req: true  },
                { field: "diaVencimento", label: "Dia do vencimento",     placeholder: "20",                req: true  },
                { field: "pixChave",      label: "Chave Pix (opcional)",  placeholder: "CPF, e-mail...",   req: false },
                { field: "mensagem",      label: "Mensagem personalizada",placeholder: "João, combinamos…", req: false },
              ].map(({ field, label, placeholder, req }) => (
                <div key={field}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
                    {label}{req && <span style={{ color: "#ef4444" }}> *</span>}
                  </label>
                  <input
                    required={req}
                    value={form[field as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    placeholder={placeholder}
                    style={{ width: "100%", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              ))}
              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 4 }}>
                <button type="button" onClick={() => setMostrarForm(false)}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 13, color: "#6b7280" }}>
                  Cancelar
                </button>
                <button type="submit" disabled={criando}
                  style={{ padding: "9px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #10b981, #059669)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: criando ? 0.6 : 1 }}>
                  {criando ? "Salvando..." : "Criar cobrança"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          {[
            { v: "",          label: "Todas"       },
            { v: "PENDENTE",  label: "⏳ Pendentes" },
            { v: "ENVIADA",   label: "📤 Enviadas"  },
            { v: "PAGA",      label: "✅ Pagas"     },
            { v: "CANCELADA", label: "Canceladas"  },
          ].map((f) => (
            <button key={f.v} onClick={() => setFiltro(f.v)}
              style={{
                padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .15s",
                background: filtro === f.v ? DARK : "white",
                color: filtro === f.v ? "white" : "#6b7280",
                border: filtro === f.v ? `1px solid ${DARK}` : "1px solid #d1d5db",
              }}>
              {f.label}
            </button>
          ))}
          <button onClick={carregar}
            style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 20, fontSize: 12, color: "#9ca3af", background: "white", border: "1px solid #e5e7eb", cursor: "pointer" }}>
            ↺ Atualizar
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", fontSize: 40 }}>⏳</div>
        ) : cobrancas.length === 0 ? (
          <div style={{ background: "white", borderRadius: 20, border: "2px dashed #e5e7eb", padding: "60px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>💸</div>
            <p style={{ fontWeight: 700, fontSize: 17, color: "#374151", marginBottom: 6 }}>Nenhuma cobrança ainda</p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Crie uma acima ou mande no WhatsApp:</p>
            <code style={{ display: "inline-block", background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#374151", fontSize: 12, padding: "8px 16px", borderRadius: 10 }}>
              Cobrar João Silva, 71999999999, R$500, dia 20
            </code>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {cobrancas.map((c) => {
              const dias      = diasRestantes(c.vencimento);
              const atrasada  = dias < 0 && c.status !== "PAGA" && c.status !== "CANCELADA";
              const urgente   = !atrasada && dias <= 3 && dias >= 0 && c.status === "PENDENTE";
              const barColor  = STATUS_COLOR[c.status] ?? "#9ca3af";
              const initial   = c.devedorNome.charAt(0).toUpperCase();

              return (
                <div key={c.id} style={{
                  background: "white", borderRadius: 16,
                  border: `1px solid ${atrasada ? "#fecaca" : urgente ? "#fde68a" : "#e5e7eb"}`,
                  overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                }}>
                  {/* Barra top colorida */}
                  <div style={{ height: 3, background: barColor }} />

                  <div style={{ padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "white", fontWeight: 700, fontSize: 15, flexShrink: 0,
                    }}>
                      {initial}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Nome + badges */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{c.devedorNome}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: STATUS_BG[c.status], color: STATUS_TEXT[c.status] }}>
                          {STATUS_LABEL[c.status]}
                        </span>
                        {c.status === "ENVIADA" && ETAPA_LABEL[c.etapa] && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 10, background: ETAPA_BG[c.etapa], color: ETAPA_TEXT[c.etapa] }}>
                            {ETAPA_LABEL[c.etapa]}
                          </span>
                        )}
                        {atrasada && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: "#fee2e2", color: "#991b1b" }}>
                            🚨 {Math.abs(dias)}d atraso
                          </span>
                        )}
                        {urgente && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: "#fef3c7", color: "#92400e" }}>
                            ⚡ vence {dias === 0 ? "hoje" : `em ${dias}d`}
                          </span>
                        )}
                      </div>

                      {/* Detalhes */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 12px", fontSize: 12, color: "#6b7280" }}>
                        <span>{c.devedorFone}</span>
                        <strong style={{ color: "#111827", fontSize: 14 }}>{fmtValor(c.valor)}</strong>
                        <span>📅 {fmtDataCurta(c.vencimento)}</span>
                        {c.pixChave && <span>🔑 Pix: {c.pixChave}</span>}
                        {c.ultimoEnvio && <span>📤 {fmtDataCurta(c.ultimoEnvio)} ({c.tentativas}×)</span>}
                      </div>

                      {c.mensagem && (
                        <p style={{ marginTop: 5, fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>"{c.mensagem}"</p>
                      )}
                    </div>

                    {/* Ações */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                      {(c.status === "PENDENTE" || c.status === "ENVIADA") && (
                        <button onClick={() => marcarPaga(c.id)}
                          style={{ fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 10, border: "none", background: "#10b981", color: "white", cursor: "pointer", whiteSpace: "nowrap" }}>
                          ✅ Paga
                        </button>
                      )}
                      {c.status === "PENDENTE" && (
                        <button onClick={enviarAgora} disabled={!!disparando}
                          style={{ fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 10, border: "none", background: "#3b82f6", color: "white", cursor: "pointer", whiteSpace: "nowrap", opacity: disparando ? 0.6 : 1 }}>
                          {disparando === "now" ? "⏳" : "📤 Enviar agora"}
                        </button>
                      )}
                      {c.status !== "CANCELADA" && c.status !== "PAGA" && (
                        <button onClick={() => cancelarCobranca(c.id)}
                          style={{ fontSize: 11, background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "2px 0", textAlign: "right" }}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Como usar */}
        <div style={{ marginTop: 24, background: `linear-gradient(135deg, ${DARK} 0%, ${DARK2} 100%)`, borderRadius: 20, padding: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#93c5fd", textTransform: "uppercase", marginBottom: 16 }}>Como cobrar</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { icon: "💬", title: "Agendar cobrança",     code: "Cobrar João, 71999999999, R$500, dia 20" },
              { icon: "⚡", title: "Enviar imediatamente", code: "Cobrar Maria, 71988887777, R$200, manda agora" },
              { icon: "🔑", title: "Com chave Pix",        code: "Cobrar Ana, 71977776666, R$300, dia 15, pix: 071.234.567-00" },
              { icon: "🎤", title: "Por áudio",            code: "Fale a cobrança — o bot transcreve e processa igual" },
            ].map((item) => (
              <div key={item.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#bfdbfe", marginBottom: 4 }}>{item.title}</p>
                  <code style={{ fontSize: 11, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 12px", color: "#e0e7ff", display: "block", fontFamily: "monospace" }}>
                    {item.code}
                  </code>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#93c5fd", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 14, marginTop: 16 }}>
            Régua: <strong>Amigável</strong> no vencimento → <strong>Firme</strong> em +3 dias → <strong>Última chance</strong> em +7 dias 🔄
          </p>
        </div>
      </div>
    </div>
  );
}
