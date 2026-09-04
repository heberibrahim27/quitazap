import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { IconAlertTriangle, IconCheckCircle } from "@/components/icons";

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
      // Divida/Parcela é tabela compartilhada com o Controle (app do
      // cliente final) — uma Divida criada por lá via "Novo empréstimo"
      // (src/app/minha-conta/(protegido)/emprestimos/novo/) sempre define
      // totalParcelas e gera N parcelas de valor idêntico; uma dívida
      // negociada aqui no admin nunca preenche esse campo. Sem esse
      // filtro, empréstimo pessoal que o cliente cadastrou pra
      // acompanhar sozinho aparecia como se fosse dívida em cobrança do
      // negócio — inclusive com botão de cobrança por WhatsApp.
      divida: { totalParcelas: null },
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
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Parcelas vencidas</h1>
          <p className="qa-page-subtitle">
            {parcelas.length} parcela{parcelas.length !== 1 ? "s" : ""} em atraso
            em {grupos.length} cliente{grupos.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/painel" className="qa-btn-secondary">← Dashboard</Link>
      </div>

      {/* Resumo */}
      {parcelas.length > 0 && (
        <div className="qa-stat-grid">
          <div className="qa-stat-card">
            <p className="qa-stat-label">Total em atraso</p>
            <strong className="qa-stat-value" style={{ color: "#fca5a5" }}>{fmt(totalValor)}</strong>
          </div>
          <div className="qa-stat-card">
            <p className="qa-stat-label">Parcelas</p>
            <strong className="qa-stat-value" style={{ color: "#fdba74" }}>{parcelas.length}</strong>
          </div>
          <div className="qa-stat-card">
            <p className="qa-stat-label">Clientes com atraso</p>
            <strong className="qa-stat-value" style={{ color: "#fcd34d" }}>{grupos.length}</strong>
          </div>
        </div>
      )}

      {parcelas.length === 0 ? (
        <div className="qa-card" style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "#6ee7b7" }}>
            <IconCheckCircle size={40} />
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 600 }}>
            Nenhuma parcela vencida!
          </p>
          <p style={{ margin: 0, color: "var(--qa-gray-400)" }}>Todos os clientes estão em dia.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {grupos.map(({ cliente, parcelas: ps, total }) => (
            <div key={cliente.id} className="qa-card">
              {/* Cabeçalho do cliente */}
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap",
              }}>
                <div>
                  <Link href={`/clientes/${cliente.id}`} style={{ fontWeight: 700, fontSize: 15.5 }}>
                    {cliente.nome}
                  </Link>
                  <span style={{ display: "block", fontSize: 13, color: "var(--qa-gray-400)", marginTop: 2 }}>
                    {cliente.telefone} · {ps.length} parcela{ps.length !== 1 ? "s" : ""} vencida{ps.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong style={{ color: "#fca5a5", fontSize: 15 }}>{fmt(total)}</strong>
                  <Link href={`/clientes/${cliente.id}/pagamento/novo`} className="qa-btn-secondary" style={{ padding: "7px 14px", fontSize: 13 }}>
                    Registrar pagamento
                  </Link>
                  <a
                    href={`https://api.whatsapp.com/send?phone=55${cliente.telefone.replace(/\D/g, "")}&text=${encodeURIComponent(`Olá ${cliente.nome}, passando para lembrar sobre sua(s) parcela(s) em atraso. Podemos conversar?`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="qa-btn-secondary"
                    style={{ padding: "7px 14px", fontSize: 13 }}
                  >
                    WhatsApp
                  </a>
                </div>
              </div>

              {/* Parcelas do cliente */}
              <div style={{ display: "grid", gap: 6 }}>
                {ps.map((p) => {
                  const atraso = diasAtraso(p.vencimento);
                  const cor = atraso > 30 ? "#fca5a5" : atraso > 7 ? "#fdba74" : "#fcd34d";
                  return (
                    <div key={p.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "9px 12px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
                      borderRadius: 10, gap: 12, flexWrap: "wrap",
                    }}>
                      <span style={{ fontSize: 13, color: "var(--qa-gray-400)" }}>
                        {p.divida.credor} · Parcela {p.numero}
                      </span>
                      <span style={{ fontSize: 13, color: "var(--qa-gray-400)" }}>
                        venceu em {fmtData(p.vencimento)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cor, display: "flex", alignItems: "center", gap: 4 }}>
                        <IconAlertTriangle size={12} /> {atraso}d de atraso
                      </span>
                      <strong style={{ fontSize: 14 }}>
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
    </div>
  );
}
