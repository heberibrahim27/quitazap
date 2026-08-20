import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { IconDownload, IconArrowUpRight } from "@/components/icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ExportarPage() {
  const totalClientes  = await prisma.cliente.count();
  const totalDividas   = await prisma.divida.count();
  const totalParcelas  = await prisma.parcela.count();
  const totalPagamentos = await prisma.pagamento.count();

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Exportar dados</h1>
          <p className="qa-page-subtitle">Baixe uma cópia completa dos dados do QuitaZAP.</p>
        </div>
      </div>

      <div className="qa-card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Resumo</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
          {[
            { label: "Clientes",    valor: totalClientes },
            { label: "Dívidas",     valor: totalDividas },
            { label: "Parcelas",    valor: totalParcelas },
            { label: "Pagamentos",  valor: totalPagamentos },
          ].map((item) => (
            <div key={item.label} style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid var(--qa-line-soft)",
              borderRadius: 14, padding: 16, textAlign: "center",
            }}>
              <strong style={{ display: "block", fontSize: 26, fontWeight: 300 }}>{item.valor}</strong>
              <span style={{ fontSize: 13, color: "var(--qa-gray-400)" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="qa-card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>Cópia completa</h2>
        <p style={{ margin: "0 0 20px", color: "var(--qa-gray-400)", fontSize: 13.5, lineHeight: 1.6 }}>
          Um arquivo com todos os clientes, dívidas, parcelas e pagamentos cadastrados — guarde num
          lugar seguro (Google Drive, computador) como backup, ou para levar seus dados pra outro lugar.
        </p>
        <a href="/api/exportar" download="quitazap-backup.json" className="qa-btn-primary">
          <IconDownload size={15} /> Baixar cópia
        </a>
      </div>

      <div className="qa-alert qa-alert-amber">
        <strong>Dica:</strong>&nbsp;baixe essa cópia regularmente, principalmente antes de qualquer mudança grande no sistema.
      </div>

      <Link href="/painel" style={{ color: "#7dc4ff", fontWeight: 600, fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 16 }}>
        <IconArrowUpRight size={13} style={{ transform: "rotate(-135deg)" }} /> Voltar para o dashboard
      </Link>
    </div>
  );
}
