import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

function formatarDataHora(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(data));
}

export default async function HistoricoPlanosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      planosEnviados: {
        orderBy: { criadoEm: "desc" },
      },
    },
  });

  if (!cliente) notFound();

  return (
    <main className="page-shell">
      <section className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Histórico de planos</h1>
            <p className="page-subtitle">
              {cliente.nome} · {cliente.planosEnviados.length} plano(s) enviado(s)
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href={`/clientes/${id}/plano`} className="btn-primary">Gerar novo plano</Link>
            <Link href={`/clientes/${id}`} className="btn-secondary">Voltar</Link>
          </div>
        </div>

        {cliente.planosEnviados.length === 0 ? (
          <div className="content-card" style={{ textAlign: "center", padding: "40px 24px" }}>
            <p style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
              Nenhum plano enviado ainda
            </p>
            <p style={{ margin: "0 0 24px", color: "#64748b" }}>
              Gere um plano e clique em "Marcar como enviado" para registrar aqui.
            </p>
            <Link href={`/clientes/${id}/plano`} className="btn-primary">
              Gerar plano agora
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {cliente.planosEnviados.map((plano, index) => (
              <div key={plano.id} className="content-card">
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8,
                }}>
                  <div>
                    <strong style={{ color: "#0f172a" }}>
                      Plano #{cliente.planosEnviados.length - index}
                    </strong>
                    <span style={{ display: "block", fontSize: 13, color: "#64748b", marginTop: 2 }}>
                      Enviado em: {formatarDataHora(plano.criadoEm)}
                    </span>
                  </div>
                  <span style={{
                    background: "#dcfce7", color: "#166534",
                    padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  }}>
                    ✓ Enviado
                  </span>
                </div>

                <textarea
                  readOnly
                  value={plano.texto}
                  style={{
                    width: "100%", minHeight: 200, border: "1px solid #e2e8f0",
                    borderRadius: 12, padding: 14, fontSize: 13, lineHeight: 1.6,
                    color: "#475569", background: "#f8fafc", resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
