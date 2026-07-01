import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ExportarPage() {
  const totalClientes  = await prisma.cliente.count();
  const totalDividas   = await prisma.divida.count();
  const totalParcelas  = await prisma.parcela.count();
  const totalPagamentos = await prisma.pagamento.count();

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Exportar dados</h1>
          <p className="page-subtitle">
            Baixe um backup completo dos dados do QuitaZAP em formato JSON.
          </p>
        </div>

        <div className="content-card" style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: 18 }}>Resumo do banco</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
            {[
              { label: "Clientes",    valor: totalClientes },
              { label: "Dívidas",     valor: totalDividas },
              { label: "Parcelas",    valor: totalParcelas },
              { label: "Pagamentos",  valor: totalPagamentos },
            ].map((item) => (
              <div key={item.label} style={{
                background: "#f8fafc", border: "1px solid #e2e8f0",
                borderRadius: 14, padding: 16, textAlign: "center",
              }}>
                <strong style={{ display: "block", fontSize: 28, color: "#0f172a" }}>{item.valor}</strong>
                <span style={{ fontSize: 13, color: "#64748b" }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="content-card" style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: 18 }}>Exportação completa (JSON)</h2>
          <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
            O arquivo JSON contém todos os clientes, dívidas, parcelas e pagamentos.
            Use para backup ou para migrar para outro ambiente.
          </p>
          <a
            href="/api/exportar"
            download="quitazap-backup.json"
            style={{
              display: "inline-block",
              background: "#16a34a", color: "#ffffff",
              padding: "12px 20px", borderRadius: 12,
              fontWeight: 700, fontSize: 15, textDecoration: "none",
            }}
          >
            ⬇️ Baixar backup JSON
          </a>
        </div>

        <div style={{ padding: "16px 20px", background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 14, marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#854d0e", lineHeight: 1.6 }}>
            <strong>Dica:</strong> Faça backup regularmente antes de atualizações ou mudanças no banco.
            O arquivo <code>prisma/dev.db</code> também pode ser copiado diretamente como backup do SQLite.
          </p>
        </div>

        <Link href="/" style={{ color: "#16a34a", fontWeight: 700 }}>← Voltar para o dashboard</Link>
      </section>
    </main>
  );
}
