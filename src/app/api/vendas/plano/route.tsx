// ─────────────────────────────────────────
// QuitaZAP — Imagem: Plano de quitação real (estilo WhatsApp)
// GET /api/vendas/plano  →  PNG 800×680
// ─────────────────────────────────────────

import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 800,
          height: 680,
          background: "#ECE5DD",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header WhatsApp */}
        <div
          style={{
            background: "#075E54",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              background: "#25D366",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 800,
              color: "#fff",
              flexShrink: 0,
              letterSpacing: -1,
            }}
          >
            QZ
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 17 }}>QuitaZAP</span>
            <span style={{ color: "#B2DFDB", fontSize: 13 }}>online agora</span>
          </div>
        </div>

        {/* Chat — mensagem do plano */}
        <div
          style={{
            flex: 1,
            padding: "16px 24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                background: "#fff",
                borderRadius: "0px 16px 16px 16px",
                padding: "14px 18px",
                maxWidth: 560,
                fontSize: 14,
                color: "#111",
                boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                lineHeight: 1.6,
              }}
            >
              {/* Título */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 22 }}>📋</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#075E54" }}>PLANO DE QUITAÇÃO — QUITAZAP</div>
                  <div style={{ fontSize: 12, color: "#667781" }}>Gerado em 27/06/2026 às 14:27</div>
                </div>
              </div>

              {/* Resumo */}
              <div style={{ marginBottom: 10, fontSize: 14, color: "#333" }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: "#075E54" }}>💰 RESUMO FINANCEIRO</div>
                <div>• Renda mensal: <span style={{ fontWeight: 700 }}>R$ 3.500,00</span></div>
                <div>• Total em dívidas: <span style={{ fontWeight: 700, color: "#C0392B" }}>R$ 17.440,00</span></div>
                <div>• Parcelas mensais: <span style={{ fontWeight: 700, color: "#E67E22" }}>R$ 1.560,00</span> (44,6%)</div>
                <div>• Disponível/mês: <span style={{ fontWeight: 700, color: "#27AE60" }}>R$ 1.940,00</span></div>
              </div>

              {/* Dívidas */}
              <div style={{ marginBottom: 10, fontSize: 14, color: "#333" }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: "#075E54" }}>📌 SUAS DÍVIDAS (ordem de prioridade)</div>
                <div>1️⃣ <span style={{ fontWeight: 700 }}>Cartão Nubank</span> — R$ 2.800 | R$ 560/mês × 5x ⚠️ urgente</div>
                <div>2️⃣ <span style={{ fontWeight: 700 }}>Empréstimo pessoal</span> — R$ 4.200 | R$ 420/mês × 10x</div>
                <div>3️⃣ <span style={{ fontWeight: 700 }}>Financiamento moto</span> — R$ 10.440 | R$ 580/mês × 18x</div>
              </div>

              {/* Recomendação */}
              <div style={{ fontSize: 14, color: "#333" }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: "#075E54" }}>✅ RECOMENDAÇÃO</div>
                <div>Priorize o Cartão Nubank (juros mais altos). Após quitá-lo, redirecione os R$560 para acelerar o empréstimo.</div>
              </div>

              {/* Meta */}
              <div style={{
                marginTop: 12, paddingTop: 10, borderTop: "1px solid #E2E8F0",
                background: "#F0FFF4", borderRadius: 8, padding: "8px 12px",
                fontSize: 14, color: "#27AE60", fontWeight: 700,
              }}>
                🎯 Seguindo este plano, você fica livre de dívidas em 18 meses!
              </div>

              <div style={{ fontSize: 11, color: "#667781", marginTop: 8, textAlign: "right" }}>14:27</div>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div
          style={{
            background: "#075E54",
            padding: "10px 20px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "#B2DFDB", fontSize: 13, fontWeight: 600 }}>
            🤖 QuitaZAP — Organize suas dívidas pelo WhatsApp com IA
          </span>
        </div>
      </div>
    ),
    { width: 800, height: 680 }
  );
}
