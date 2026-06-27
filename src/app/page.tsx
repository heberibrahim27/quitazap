import Link from "next/link";
import { prisma } from "@/lib/prisma";

function fmt(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}
function fmtData(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(data));
}

const PRECO_MENSAL = 29.90; // R$ por assinante/mês

async function buscarCustoIA(): Promise<{ gastoMes: number; gastoPagantes: number; gastoGratuitos: number }> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const inicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [pagantes, gratuitos] = await Promise.all([
      prisma.logIA.aggregate({
        _sum: { custoUSD: true },
        where: { gratuito: false, criadoEm: { gte: inicio } },
      }),
      prisma.logIA.aggregate({
        _sum: { custoUSD: true },
        where: { gratuito: true, criadoEm: { gte: inicio } },
      }),
    ]);

    const gastoPagantes  = pagantes._sum.custoUSD  ?? 0;
    const gastoGratuitos = gratuitos._sum.custoUSD ?? 0;
    return { gastoMes: gastoPagantes + gastoGratuitos, gastoPagantes, gastoGratuitos };
  } catch {
    return { gastoMes: 0, gastoPagantes: 0, gastoGratuitos: 0 };
  }
}

export default async function Home() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const em7Dias = new Date(hoje); em7Dias.setDate(em7Dias.getDate() + 7);

  const [clientes, totalPlanos, custoIA] = await Promise.all([
    prisma.cliente.findMany({
      select: {
        id: true,
        nome: true,
        telefone: true,
        gratuito: true,
        criadoEm: true,
        assinaturaVenceEm: true,
        statusAtendimento: true,
        _count: { select: { planosEnviados: true } },
      },
      orderBy: { criadoEm: "desc" },
    }),
    prisma.planoEnviado.count(),
    buscarCustoIA(),
  ]);

  // ── Métricas de negócio ──────────────────
  const pagantes   = clientes.filter((c) => !c.gratuito);
  const gratuitos  = clientes.filter((c) => c.gratuito);

  // MRR = assinantes pagantes × R$29,90
  const mrr = pagantes.length * PRECO_MENSAL;

  // Receita total estimada (meses ativos × R$29,90)
  const receitaTotal = pagantes.reduce((acc, c) => {
    const meses = Math.max(1, Math.floor(
      (Date.now() - new Date(c.criadoEm).getTime()) / (1000 * 60 * 60 * 24 * 30)
    ));
    return acc + meses * PRECO_MENSAL;
  }, 0);

  // Assinaturas vencendo em 7 dias (pagantes)
  const vencendoEm7 = pagantes.filter((c) => {
    if (!c.assinaturaVenceEm) return false;
    const v = new Date(c.assinaturaVenceEm);
    return v >= hoje && v <= em7Dias;
  });

  // Assinaturas vencidas
  const vencidas = pagantes.filter((c) => {
    if (!c.assinaturaVenceEm) return false;
    return new Date(c.assinaturaVenceEm) < hoje;
  });

  // Clientes sem data de vencimento definida (cadastrados antes da feature)
  const semVencimento = pagantes.filter((c) => !c.assinaturaVenceEm);

  // Custo IA em BRL (USD × 5.7)
  const USD_BRL = 5.7;
  const custoIABRL         = custoIA.gastoMes      * USD_BRL;
  const custoIAPagantesBRL = custoIA.gastoPagantes * USD_BRL;
  const custoIAGratuitosBRL= custoIA.gastoGratuitos* USD_BRL;
  const lucroEstimado      = mrr - custoIABRL;

  return (
    <main className="app-shell">
      <section className="home-card">

        {/* ── Header ── */}
        <div className="home-header">
          <div className="brand-row">
            <img src="/logo-quitazap.svg" alt="QuitaZAP" style={{ width: 220, maxWidth: "100%", height: "auto" }} />
            <span style={{ fontSize: 13, color: "#64748b", marginTop: 4, display: "block" }}>
              Painel administrativo
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/clientes/novo" className="btn-primary">+ Novo cliente</Link>
            <Link href="/clientes" className="primary-link">Ver clientes</Link>
          </div>
        </div>

        {/* ── Alerta: vencimentos próximos ── */}
        {vencendoEm7.length > 0 && (
          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 14,
            padding: "14px 16px", marginBottom: 20,
            display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
          }}>
            <div>
              <strong style={{ color: "#92400e", display: "block", marginBottom: 2 }}>
                ⏳ {vencendoEm7.length} assinatura{vencendoEm7.length !== 1 ? "s" : ""} vencendo nos próximos 7 dias
              </strong>
              <span style={{ fontSize: 13, color: "#78350f" }}>
                {vencendoEm7.map((c) => c.nome).join(", ")}
              </span>
            </div>
            <Link href="/clientes" style={{
              background: "#d97706", color: "#fff", padding: "7px 14px",
              borderRadius: 10, fontWeight: 700, fontSize: 13,
            }}>Ver clientes</Link>
          </div>
        )}

        {vencidas.length > 0 && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14,
            padding: "14px 16px", marginBottom: 20,
          }}>
            <strong style={{ color: "#991b1b", display: "block", marginBottom: 2 }}>
              ⚠️ {vencidas.length} assinatura{vencidas.length !== 1 ? "s" : ""} vencida{vencidas.length !== 1 ? "s" : ""}
            </strong>
            <span style={{ fontSize: 13, color: "#7f1d1d" }}>
              {vencidas.map((c) => `${c.nome} (venceu ${fmtData(new Date(c.assinaturaVenceEm!))})`).join(" · ")}
            </span>
          </div>
        )}

        {/* ── Linha 1: Assinantes ── */}
        <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
          Assinantes
        </p>
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card" style={{ borderLeft: "4px solid #16a34a" }}>
            <p className="stat-label">Clientes pagos</p>
            <strong className="stat-value" style={{ color: "#16a34a" }}>{pagantes.length}</strong>
          </div>
          <div className="stat-card" style={{ borderLeft: "4px solid #2563eb" }}>
            <p className="stat-label">Clientes gratuitos</p>
            <strong className="stat-value" style={{ color: "#2563eb" }}>{gratuitos.length}</strong>
          </div>
          <div className="stat-card">
            <p className="stat-label">Total de clientes</p>
            <strong className="stat-value">{clientes.length}</strong>
          </div>
        </div>

        {/* ── Linha 2: Receita ── */}
        <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
          Receita
        </p>
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card" style={{ borderLeft: "4px solid #7c3aed" }}>
            <p className="stat-label">MRR (receita mensal)</p>
            <strong className="stat-value" style={{ color: "#7c3aed" }}>{fmt(mrr)}</strong>
            <span style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, display: "block" }}>
              {pagantes.length} × {fmt(PRECO_MENSAL)}
            </span>
          </div>
          <div className="stat-card">
            <p className="stat-label">Receita total estimada</p>
            <strong className="stat-value" style={{ color: "#7c3aed" }}>{fmt(receitaTotal)}</strong>
            <span style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, display: "block" }}>
              acumulado histórico
            </span>
          </div>
          <div className="stat-card">
            <p className="stat-label">Planos gerados</p>
            <strong className="stat-value">{totalPlanos}</strong>
          </div>
        </div>

        {/* ── Linha 3: Custos e IA ── */}
        <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
          Operação
        </p>
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card" style={{ borderLeft: "4px solid #dc2626" }}>
            <p className="stat-label">Gasto IA este mês</p>
            <strong className="stat-value" style={{ color: custoIABRL > 0 ? "#dc2626" : "#94a3b8" }}>
              {custoIABRL > 0 ? fmt(custoIABRL) : "R$ 0,00"}
            </strong>
            <span style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, display: "block" }}>
              pagantes {fmt(custoIAPagantesBRL)} · gratuitos {fmt(custoIAGratuitosBRL)}
            </span>
          </div>
          <div className="stat-card" style={{ borderLeft: lucroEstimado >= 0 ? "4px solid #16a34a" : "4px solid #dc2626" }}>
            <p className="stat-label">Lucro estimado/mês</p>
            <strong className="stat-value" style={{ color: lucroEstimado >= 0 ? "#16a34a" : "#dc2626" }}>
              {fmt(lucroEstimado)}
            </strong>
            <span style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, display: "block" }}>
              MRR − custo IA real
            </span>
          </div>
          <div className="stat-card" style={{ borderLeft: vencidas.length > 0 ? "4px solid #dc2626" : vencendoEm7.length > 0 ? "4px solid #d97706" : "4px solid #e2e8f0" }}>
            <p className="stat-label">Assinaturas em risco</p>
            <strong className="stat-value" style={{ color: vencidas.length > 0 ? "#dc2626" : vencendoEm7.length > 0 ? "#d97706" : "#16a34a" }}>
              {vencidas.length + vencendoEm7.length}
            </strong>
            <span style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, display: "block" }}>
              {vencidas.length} vencida{vencidas.length !== 1 ? "s" : ""} · {vencendoEm7.length} vencendo
            </span>
          </div>
        </div>

        {/* ── Lista: Clientes recentes ── */}
        <div className="content-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h2 style={{ margin: 0, color: "#0f172a", fontSize: 16 }}>👥 Clientes recentes</h2>
            <Link href="/clientes" style={{ color: "#16a34a", fontWeight: 700, fontSize: 13 }}>Ver todos →</Link>
          </div>
          {clientes.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>Nenhum cliente cadastrado ainda.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {clientes.slice(0, 6).map((c) => {
                const isGratuito = c.gratuito;
                const vence = c.assinaturaVenceEm ? new Date(c.assinaturaVenceEm) : null;
                const diasParaVencer = vence ? Math.ceil((vence.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) : null;
                const statusVenc = diasParaVencer === null
                  ? (isGratuito ? "gratuito" : "sem_data")
                  : diasParaVencer < 0 ? "vencido"
                  : diasParaVencer <= 7 ? "urgente"
                  : "ok";

                return (
                  <Link key={c.id} href={`/clientes/${c.id}`} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 12,
                    background: "#fff", gap: 12,
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ display: "block", color: "#0f172a", fontSize: 14 }}>{c.nome}</strong>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>
                        desde {fmtData(c.criadoEm)}
                        {c._count.planosEnviados > 0 && ` · ${c._count.planosEnviados} plano${c._count.planosEnviados !== 1 ? "s" : ""}`}
                      </span>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {isGratuito ? (
                        <span style={{ fontSize: 12, background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                          🎁 Gratuito
                        </span>
                      ) : statusVenc === "vencido" ? (
                        <span style={{ fontSize: 12, background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                          ⚠️ Vencida
                        </span>
                      ) : statusVenc === "urgente" ? (
                        <span style={{ fontSize: 12, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                          ⏳ {diasParaVencer}d
                        </span>
                      ) : statusVenc === "ok" ? (
                        <span style={{ fontSize: 12, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                          ✅ {fmtData(vence!)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>
                          {fmt(PRECO_MENSAL)}/mês
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Links rápidos ── */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link href="/exportar" style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>⬇️ Exportar dados</Link>
          <Link href="/oferta" style={{ color: "#16a34a", fontSize: 14, fontWeight: 600 }}>🌐 Página de oferta</Link>
        </div>

      </section>
    </main>
  );
}
