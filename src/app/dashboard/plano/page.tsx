"use client";

import { useUsuario } from "../layout";
import Link from "next/link";

const PLANOS = [
  {
    nome: "Starter",
    preco: "R$29,90",
    desc: "/mês",
    cor: "#2563eb",
    bg: "#eff6ff",
    borda: "#bfdbfe",
    features: ["Até 30 cobranças/mês", "1 número de WhatsApp", "Régua automática básica", "Suporte por e-mail"],
  },
  {
    nome: "Pro",
    preco: "R$59,90",
    desc: "/mês",
    cor: "#7c3aed",
    bg: "#f5f3ff",
    borda: "#ddd6fe",
    destaque: true,
    features: ["Cobranças ilimitadas", "1 número de WhatsApp", "Régua personalizada", "Comprovantes automáticos", "Relatórios avançados", "Suporte prioritário"],
  },
  {
    nome: "Business",
    preco: "R$99,90",
    desc: "/mês",
    cor: "#0891b2",
    bg: "#ecfeff",
    borda: "#a5f3fc",
    features: ["Cobranças ilimitadas", "Até 3 números de WhatsApp", "Multi-usuário", "API de integração", "Gerente de conta dedicado"],
  },
];

export default function PlanoPage() {
  const usuario = useUsuario();

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>⭐ Meu Plano</h1>
      <p style={{ color: "#64748b", marginBottom: 32 }}>Você está no plano <strong>{usuario?.plano.replace("_", " ")}</strong>. Faça upgrade para desbloquear mais recursos.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {PLANOS.map((p) => (
          <div key={p.nome} style={{
            background: p.destaque ? p.bg : "white",
            border: `2px solid ${p.destaque ? p.cor : "#e2e8f0"}`,
            borderRadius: 20, padding: 24, position: "relative",
            boxShadow: p.destaque ? `0 8px 24px ${p.cor}22` : "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            {p.destaque && (
              <div style={{
                position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                background: p.cor, color: "white", fontSize: 11, fontWeight: 700,
                padding: "3px 12px", borderRadius: 20, whiteSpace: "nowrap",
              }}>
                ⭐ Mais popular
              </div>
            )}
            <div style={{ color: p.cor, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{p.nome}</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>
              {p.preco}<span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>{p.desc}</span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "18px 0", display: "flex", flexDirection: "column", gap: 8 }}>
              {p.features.map((f) => (
                <li key={f} style={{ display: "flex", gap: 8, fontSize: 13, color: "#374151" }}>
                  <span style={{ color: p.cor, flexShrink: 0 }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <button style={{
              width: "100%", padding: "11px", borderRadius: 12, border: `2px solid ${p.cor}`,
              background: p.destaque ? p.cor : "white", color: p.destaque ? "white" : p.cor,
              fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>
              {p.destaque ? "Assinar agora" : "Selecionar plano"}
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: "16px 20px", fontSize: 13, color: "#64748b", textAlign: "center" }}>
        Dúvidas? Fale com a gente no WhatsApp:{" "}
        <a href="https://wa.me/5571993085436" target="_blank" rel="noreferrer" style={{ color: "#16a34a", fontWeight: 700 }}>
          71 9 9308-5436
        </a>
      </div>
    </div>
  );
}
