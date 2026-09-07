import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AlertaBanner } from "@/components/AlertaBanner";
import { IconPlus, IconArrowUpRight } from "@/components/icons";
import { calcularStatusAssinatura, whereStatusAssinatura, LABEL_STATUS_ASSINATURA, COR_STATUS_ASSINATURA, type StatusAssinatura } from "@/lib/status-assinatura";

function fmtData(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function ehStatusAssinatura(v: string): v is StatusAssinatura {
  return v === "PAGO" || v === "CANCELADO" || v === "INATIVO";
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; ok?: string }>;
}) {
  const { q = "", status = "", ok } = await searchParams;
  const statusFiltro = ehStatusAssinatura(status) ? status : null;

  const clientes = await prisma.cliente.findMany({
    orderBy: { criadoEm: "desc" },
    where: {
      ...(statusFiltro ? whereStatusAssinatura(statusFiltro) : {}),
      ...(q
        ? {
            OR: [
              { nome:     { contains: q } },
              { telefone: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      nome: true,
      telefone: true,
      email: true,
      criadoEm: true,
      gratuito: true,
      assinaturaVenceEm: true,
      isTeste: true,
    },
  });

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Clientes</h1>
          <p className="qa-page-subtitle">
            {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}
            {q || statusFiltro ? " encontrado" + (clientes.length !== 1 ? "s" : "") : " cadastrado" + (clientes.length !== 1 ? "s" : "")}
          </p>
        </div>
        <Link href="/clientes/novo" className="qa-btn-primary"><IconPlus size={15} /> Novo cliente</Link>
      </div>

      {ok === "criado" && <AlertaBanner tipo="sucesso" mensagem="Cliente cadastrado com sucesso!" />}

      {/* Barra de busca + filtro por status de assinatura */}
      <form method="GET" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou telefone…"
          className="qa-input"
          style={{ flex: 1, minWidth: 200 }}
        />
        <select name="status" defaultValue={statusFiltro ?? ""} className="qa-input" style={{ minWidth: 190, flex: "0 0 auto" }}>
          <option value="">Todos os status</option>
          <option value="PAGO">Pago</option>
          <option value="CANCELADO">Cancelado</option>
          <option value="INATIVO">Inativo</option>
        </select>
        <button type="submit" className="qa-btn-secondary">Filtrar</button>
        {(q || statusFiltro) && (
          <Link href="/clientes" className="qa-btn-secondary">Limpar</Link>
        )}
      </form>

      <div className="qa-card">
        {clientes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600 }}>
              {q || statusFiltro ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
            </p>
            <p style={{ margin: "0 0 24px", color: "var(--qa-gray-400)" }}>
              {q || statusFiltro
                ? "Tente outros termos ou limpe os filtros."
                : "Clique em Novo cliente para cadastrar o primeiro atendimento."}
            </p>
            {!q && !statusFiltro && (
              <Link href="/clientes/novo" className="qa-btn-primary" style={{ display: "inline-flex" }}><IconPlus size={15} /> Novo cliente</Link>
            )}
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
                      <strong style={{ fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cliente.nome}
                      </strong>
                      <span className="qa-badge" style={{ background: cor.bg, color: cor.color, border: `1px solid ${cor.border}` }}>
                        {LABEL_STATUS_ASSINATURA[status]}
                      </span>
                      {cliente.isTeste && (
                        <span className="qa-badge" style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.12)" }}>
                          Teste — não conta nas métricas
                        </span>
                      )}
                    </div>
                    <span style={{ display: "block", color: "var(--qa-gray-400)", fontSize: 13 }}>
                      {cliente.telefone}
                    </span>
                    {cliente.email && (
                      <span style={{ display: "block", color: "var(--qa-gray-500)", fontSize: 12.5 }}>
                        {cliente.email}
                      </span>
                    )}
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <strong style={{ display: "block", color: "var(--qa-gray-500)", fontSize: 13, fontWeight: 500 }}>
                      {cliente.assinaturaVenceEm ? `${status === "CANCELADO" ? "venceu" : "vence"} ${fmtData(cliente.assinaturaVenceEm)}` : "-"}
                    </strong>
                    <span style={{ fontSize: 12, color: "var(--qa-gray-500)" }}>
                      desde {fmtData(cliente.criadoEm)}
                    </span>
                  </div>

                  <IconArrowUpRight size={14} style={{ transform: "rotate(45deg)", color: "var(--qa-gray-500)", flexShrink: 0 }} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
