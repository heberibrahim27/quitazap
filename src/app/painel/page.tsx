import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { IconUsers, IconWallet, IconTrendUp, IconAlertTriangle, IconCheckCircle, IconArrowUpRight, IconPlus } from "@/components/icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  // Custo IA em BRL (USD × 5.7)
  const USD_BRL = 5.7;
  const custoIABRL         = custoIA.gastoMes      * USD_BRL;
  const custoIAPagantesBRL = custoIA.gastoPagantes * USD_BRL;
  const custoIAGratuitosBRL= custoIA.gastoGratuitos* USD_BRL;
  const lucroEstimado      = mrr - custoIABRL;

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Dashboard</h1>
          <p className="qa-page-subtitle">Visão geral do QuitaZAP — assinantes, receita e operação.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/clientes/novo" className="qa-btn-primary"><IconPlus size={15} /> Novo cliente</Link>
          <Link href="/clientes" className="qa-btn-secondary">Ver clientes</Link>
        </div>
      </div>

      {vencendoEm7.length > 0 && (
        <div className="qa-alert qa-alert-amber">
          <IconAlertTriangle size={18} />
          <div>
            <strong style={{ display: "block", marginBottom: 2 }}>
              {vencendoEm7.length} assinatura{vencendoEm7.length !== 1 ? "s" : ""} vencendo nos próximos 7 dias
            </strong>
            <span style={{ opacity: 0.85 }}>{vencendoEm7.map((c) => c.nome).join(", ")}</span>
          </div>
        </div>
      )}

      {vencidas.length > 0 && (
        <div className="qa-alert qa-alert-red">
          <IconAlertTriangle size={18} />
          <div>
            <strong style={{ display: "block", marginBottom: 2 }}>
              {vencidas.length} assinatura{vencidas.length !== 1 ? "s" : ""} vencida{vencidas.length !== 1 ? "s" : ""}
            </strong>
            <span style={{ opacity: 0.85 }}>
              {vencidas.map((c) => `${c.nome} (venceu ${fmtData(new Date(c.assinaturaVenceEm!))})`).join(" · ")}
            </span>
          </div>
        </div>
      )}

      <p style={{ margin: "0 0 10px", fontSize: 11.5, fontWeight: 700, color: "var(--qa-gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Assinantes
      </p>
      <div className="qa-stat-grid">
        <div className="qa-stat-card">
          <p className="qa-stat-label"><IconUsers size={14} /> Clientes pagos</p>
          <strong className="qa-stat-value" style={{ color: "#6ee7b7" }}>{pagantes.length}</strong>
        </div>
        <div className="qa-stat-card">
          <p className="qa-stat-label"><IconUsers size={14} /> Clientes gratuitos</p>
          <strong className="qa-stat-value" style={{ color: "#7dc4ff" }}>{gratuitos.length}</strong>
        </div>
        <div className="qa-stat-card">
          <p className="qa-stat-label">Total de clientes</p>
          <strong className="qa-stat-value">{clientes.length}</strong>
        </div>
      </div>

      <p style={{ margin: "0 0 10px", fontSize: 11.5, fontWeight: 700, color: "var(--qa-gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Receita
      </p>
      <div className="qa-stat-grid">
        <div className="qa-stat-card">
          <p className="qa-stat-label"><IconWallet size={14} /> MRR (receita mensal)</p>
          <strong className="qa-stat-value">{fmt(mrr)}</strong>
          <p className="qa-stat-caption">{pagantes.length} × {fmt(PRECO_MENSAL)}</p>
        </div>
        <div className="qa-stat-card">
          <p className="qa-stat-label">Receita total estimada</p>
          <strong className="qa-stat-value">{fmt(receitaTotal)}</strong>
          <p className="qa-stat-caption">acumulado histórico</p>
        </div>
        <div className="qa-stat-card">
          <p className="qa-stat-label">Planos gerados</p>
          <strong className="qa-stat-value">{totalPlanos}</strong>
        </div>
      </div>

      <p style={{ margin: "0 0 10px", fontSize: 11.5, fontWeight: 700, color: "var(--qa-gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Operação
      </p>
      <div className="qa-stat-grid">
        <div className="qa-stat-card">
          <p className="qa-stat-label">Gasto IA este mês</p>
          <strong className="qa-stat-value" style={{ color: custoIABRL > 0 ? "#fca5a5" : "var(--qa-gray-500)" }}>
            {custoIABRL > 0 ? fmt(custoIABRL) : "R$ 0,00"}
          </strong>
          <p className="qa-stat-caption">pagantes {fmt(custoIAPagantesBRL)} · gratuitos {fmt(custoIAGratuitosBRL)}</p>
        </div>
        <div className="qa-stat-card">
          <p className="qa-stat-label"><IconTrendUp size={14} /> Lucro estimado/mês</p>
          <strong className="qa-stat-value" style={{ color: lucroEstimado >= 0 ? "#6ee7b7" : "#fca5a5" }}>
            {fmt(lucroEstimado)}
          </strong>
          <p className="qa-stat-caption">MRR − custo IA real</p>
        </div>
        <div className="qa-stat-card">
          <p className="qa-stat-label">Assinaturas em risco</p>
          <strong className="qa-stat-value" style={{ color: vencidas.length > 0 ? "#fca5a5" : vencendoEm7.length > 0 ? "#fcd34d" : "#6ee7b7" }}>
            {vencidas.length + vencendoEm7.length}
          </strong>
          <p className="qa-stat-caption">{vencidas.length} vencida{vencidas.length !== 1 ? "s" : ""} · {vencendoEm7.length} vencendo</p>
        </div>
      </div>

      <div className="qa-card" style={{ marginTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Clientes recentes</h2>
          <Link href="/clientes" style={{ color: "#7dc4ff", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
            Ver todos <IconArrowUpRight size={13} />
          </Link>
        </div>
        {clientes.length === 0 ? (
          <p className="qa-empty">Nenhum cliente cadastrado ainda.</p>
        ) : (
          <div>
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
                <Link key={c.id} href={`/clientes/${c.id}`} className="qa-list-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ display: "block", fontSize: 14 }}>{c.nome}</strong>
                    <span style={{ fontSize: 12, color: "var(--qa-gray-500)" }}>
                      desde {fmtData(c.criadoEm)}
                      {c._count.planosEnviados > 0 && ` · ${c._count.planosEnviados} plano${c._count.planosEnviados !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {isGratuito ? (
                      <span className="qa-badge qa-badge-blue">Gratuito</span>
                    ) : statusVenc === "vencido" ? (
                      <span className="qa-badge qa-badge-red"><IconAlertTriangle size={11} /> Vencida</span>
                    ) : statusVenc === "urgente" ? (
                      <span className="qa-badge qa-badge-amber">{diasParaVencer}d</span>
                    ) : statusVenc === "ok" ? (
                      <span className="qa-badge qa-badge-emerald"><IconCheckCircle size={11} /> {fmtData(vence!)}</span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--qa-gray-500)" }}>{fmt(PRECO_MENSAL)}/mês</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 20 }}>
        <Link href="/exportar" style={{ color: "var(--qa-gray-400)", fontSize: 13.5, fontWeight: 600 }}>Exportar dados</Link>
        <Link href="/" style={{ color: "#7dc4ff", fontSize: 13.5, fontWeight: 600 }}>Página de vendas</Link>
      </div>
    </div>
  );
}
