import Link from "next/link";
import { prisma } from "@/lib/prisma";

function fmt(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function fmtData(data: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(data));
}

export default async function Home() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const em7Dias = new Date(hoje); em7Dias.setDate(em7Dias.getDate() + 7);
  const em30Dias = new Date(hoje); em30Dias.setDate(em30Dias.getDate() + 30);

  const [
    totalClientes,
    dividas,
    pagamentos,
    parcelas,
    clientesRecentes,
    totalPlanosEnviados,
    todosClientes,
  ] = await Promise.all([
    prisma.cliente.count(),
    prisma.divida.findMany(),
    prisma.pagamento.findMany(),
    prisma.parcela.findMany({
      where: { status: "PENDENTE" },
      include: { divida: { include: { cliente: true } } },
      orderBy: { vencimento: "asc" },
    }),
    prisma.cliente.findMany({
      orderBy: { criadoEm: "desc" },
      take: 5,
      include: { _count: { select: { dividas: true } } },
    }),
    prisma.planoEnviado.count(),
    prisma.cliente.findMany({
      include: {
        dividas: { select: { valorTotal: true, valorPago: true, status: true } },
        pagamentos: { select: { valor: true } },
      },
    }),
  ]);

  const valorTotalDividas = dividas.reduce((t, d) => t + Number(d.valorTotal), 0);
  const valorTotalPago    = pagamentos.reduce((t, p) => t + Number(p.valor), 0);
  const saldoAberto       = Math.max(valorTotalDividas - valorTotalPago, 0);

  const vencidas   = parcelas.filter((p) => new Date(p.vencimento) < hoje);
  const prox7Dias  = parcelas.filter((p) => { const v = new Date(p.vencimento); return v >= hoje && v <= em7Dias; });
  const prox30Dias = parcelas.filter((p) => { const v = new Date(p.vencimento); return v >= hoje && v <= em30Dias; });

  const valorVencidas  = vencidas.reduce((t, p) => t + Number(p.valor), 0);
  const valorProx7     = prox7Dias.reduce((t, p) => t + Number(p.valor), 0);
  const valorProx30    = prox30Dias.reduce((t, p) => t + Number(p.valor), 0);

  // Ranking por saldo devedor
  const ranking = todosClientes
    .map((c) => {
      const totalDiv = c.dividas.filter(d => d.status !== "QUITADA").reduce((t, d) => t + Number(d.valorTotal), 0);
      const totalPg  = c.pagamentos.reduce((t, p) => t + Number(p.valor), 0);
      return { id: c.id, nome: c.nome, saldo: Math.max(0, totalDiv - totalPg), dividas: c.dividas.length };
    })
    .filter((c) => c.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 5);

  // Clientes com parcelas vencidas (únicos)
  const clientesComVencidas = [
    ...new Map(
      vencidas.map((p) => [p.divida.cliente.id, p.divida.cliente])
    ).values(),
  ];

  return (
    <main className="app-shell">
      <section className="home-card">

        {/* ── Header ── */}
        <div className="home-header">
          <div className="brand-row">
            <img src="/logo-quitazap.svg" alt="QuitaZAP" style={{ width: 260, maxWidth: "100%", height: "auto" }} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/clientes/novo" className="btn-primary">+ Novo cliente</Link>
            <Link href="/clientes" className="primary-link">Ver clientes</Link>
          </div>
        </div>

        {/* ── Alerta de vencidas ── */}
        {vencidas.length > 0 && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 18, padding: 20, marginBottom: 24,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            flexWrap: "wrap", gap: 12,
          }}>
            <div>
              <strong style={{ color: "#991b1b", display: "block", marginBottom: 4 }}>
                ⚠️ {vencidas.length} parcela(s) vencida(s) — {fmt(valorVencidas)}
              </strong>
              <span style={{ color: "#7f1d1d", fontSize: 14 }}>
                {clientesComVencidas.length} cliente(s) com pendências em atraso.
              </span>
            </div>
            <Link
              href="#vencidas"
              style={{ background: "#dc2626", color: "#fff", padding: "8px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14 }}
            >
              Ver clientes
            </Link>
          </div>
        )}

        {/* ── Stats principais ── */}
        <div className="stats-grid">
          <div className="stat-card">
            <p className="stat-label">Clientes cadastrados</p>
            <strong className="stat-value">{totalClientes}</strong>
          </div>
          <div className="stat-card">
            <p className="stat-label">Dívidas cadastradas</p>
            <strong className="stat-value">{dividas.length}</strong>
          </div>
          <div className="stat-card">
            <p className="stat-label">Saldo total em aberto</p>
            <strong className="stat-value stat-value-green">{fmt(saldoAberto)}</strong>
          </div>
        </div>

        {/* ── Stats vencimentos ── */}
        <div className="stats-grid">
          <div className="stat-card" style={{ borderLeft: vencidas.length > 0 ? "4px solid #dc2626" : undefined }}>
            <p className="stat-label">Parcelas vencidas</p>
            <strong className="stat-value" style={{ color: vencidas.length > 0 ? "#dc2626" : undefined }}>
              {vencidas.length}
            </strong>
            {vencidas.length > 0 && (
              <span style={{ display: "block", fontSize: 13, color: "#dc2626", marginTop: 4 }}>{fmt(valorVencidas)}</span>
            )}
          </div>
          <div className="stat-card">
            <p className="stat-label">Vencem em 7 dias</p>
            <strong className="stat-value">{prox7Dias.length}</strong>
            <span style={{ display: "block", fontSize: 13, color: "#64748b", marginTop: 4 }}>{fmt(valorProx7)}</span>
          </div>
          <div className="stat-card">
            <p className="stat-label">Vencem em 30 dias</p>
            <strong className="stat-value">{prox30Dias.length}</strong>
            <span style={{ display: "block", fontSize: 13, color: "#64748b", marginTop: 4 }}>{fmt(valorProx30)}</span>
          </div>
        </div>

        {/* ── Stats operacionais ── */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <p className="stat-label">Total arrecadado</p>
            <strong className="stat-value stat-value-green">{fmt(valorTotalPago)}</strong>
          </div>
          <div className="stat-card">
            <p className="stat-label">Total das dívidas</p>
            <strong className="stat-value">{fmt(valorTotalDividas)}</strong>
          </div>
          <div className="stat-card">
            <p className="stat-label">Planos enviados</p>
            <strong className="stat-value">{totalPlanosEnviados}</strong>
          </div>
        </div>

        {/* ── Clientes com vencidas ── */}
        {clientesComVencidas.length > 0 && (
          <div className="content-card" style={{ marginBottom: 24 }} id="vencidas">
            <h2 style={{ margin: "0 0 16px", color: "#991b1b", fontSize: 18 }}>
              ⚠️ Clientes com parcelas vencidas
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {clientesComVencidas.map((cliente) => {
                const qtd = vencidas.filter((p) => p.divida.cliente.id === cliente.id).length;
                const val = vencidas.filter((p) => p.divida.cliente.id === cliente.id).reduce((t, p) => t + Number(p.valor), 0);
                return (
                  <Link key={cliente.id} href={`/clientes/${cliente.id}`} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px", border: "1px solid #fecaca", borderRadius: 12,
                    background: "#fff5f5", gap: 12,
                  }}>
                    <div>
                      <strong style={{ color: "#0f172a" }}>{cliente.nome}</strong>
                      <span style={{ display: "block", fontSize: 13, color: "#dc2626", marginTop: 2 }}>
                        {qtd} parcela(s) vencida(s)
                      </span>
                    </div>
                    <strong style={{ color: "#dc2626", whiteSpace: "nowrap" }}>{fmt(val)}</strong>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Próximos vencimentos (7 dias) ── */}
        <div className="content-card" style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: 18 }}>
            📅 Próximos vencimentos (7 dias)
          </h2>
          {prox7Dias.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>Nenhuma parcela vencendo nos próximos 7 dias.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {prox7Dias.slice(0, 8).map((parcela) => {
                const diff = Math.round((new Date(parcela.vencimento).getTime() - hoje.getTime()) / 86400000);
                const quando = diff === 0 ? "hoje" : diff === 1 ? "amanhã" : `em ${diff} dias`;
                return (
                  <Link key={parcela.id} href={`/clientes/${parcela.divida.cliente.id}`} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 12,
                    background: "#ffffff", gap: 12,
                  }}>
                    <div>
                      <strong style={{ display: "block", color: "#0f172a" }}>{parcela.divida.cliente.nome}</strong>
                      <span style={{ fontSize: 13, color: "#64748b" }}>
                        {parcela.divida.credor} · parcela {parcela.numero} · vence {quando}
                      </span>
                    </div>
                    <strong style={{ color: "#16a34a", whiteSpace: "nowrap" }}>{fmt(Number(parcela.valor))}</strong>
                  </Link>
                );
              })}
              {prox7Dias.length > 8 && (
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                  + {prox7Dias.length - 8} mais não exibidos.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Clientes recentes ── */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ margin: 0, color: "#0f172a", fontSize: 18 }}>👥 Clientes recentes</h2>
            <Link href="/clientes" style={{ color: "#16a34a", fontWeight: 700, fontSize: 14 }}>Ver todos →</Link>
          </div>
          {clientesRecentes.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>Nenhum cliente cadastrado ainda.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {clientesRecentes.map((cliente) => (
                <Link key={cliente.id} href={`/clientes/${cliente.id}`} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 12,
                  background: "#ffffff", gap: 12,
                }}>
                  <div>
                    <strong style={{ display: "block", color: "#0f172a" }}>{cliente.nome}</strong>
                    <span style={{ fontSize: 13, color: "#64748b" }}>{cliente.telefone}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>
                    {cliente._count.dividas} dívida(s)
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Ranking ── */}
        {ranking.length > 0 && (
          <div className="content-card" style={{ marginTop: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, color: "#0f172a", fontSize: 18 }}>🏆 Maiores saldos em aberto</h2>
              <Link href="/clientes" style={{ color: "#16a34a", fontWeight: 700, fontSize: 14 }}>Ver todos →</Link>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {ranking.map((c, i) => (
                <Link key={c.id} href={`/clientes/${c.id}`} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", border: "1px solid #e2e8f0",
                  borderRadius: 12, background: "#fff",
                }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: i === 0 ? "#fef9c3" : i === 1 ? "#f1f5f9" : "#fafafa",
                    color: i === 0 ? "#854d0e" : "#64748b",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: 13,
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600, color: "#0f172a", fontSize: 14 }}>{c.nome}</span>
                  <strong style={{ color: "#dc2626", fontSize: 14, whiteSpace: "nowrap" }}>
                    {fmt(c.saldo)}
                  </strong>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Links rápidos ── */}
        <div style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link href="/exportar" style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>
            ⬇️ Exportar dados
          </Link>
          <Link href="/oferta" style={{ color: "#16a34a", fontSize: 14, fontWeight: 600 }}>
            🌐 Ver página de oferta
          </Link>
        </div>

      </section>
    </main>
  );
}
