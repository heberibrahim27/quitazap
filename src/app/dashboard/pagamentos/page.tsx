"use client";

export default function PagamentosPage() {
  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>✅ Pagamentos</h1>
      <p style={{ color: "#64748b", marginBottom: 32 }}>Comprovantes e confirmações de pagamento recebidos.</p>
      <div style={{
        background: "white", border: "2px dashed #e2e8f0", borderRadius: 20,
        padding: "60px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🧾</div>
        <p style={{ fontWeight: 700, color: "#0f172a", fontSize: 18, marginBottom: 8 }}>Em breve</p>
        <p style={{ color: "#64748b", fontSize: 14 }}>
          Aqui você verá os comprovantes enviados pelos clientes,<br />
          confirmações de Pix e histórico de pagamentos recebidos.
        </p>
      </div>
    </div>
  );
}
