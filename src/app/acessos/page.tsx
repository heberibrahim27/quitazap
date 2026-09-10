import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Ranking agregado de uso da área logada do assinante (/minha-conta/**),
// alimentado por EventoAnalytics (ver AnalyticsTracker.tsx e
// /api/analytics/evento). V1 só agregado — sem abrir por cliente
// individual, decisão de escopo pra primeira versão desta tela.
function fmtCaminho(c: string) {
  return c.length > 60 ? c.slice(0, 57) + "…" : c;
}

type Ranking = { caminho: string; _count: { caminho: number } };

function RankingCard({ titulo, itens }: { titulo: string; itens: Ranking[] }) {
  return (
    <div className="qa-card">
      <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>{titulo}</h2>
      {itens.length === 0 ? (
        <p style={{ margin: 0, color: "var(--qa-gray-400)", fontSize: 13.5 }}>Sem dado no período.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {itens.map((item, i) => (
            <div
              key={item.caminho}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
            >
              <span style={{ fontSize: 13.5 }}>
                <span style={{ color: "var(--qa-gray-400)", marginRight: 8 }}>{i + 1}.</span>
                {fmtCaminho(item.caminho)}
              </span>
              <span className="qa-badge">{item._count.caminho}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function AcessosPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const params = await searchParams;
  const dias = params.dias === "30" ? 30 : 7;
  const desde = new Date(Date.now() - dias * 86_400_000);

  const [paginas, cliques] = await Promise.all([
    prisma.eventoAnalytics.groupBy({
      by: ["caminho"],
      where: { tipo: "pageview", criadoEm: { gte: desde } },
      _count: { caminho: true },
      orderBy: { _count: { caminho: "desc" } },
      take: 20,
    }),
    prisma.eventoAnalytics.groupBy({
      by: ["caminho"],
      where: { tipo: "click", criadoEm: { gte: desde } },
      _count: { caminho: true },
      orderBy: { _count: { caminho: "desc" } },
      take: 20,
    }),
  ]);

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Acessos — Minha Conta</h1>
          <p className="qa-page-subtitle">
            Páginas mais visitadas e cliques mais comuns dos assinantes na área logada, últimos {dias} dias.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/acessos?dias=7"
            className="qa-btn-secondary"
            style={dias === 7 ? { fontWeight: 700 } : undefined}
          >
            7 dias
          </Link>
          <Link
            href="/acessos?dias=30"
            className="qa-btn-secondary"
            style={dias === 30 ? { fontWeight: 700 } : undefined}
          >
            30 dias
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <RankingCard titulo="Páginas mais acessadas" itens={paginas} />
        <RankingCard titulo="Cliques mais comuns" itens={cliques} />
      </div>
    </div>
  );
}
