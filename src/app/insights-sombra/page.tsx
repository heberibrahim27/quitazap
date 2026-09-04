import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { IconCheckCircle, IconTrendUp } from "@/components/icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

// Tela read-only pra revisar o que o cron /api/cron/insights-sombra vem
// detectando (src/lib/financeiro/deteccao-anomalia.ts) antes de decidir
// enviar isso de verdade pro cliente — hoje todo InsightDetectado nasce com
// status "SOMBRA" e fica só aqui, nunca vira WhatsApp/push.
export default async function InsightsSombraPage() {
  const insights = await prisma.insightDetectado.findMany({
    orderBy: { criadoEm: "desc" },
    take: 200,
    include: { cliente: { select: { id: true, nome: true, telefone: true } } },
  });

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Insights (modo sombra)</h1>
          <p className="qa-page-subtitle">
            {insights.length} detecção{insights.length !== 1 ? "ões" : ""} de gasto acima do normal por categoria — nada disso foi enviado ao cliente.
          </p>
        </div>
        <Link href="/painel" className="qa-btn-secondary">← Dashboard</Link>
      </div>

      {insights.length === 0 ? (
        <div className="qa-card" style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "#6ee7b7" }}>
            <IconCheckCircle size={40} />
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 600 }}>Nenhum insight detectado ainda</p>
          <p style={{ margin: 0, color: "var(--qa-gray-400)" }}>
            O cron roda 1x por dia — volte depois que houver dado do mês corrente pra comparar com a média.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {insights.map((i) => (
            <div key={i.id} className="qa-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                <div>
                  <Link href={`/clientes/${i.cliente.id}`} style={{ fontWeight: 700, fontSize: 15 }}>{i.cliente.nome}</Link>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--qa-gray-400)", marginTop: 2 }}>
                    {i.categoria} · {i.mes} · {fmtData(i.criadoEm)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#fcd34d", fontWeight: 700, fontSize: 14 }}>
                  <IconTrendUp size={15} /> {i.multiplicador.toFixed(1)}x
                </div>
              </div>

              <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.5 }}>{i.textoGerado}</p>

              <div style={{ display: "flex", gap: 16, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
                <span>Este mês: <strong style={{ color: "var(--qa-gray-100, #eee)" }}>{fmt(i.totalMesAtual)}</strong></span>
                <span>Média últimos meses: {fmt(i.mediaUltimosMeses)}</span>
                <span>Status: {i.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
