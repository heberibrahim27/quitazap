// ─────────────────────────────────────────
// QuitaZAP — Imagem: Mockup de conversa WhatsApp
// GET /api/vendas/conversa  →  PNG 800×560
// ─────────────────────────────────────────

import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 800,
          height: 560,
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
          {/* Avatar QuitaZAP */}
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

        {/* Chat area */}
        <div
          style={{
            flex: 1,
            padding: "16px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Usuário */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div
              style={{
                background: "#DCF8C6",
                borderRadius: "14px 0px 14px 14px",
                padding: "10px 14px",
                maxWidth: 380,
                fontSize: 15,
                color: "#111",
                boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
              }}
            >
              Oi! Tenho umas dívidas e tô perdido, cartão, financiamento e empréstimo 😟
              <div style={{ fontSize: 11, color: "#667781", marginTop: 4, textAlign: "right" }}>
                14:23 ✓✓
              </div>
            </div>
          </div>

          {/* Bot */}
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                background: "#fff",
                borderRadius: "0px 14px 14px 14px",
                padding: "10px 14px",
                maxWidth: 420,
                fontSize: 15,
                color: "#111",
                boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
              }}
            >
              Entendi! Me manda os valores que vou montar seu plano. Pode ser texto, áudio ou foto do boleto 📋
              <div style={{ fontSize: 11, color: "#667781", marginTop: 4 }}>14:23</div>
            </div>
          </div>

          {/* Usuário 2 */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div
              style={{
                background: "#DCF8C6",
                borderRadius: "14px 0px 14px 14px",
                padding: "10px 14px",
                maxWidth: 400,
                fontSize: 15,
                color: "#111",
                boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
              }}
            >
              Cartão Nubank R$2.800, financiamento da moto R$580/mês faltam 18x, empréstimo pessoal R$4.200
              <div style={{ fontSize: 11, color: "#667781", marginTop: 4, textAlign: "right" }}>14:25 ✓✓</div>
            </div>
          </div>

          {/* Bot resposta */}
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                background: "#fff",
                borderRadius: "0px 14px 14px 14px",
                padding: "10px 14px",
                maxWidth: 440,
                fontSize: 15,
                color: "#111",
                boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
              }}
            >
              ✅ Recebi! Total em dívidas: R$ 17.440
              {"\n"}📊 Analisando e montando seu plano...
              {"\n"}💰 Qual é sua renda mensal?
              <div style={{ fontSize: 11, color: "#667781", marginTop: 4 }}>14:25</div>
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
    { width: 800, height: 560 }
  );
}
