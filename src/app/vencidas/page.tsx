import Link from "next/link";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export const revalidate = 0;
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date | string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(d));
}
function diasAtraso(venc: Date | string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const v = new Date(venc); v.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - v.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function ParcelasVencidasPage() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const parcelas = await prisma.parcela.findMany({
    where: {
      status: "PENDENTE",
      vencimento: { lt: hoje },
    },
    orderBy: { vencimento: "asc" },
    include: {
      divida: {
        include: {
          cliente: { select: { id: true, nome: true, telefone: true } },
        },
      },
    },
  });

  const totalValor = parcelas.reduce((t, p) => t + Number(p.valor), 0);

  // Agrupar por cliente
  const porCliente = parcelas.reduce<Record<string, {
    cliente: { id: string; nome: string; telefone: string };
    parcelas: typeof parcelas;
    total: number;
  }>>((acc, p) => {
    const cid = p.divida.cliente.id;
    if (!acc[cid]) {
      acc[cid] = { cliente: p.divida.cliente, parcelas: [], total: 0 };
    }
    acc[cid].parcelas.push(p);
    acc[cid].total += Number(p.valor);
    return acc;
  }, {});

  const grupos = Object.values(porCliente).sort((a, b) => b.total - a.total);

  return (
    <main className="page-shell">
      <section className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">⚠️ Parcelas vencidas</h1>
            <p className="page-subtitle">
              {parcelas.length} parcela{parcelas.length !== 1 ? "s" : ""} em atraso
              em {grupos.length} cliente{grupos.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link href="/" className="btn-secondary">← Dashboard</Link>
        </div>

        {/* Resumo */}
        {parcelas.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 14, marginBottom: 24,
          }}>
            <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 14, padding: "16px 20px" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#991b1b" }}>Total em atraso</p>
              <strong style={{ display: "block", fontSize: 22, color: "#7f1d1d" }}>{fmt(totalValor)}</strong>
            </div>
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 14, padding: "16px 20px" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#9a3412" }}>Parcelas</p>
              <strong style={{ display: "block", fontSize: 22, color: "#7c2d12" }}>{parcelas.length}</strong>
            </div>
            <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 14, padding: "16px 20px" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#854d0e" }}>Clientes com atraso</p>
              <strong style={{ display: "block", fontSize: 22, color: "#713f12" }}>{grupos.length}</strong>
            </div>
          </div>
        )}

        {parcelas.length === 0 ? (
          <div className="content-card" style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ fontSize: 40, margin: "0 0 8px" }}>✅</p>
            <p style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
              Nenhuma parcela vencida!
            </p>
            <p style={{ margin: 0, color: "#64748b" }}>Todos os clientes estão em dia.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {grupos.map(({ cliente, parcelas: ps, total }) => (
              <div key={cliente.id} className="content-card" style={{ padding: "20px 24px" }}>
                {/* Cabeçalho do cliente */}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap",
                }}>
                  <div>
                    <Link href={`/clientes/${cliente.id}`} style={{
                      fontWeight: 700, fontSize: 16, color: "#0f172a",
                      textDecoration: "underline", textDecorationColor: "#e2e8f0",
                    }}>
                      {cliente.nome}
                    </Link>
                    <span style={{ display: "block", fontSize: 13, color: "#64748b", marginTop: 2 }}>
                      {cliente.telefone} · {ps.length} parcela{ps.length !== 1 ? "s" : ""} vencida{ps.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <strong style={{ color: "#dc2626", fontSize: 15 }}>{fmt(total)}</strong>
                    <Link
                      href={`/clientes/${cliente.id}/pagamento/novo`}
                      style={{
                        fontSize: 13, fontWeight: 700, color: "#16a34a",
                        padding: "5px 12px", border: "1px solid #bbf7d0", borderRadius: 8,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Registrar pagamento
                    </Link>
                    <a
                      href={`https://api.whatsapp.com/send?phone=55${cliente.telefone.replace(/\D/g, "")}&text=${encodeURIComponent(`Olá ${cliente.nome}, passando para lembrar sobre sua(s) parcela(s) em atraso. Podemos conversar?`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 13, fontWeight: 700, color: "#16a34a",
                        padding: "5px 12px", border: "1px solid #bbf7d0", borderRadius: 8,
                        whiteSpace: "nowrap",
                      }}
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>

                {/* Parcelas do cliente */}
                <div style={{ display: "grid", gap: 6 }}>
                  {ps.map((p) => {
                    const atraso = diasAtraso(p.vencimento);
                    const cor = atraso > 30 ? "#dc2626" : atraso > 7 ? "#ea580c" : "#ca8a04";
                    return (
                      <div key={p.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", background: "#fef2f2", borderRadius: 8, gap: 12,
                        flexWrap: "wrap",
                      }}>
                        <span style={{ fontSize: 13, color: "#64748b" }}>
                          {p.divida.credor} · Parcela {p.numero}
                        </span>
                        <span style={{ fontSize: 13, color: "#64748b" }}>
                          venceu em {fmtData(p.vencimento)}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: cor }}>
                          {atraso}d de atraso
                        </span>
                        <strong style={{ fontSize: 14, color: "#0f172a" }}>
                          {fmt(Number(p.valor))}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
