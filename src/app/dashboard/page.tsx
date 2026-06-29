"use client";

import { useState, useEffect } from "react";
import { useUsuario } from "./layout";
import Link from "next/link";

type Resumo = {
  totalPendencias: number;
  pendentesHoje: number;
  valorAberto: number;
  valorRecuperado: number;
  lembretesEnviados: number;
  taxaLeitura: number;
  tempoEconomizado: number; // minutos
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtMin(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export default function DashboardPage() {
  const usuario = useUsuario();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/relatorios/resumo")
      .then((r) => r.json())
      .then((data) => setResumo(data.resumo))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const primeiroNome = usuario?.nome.split(" ")[0] ?? "";
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  const kpis = resumo ? [
    { label: "Recuperado este mês", val: fmt(resumo.valorRecuperado),      icon: "💰", cor: "#16a34a", bgCor: "#f0fdf4", bordaCor: "#bbf7d0" },
    { label: "Em aberto",           val: fmt(resumo.valorAberto),          icon: "📋", cor: "#d97706", bgCor: "#fffbeb", bordaCor: "#fde68a" },
    { label: "Lembretes enviados",  val: String(resumo.lembretesEnviados), icon: "📤", cor: "#2563eb", bgCor: "#eff6ff", bordaCor: "#bfdbfe" },
    { label: "Taxa de leitura",     val: `${resumo.taxaLeitura}%`,         icon: "👁", cor: "#7c3aed", bgCor: "#f5f3ff", bordaCor: "#ddd6fe" },
    { label: "Vencendo hoje",       val: String(resumo.pendentesHoje),     icon: "⏰", cor: "#dc2626", bgCor: "#fef2f2", bordaCor: "#fecaca" },
    { label: "Tempo economizado",   val: fmtMin(resumo.tempoEconomizado),  icon: "⏱", cor: "#0891b2", bgCor: "#ecfeff", bordaCor: "#a5f3fc" },
  ] : [];

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>

      {/* Saudação */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>
          {saudacao}, {primeiroNome}! 👋
        </h1>
        {resumo && resumo.valorRecuperado > 0 && (
          <p style={{ color: "#64748b", marginTop: 8, fontSize: 15 }}>
            O QuitaZAP trabalhou por você e ajudou a recuperar{" "}
            <strong style={{ color: "#16a34a" }}>{fmt(resumo.valorRecuperado)}</strong> este mês.
          </p>
        )}
        {resumo && resumo.valorRecuperado === 0 && (
          <p style={{ color: "#64748b", marginTop: 8, fontSize: 15 }}>
            Pronto para cobrar automaticamente pelo seu WhatsApp Business? 🚀
          </p>
        )}
      </div>

      {/* Alert WhatsApp não conectado */}
      {!usuario?.wpConectado && (
        <div style={{
          background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 16,
          padding: "16px 20px", marginBottom: 24,
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 28 }}>📱</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#92400e", fontSize: 15 }}>Conecte seu WhatsApp Business</div>
            <div style={{ color: "#a16207", fontSize: 13, marginTop: 3 }}>
              Os lembretes são enviados pelo seu número. Conecte agora para ativar o sistema.
            </div>
          </div>
          <Link href="/dashboard/whatsapp" style={{
            background: "#f59e0b", color: "white", fontWeight: 700, fontSize: 13,
            padding: "10px 18px", borderRadius: 10, textDecoration: "none", whiteSpace: "nowrap",
          }}>
            Conectar →
          </Link>
        </div>
      )}

      {/* KPIs */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 16, marginBottom: 32,
      }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: "#f1f5f9", borderRadius: 16, height: 100, animation: "pulse 1.5s infinite" }} />
          ))
        ) : kpis.map((k) => (
          <div key={k.label} style={{
            background: k.bgCor, border: `1px solid ${k.bordaCor}`,
            borderRadius: 16, padding: "18px 16px",
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.cor, lineHeight: 1.1 }}>{k.val}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, fontWeight: 500 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Ações rápidas */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Ações rápidas</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/dashboard/receber/nova" style={{
            background: "#16a34a", color: "white", fontWeight: 700, fontSize: 14,
            padding: "12px 20px", borderRadius: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
          }}>
            ＋ Nova pendência
          </Link>
          <Link href="/dashboard/receber" style={{
            background: "white", color: "#0f172a", fontWeight: 600, fontSize: 14,
            padding: "12px 20px", borderRadius: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
            border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
            📋 Ver pendências
          </Link>
          <Link href="/dashboard/contatos" style={{
            background: "white", color: "#0f172a", fontWeight: 600, fontSize: 14,
            padding: "12px 20px", borderRadius: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
            border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
            👥 Contatos
          </Link>
        </div>
      </div>

      {/* Pendências vencendo */}
      {resumo && resumo.pendentesHoje > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 16, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, color: "#dc2626", fontSize: 15, marginBottom: 6 }}>
            ⏰ {resumo.pendentesHoje} pendência{resumo.pendentesHoje !== 1 ? "s" : ""} vencendo hoje
          </div>
          <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>
            Os lembretes serão disparados automaticamente no horário configurado.{" "}
            <Link href="/dashboard/receber?filtro=hoje" style={{ color: "#dc2626", fontWeight: 700 }}>Ver →</Link>
          </p>
        </div>
      )}
    </div>
  );
}
