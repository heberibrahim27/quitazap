import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date | string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
}

export default async function HistoricoPagamentosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      pagamentos: {
        orderBy: { data: "desc" },
        include: { divida: { select: { credor: true } } },
      },
    },
  });
  if (!cliente) notFound();

  const total = cliente.pagamentos.reduce((t, p) => t + Number(p.valor), 0);

  return (
    <main className="page-shell">
      <section className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Pagamentos</h1>
            <p className="page-subtitle">Cliente: {cliente.nome}</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href={`/clientes/${id}/pagamento/novo`} className="btn-primary">+ Registrar pagamento</Link>
            <Link href={`/clientes/${id}`} className="btn-secondary">Voltar</Link>
          </div>
        </div>

        {/* Resumo */}
        <div style={{
          background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 14,
          padding: "14px 20px", marginBottom: 20,
          display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center",
        }}>
          <div>
            <span style={{ fontSize: 12, color: "#166534" }}>Total pago</span>
            <strong style={{ display: "block", fontSize: 22, color: "#14532d" }}>{fmt(total)}</strong>
          </div>
          <div>
            <span style={{ fontSize: 12, color: "#166534" }}>Registros</span>
            <strong style={{ display: "block", fontSize: 22, color: "#14532d" }}>{cliente.pagamentos.length}</strong>
          </div>
        </div>

        {cliente.pagamentos.length === 0 ? (
          <div className="content-card" style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
              Nenhum pagamento registrado
            </p>
            <p style={{ margin: "0 0 20px", color: "#64748b" }}>
              Registre o primeiro pagamento deste cliente.
            </p>
            <Link href={`/clientes/${id}/pagamento/novo`} className="btn-primary">
              + Registrar pagamento
            </Link>
          </div>
        ) : (
          <div className="content-card">
            <div style={{ display: "grid", gap: 10 }}>
              {cliente.pagamentos.map((p, i) => (
                <div key={p.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 16px", border: "1px solid #e2e8f0",
                  borderRadius: 12, background: "#fff", gap: 12,
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ display: "block", color: "#0f172a", fontSize: 14 }}>
                      {p.divida.credor}
                    </strong>
                    {p.obs && (
                      <span style={{ display: "block", color: "#64748b", fontSize: 13, marginTop: 2 }}>
                        {p.obs}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <strong style={{ display: "block", color: "#16a34a", fontSize: 15 }}>
                      {fmt(Number(p.valor))}
                    </strong>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{fmtData(p.data)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
