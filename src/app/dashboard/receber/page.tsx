"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Pendencia = {
  id: string;
  descricao: string;
  tipo: string;
  valor: number;
  vencimento: string;
  status: string;
  etapa: number;
  tentativas: number;
  valorPago: number | null;
  contato: { nome: string; telefone: string } | null;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; cor: string }> = {
  RASCUNHO:              { label: "Rascunho",      bg: "#f1f5f9", cor: "#64748b" },
  AGENDADA:              { label: "Agendada",      bg: "#eff6ff", cor: "#2563eb" },
  ENVIADA:               { label: "Enviada",       bg: "#f0fdf4", cor: "#16a34a" },
  ENTREGUE:              { label: "Entregue",      bg: "#ecfeff", cor: "#0891b2" },
  LIDA:                  { label: "Lida",          bg: "#f5f3ff", cor: "#7c3aed" },
  LINK_ABERTO:           { label: "Link aberto",   bg: "#fdf4ff", cor: "#a21caf" },
  RESPONDIDA:            { label: "Respondida",    bg: "#fff7ed", cor: "#ea580c" },
  AGUARDANDO_PAGAMENTO:  { label: "Aguardando",    bg: "#fffbeb", cor: "#d97706" },
  PAGAMENTO_INICIADO:    { label: "Pag. iniciado", bg: "#fffbeb", cor: "#d97706" },
  PAGA:                  { label: "Paga ✅",       bg: "#f0fdf4", cor: "#15803d" },
  PARCIALMENTE_PAGA:     { label: "Parcial",       bg: "#f0fdf4", cor: "#15803d" },
  VENCIDA:               { label: "Vencida 🔴",    bg: "#fef2f2", cor: "#dc2626" },
  PAUSADA:               { label: "Pausada",       bg: "#f1f5f9", cor: "#64748b" },
  CANCELADA:             { label: "Cancelada",     bg: "#f1f5f9", cor: "#94a3b8" },
  FALHOU:                { label: "Falhou",        bg: "#fef2f2", cor: "#dc2626" },
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function diasRestantes(venc: string) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d    = new Date(venc); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
}

const FILTROS = [
  { val: "", label: "Todas" },
  { val: "RASCUNHO,AGENDADA", label: "⏳ Pendentes" },
  { val: "ENVIADA,ENTREGUE,LIDA,RESPONDIDA", label: "📤 Enviadas" },
  { val: "PAGA,PARCIALMENTE_PAGA", label: "✅ Pagas" },
  { val: "VENCIDA", label: "🔴 Vencidas" },
];

export default function ReceberPage() {
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filtro, setFiltro]         = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const qs = filtro ? `?status=${encodeURIComponent(filtro)}` : "";
    const res = await fetch(`/api/pendencias${qs}`);
    const data = await res.json();
    setPendencias(data.pendencias ?? []);
    setLoading(false);
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  async function confirmarPaga(id: string) {
    await fetch(`/api/pendencias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAGA", confirmacaoManual: true, pagoEm: new Date().toISOString() }),
    });
    carregar();
  }

  async function cancelar(id: string) {
    if (!confirm("Cancelar esta pendência?")) return;
    await fetch(`/api/pendencias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELADA" }),
    });
    carregar();
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>💰 Receber</h1>
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{pendencias.length} pendência{pendencias.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/dashboard/receber/nova" style={{
          background: "#16a34a", color: "white", fontWeight: 700, fontSize: 14,
          padding: "11px 20px", borderRadius: 12, textDecoration: "none",
          boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
        }}>
          ＋ Nova pendência
        </Link>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {FILTROS.map((f) => (
          <button key={f.val} onClick={() => setFiltro(f.val)} style={{
            padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            cursor: "pointer", border: "1px solid",
            background: filtro === f.val ? "#0f172a" : "white",
            color:      filtro === f.val ? "white"   : "#64748b",
            borderColor: filtro === f.val ? "#0f172a" : "#e2e8f0",
          }}>
            {f.label}
          </button>
        ))}
        <button onClick={carregar} style={{
          marginLeft: "auto", padding: "7px 12px", borderRadius: 20, fontSize: 12,
          color: "#94a3b8", background: "white", border: "1px solid #e2e8f0", cursor: "pointer",
        }}>
          ↺
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ background: "#f1f5f9", borderRadius: 16, height: 90, marginBottom: 12 }} />
        ))
      ) : pendencias.length === 0 ? (
        <div style={{ background: "white", borderRadius: 16, border: "2px dashed #e2e8f0", padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
          <p style={{ fontWeight: 700, color: "#0f172a", fontSize: 17 }}>Nenhuma pendência</p>
          <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>Crie sua primeira pendência e comece a cobrar automaticamente.</p>
          <Link href="/dashboard/receber/nova" style={{
            background: "#16a34a", color: "white", fontWeight: 700, fontSize: 14,
            padding: "12px 24px", borderRadius: 12, textDecoration: "none",
          }}>
            ＋ Criar pendência
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pendencias.map((p) => {
            const dias = diasRestantes(p.vencimento);
            const cfg  = STATUS_CONFIG[p.status] ?? { label: p.status, bg: "#f1f5f9", cor: "#64748b" };
            const atrasada = dias < 0 && !["PAGA", "CANCELADA", "PARCIALMENTE_PAGA"].includes(p.status);

            return (
              <div key={p.id} style={{
                background: "white", borderRadius: 16,
                border: `1px solid ${atrasada ? "#fecaca" : "#e2e8f0"}`,
                overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}>
                <div style={{ height: 3, background: cfg.cor }} />
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>

                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${cfg.cor}33, ${cfg.cor}66)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 16, color: cfg.cor, flexShrink: 0,
                  }}>
                    {(p.contato?.nome ?? p.descricao).charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
                        {p.contato?.nome ?? "Sem contato"}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: cfg.bg, color: cfg.cor }}>
                        {cfg.label}
                      </span>
                      {atrasada && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: "#fee2e2", color: "#991b1b" }}>
                          🚨 {Math.abs(dias)}d atraso
                        </span>
                      )}
                      {!atrasada && dias >= 0 && dias <= 3 && !["PAGA", "CANCELADA"].includes(p.status) && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: "#fef3c7", color: "#92400e" }}>
                          ⚡ {dias === 0 ? "hoje" : `${dias}d`}
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, marginBottom: 3 }}>{p.descricao}</div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
                      <strong style={{ color: "#0f172a", fontSize: 15 }}>{fmt(p.valor)}</strong>
                      <span style={{ color: "#94a3b8" }}>📅 {fmtData(p.vencimento)}</span>
                      {p.contato?.telefone && <span style={{ color: "#94a3b8" }}>{p.contato.telefone}</span>}
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                    {!["PAGA", "CANCELADA", "PARCIALMENTE_PAGA"].includes(p.status) && (
                      <button onClick={() => confirmarPaga(p.id)} style={{
                        fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 10,
                        border: "none", background: "#16a34a", color: "white", cursor: "pointer",
                      }}>
                        ✅ Pago
                      </button>
                    )}
                    {!["PAGA", "CANCELADA"].includes(p.status) && (
                      <button onClick={() => cancelar(p.id)} style={{
                        fontSize: 11, background: "none", border: "1px solid #e2e8f0",
                        color: "#94a3b8", cursor: "pointer", padding: "6px 10px", borderRadius: 10,
                      }}>
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
    </div>
  );
}
