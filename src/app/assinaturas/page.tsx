import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calcularStatusAssinatura, whereStatusAssinatura, LABEL_STATUS_ASSINATURA, COR_STATUS_ASSINATURA, type StatusAssinatura } from "@/lib/status-assinatura";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtData(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function ehStatusAssinatura(v: string): v is StatusAssinatura {
  return v === "PAGO" || v === "CANCELADO" || v === "INATIVO";
}

// Gestão de assinaturas — nome, WhatsApp e status de pagamento, com
// filtro por status. Substitui a antiga fila de cobrança de dívida
// pessoal (parcelas em atraso do cliente): decisão de escopo do admin
// (Ibrahim, 2026-09-05) é que essa área serve só pra gestão
// financeira/administrativa do SaaS, não pra negociação de dívida.
export default async function AssinaturasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const statusFiltro = status && ehStatusAssinatura(status) ? status : null;

  const [clientes, todos] = await Promise.all([
    prisma.cliente.findMany({
      where: statusFiltro ? whereStatusAssinatura(statusFiltro) : undefined,
      orderBy: { criadoEm: "desc" },
      select: { id: true, nome: true, telefone: true, criadoEm: true, gratuito: true, assinaturaVenceEm: true },
    }),
    prisma.cliente.findMany({ select: { gratuito: true, assinaturaVenceEm: true } }),
  ]);

  const contagem: Record<StatusAssinatura, number> = { PAGO: 0, CANCELADO: 0, INATIVO: 0 };
  for (const c of todos) contagem[calcularStatusAssinatura(c)]++;

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Assinaturas</h1>
          <p className="qa-page-subtitle">
            {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}{statusFiltro ? " neste status" : " no total"}
          </p>
        </div>
        <Link href="/painel" className="qa-btn-secondary">← Dashboard</Link>
      </div>

      <div className="qa-stat-grid">
        {(["PAGO", "CANCELADO", "INATIVO"] as const).map((s) => {
          const cor = COR_STATUS_ASSINATURA[s];
          return (
            <Link
              key={s}
              href={statusFiltro === s ? "/assinaturas" : `/assinaturas?status=${s}`}
              className="qa-stat-card"
              style={{ textDecoration: "none", border: statusFiltro === s ? `1px solid ${cor.border}` : undefined }}
            >
              <p className="qa-stat-label">{LABEL_STATUS_ASSINATURA[s]}</p>
              <strong className="qa-stat-value" style={{ color: cor.color }}>{contagem[s]}</strong>
            </Link>
          );
        })}
      </div>

      {statusFiltro && (
        <div style={{ marginBottom: 16 }}>
          <Link href="/assinaturas" className="qa-btn-secondary">Limpar filtro</Link>
        </div>
      )}

      <div className="qa-card">
        {clientes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ margin: 0, color: "var(--qa-gray-400)" }}>Nenhum cliente neste status.</p>
          </div>
        ) : (
          <div>
            {clientes.map((cliente) => {
              const status = calcularStatusAssinatura(cliente);
              const cor = COR_STATUS_ASSINATURA[status];
              return (
                <Link key={cliente.id} href={`/clientes/${cliente.id}`} className="qa-list-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <strong style={{ fontSize: 14.5 }}>{cliente.nome}</strong>
                      <span className="qa-badge" style={{ background: cor.bg, color: cor.color, border: `1px solid ${cor.border}` }}>
                        {LABEL_STATUS_ASSINATURA[status]}
                      </span>
                    </div>
                    <span style={{ display: "block", color: "var(--qa-gray-400)", fontSize: 13 }}>{cliente.telefone}</span>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, fontSize: 12.5, color: "var(--qa-gray-500)" }}>
                    {cliente.assinaturaVenceEm ? `${status === "CANCELADO" ? "venceu" : "vence"} ${fmtData(cliente.assinaturaVenceEm)}` : "-"}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
