import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { IconDownload, IconArrowUpRight } from "@/components/icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ExportarPage() {
  const totalClientes = await prisma.cliente.count();

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Exportar dados</h1>
          <p className="qa-page-subtitle">Baixe uma cópia dos dados de conta/assinatura do QuitaZAP.</p>
        </div>
      </div>

      <div className="qa-card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Resumo</h2>
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid var(--qa-line-soft)",
          borderRadius: 14, padding: 16, textAlign: "center", maxWidth: 160,
        }}>
          <strong style={{ display: "block", fontSize: 26, fontWeight: 300 }}>{totalClientes}</strong>
          <span style={{ fontSize: 13, color: "var(--qa-gray-400)" }}>Clientes</span>
        </div>
      </div>

      <div className="qa-card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>Cópia completa</h2>
        <p style={{ margin: "0 0 20px", color: "var(--qa-gray-400)", fontSize: 13.5, lineHeight: 1.6 }}>
          Um arquivo com os dados de conta/assinatura de cada cliente (nome, WhatsApp, status de
          pagamento) — guarde num lugar seguro (Google Drive, computador) como backup. Não inclui
          dado financeiro pessoal do cliente nem a senha de acesso ao app.
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
