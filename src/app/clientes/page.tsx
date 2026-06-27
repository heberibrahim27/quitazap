import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AlertaBanner } from "@/components/AlertaBanner";

const STATUS_ATEND: Record<string, { label: string; bg: string; color: string }> = {
  NOVO:                   { label: "Novo",            bg: "#dbeafe", color: "#1e40af" },
  AGUARDANDO_INFORMACOES: { label: "Aguardando info", bg: "#fef9c3", color: "#854d0e" },
  PLANO_GERADO:           { label: "Plano gerado",    bg: "#f3e8ff", color: "#6b21a8" },
  ACOMPANHAMENTO:         { label: "Acompanhamento",  bg: "#dcfce7", color: "#166534" },
  ENCERRADO:              { label: "Encerrado",       bg: "#f1f5f9", color: "#475569" },
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; ok?: string }>;
}) {
  const { q = "", status = "", ok } = await searchParams;

  const clientes = await prisma.cliente.findMany({
    orderBy: { criadoEm: "desc" },
    where: {
      ...(status ? { statusAtendimento: status } : {}),
      ...(q
        ? {
            OR: [
              { nome:     { contains: q } },
              { telefone: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      dividas: { select: { id: true, valorTotal: true, valorPago: true, status: true } },
      _count:  { select: { planosEnviados: true } },
    },
  });

  return (
    <main className="page-shell">
      <section className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Clientes</h1>
            <p className="page-subtitle">
              {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}
              {q || status ? " encontrado" + (clientes.length !== 1 ? "s" : "") : " cadastrado" + (clientes.length !== 1 ? "s" : "")}
            </p>
          </div>
          <Link href="/clientes/novo" className="btn-primary">+ Novo cliente</Link>
        </div>

        {ok === "criado" && <AlertaBanner tipo="sucesso" mensagem="Cliente cadastrado com sucesso!" />}

        {/* Barra de busca + filtro */}
        <form method="GET" style={{
          display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap",
        }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome ou telefone…"
            style={{
              flex: 1, minWidth: 200,
              border: "1px solid #e2e8f0", borderRadius: 12,
              padding: "10px 14px", fontSize: 14, outline: "none",
              background: "#ffffff", color: "#0f172a",
            }}
          />
          <select
            name="status"
            defaultValue={status}
            style={{
              border: "1px solid #e2e8f0", borderRadius: 12,
              padding: "10px 14px", fontSize: 14, outline: "none",
              background: "#ffffff", color: "#0f172a", minWidth: 180,
            }}
          >
            <option value="">Todos os status</option>
            <option value="NOVO">🆕 Novo</option>
            <option value="AGUARDANDO_INFORMACOES">⏳ Aguardando informações</option>
            <option value="PLANO_GERADO">📋 Plano gerado</option>
            <option value="ACOMPANHAMENTO">🔄 Acompanhamento</option>
            <option value="ENCERRADO">✅ Encerrado</option>
          </select>
          <button type="submit" style={{
            background: "#0f172a", color: "#fff",
            border: "none", borderRadius: 12,
            padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            Filtrar
          </button>
          {(q || status) && (
            <Link href="/clientes" style={{
              border: "1px solid #e2e8f0", borderRadius: 12,
              padding: "10px 14px", fontSize: 14, fontWeight: 600,
              color: "#64748b", background: "#fff", whiteSpace: "nowrap",
            }}>
              Limpar
            </Link>
          )}
        </form>

        <div className="content-card">
          {clientes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <p style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                {q || status ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
              </p>
              <p style={{ margin: "0 0 24px", color: "#64748b" }}>
                {q || status
                  ? "Tente outros termos ou limpe os filtros."
                  : "Clique em Novo cliente para cadastrar o primeiro atendimento."}
              </p>
              {!q && !status && (
                <Link href="/clientes/novo" className="btn-primary">Novo cliente</Link>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {clientes.map((cliente) => {
                const dividasAtivas = cliente.dividas.filter((d) => d.status !== "QUITADA");
                const totalDevido   = dividasAtivas.reduce((t, d) => t + Number(d.valorTotal), 0);
                const totalPago     = cliente.dividas.reduce((t, d) => t + Number(d.valorPago), 0);
                const saldo         = Math.max(0, totalDevido - totalPago);
                const s             = STATUS_ATEND[cliente.statusAtendimento] ?? STATUS_ATEND["NOVO"];

                return (
                  <Link
                    key={cliente.id}
                    href={`/clientes/${cliente.id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "14px 16px",
                      border: "1px solid #e2e8f0",
                      borderRadius: 14,
                      background: "#ffffff",
                      gap: 16,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <strong style={{
                          color: "#0f172a", fontSize: 15,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {cliente.nome}
                        </strong>
                        <span style={{
                          background: s.bg, color: s.color,
                          padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                        }}>
                          {s.label}
                        </span>
                      </div>
                      <span style={{ display: "block", color: "#64748b", fontSize: 13 }}>
                        {cliente.telefone}
                        {cliente._count.planosEnviados > 0 && (
                          <span style={{ marginLeft: 8, color: "#94a3b8" }}>
                            · {cliente._count.planosEnviados} plano{cliente._count.planosEnviados !== 1 ? "s" : ""}
                          </span>
                        )}
                      </span>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {dividasAtivas.length > 0 ? (
                        <>
                          <strong style={{ display: "block", color: saldo > 0 ? "#dc2626" : "#16a34a", fontSize: 14 }}>
                            {fmt(saldo)}
                          </strong>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>
                            {dividasAtivas.length} dívida{dividasAtivas.length !== 1 ? "s" : ""}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 700 }}>✅ Quitado</span>
                      )}
                    </div>

                    <span style={{ color: "#94a3b8", fontSize: 18, flexShrink: 0 }}>›</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
