import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AlertaBanner } from "@/components/AlertaBanner";
import { IconPlus, IconArrowUpRight } from "@/components/icons";

const STATUS_ATEND: Record<string, { label: string; bg: string; color: string; border: string }> = {
  NOVO:                   { label: "Novo",            bg: "rgba(0,123,255,0.12)",   color: "#7dc4ff", border: "rgba(0,123,255,0.3)" },
  AGUARDANDO_INFORMACOES: { label: "Aguardando info", bg: "rgba(245,158,11,0.12)",  color: "#fcd34d", border: "rgba(245,158,11,0.25)" },
  PLANO_GERADO:           { label: "Plano gerado",    bg: "rgba(167,139,250,0.12)", color: "#c4b5fd", border: "rgba(167,139,250,0.3)" },
  ACOMPANHAMENTO:         { label: "Acompanhamento",  bg: "rgba(16,185,129,0.12)",  color: "#6ee7b7", border: "rgba(16,185,129,0.25)" },
  ENCERRADO:              { label: "Encerrado",       bg: "rgba(255,255,255,0.06)", color: "#9ca3af", border: "rgba(255,255,255,0.12)" },
};

function fmtData(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
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
    select: {
      id:               true,
      nome:             true,
      telefone:         true,
      statusAtendimento: true,
      criadoEm:         true,
      gratuito:         true,
      _count:           { select: { planosEnviados: true } },
    },
  });

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Clientes</h1>
          <p className="qa-page-subtitle">
            {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}
            {q || status ? " encontrado" + (clientes.length !== 1 ? "s" : "") : " cadastrado" + (clientes.length !== 1 ? "s" : "")}
          </p>
        </div>
        <Link href="/clientes/novo" className="qa-btn-primary"><IconPlus size={15} /> Novo cliente</Link>
      </div>

      {ok === "criado" && <AlertaBanner tipo="sucesso" mensagem="Cliente cadastrado com sucesso!" />}

      {/* Barra de busca + filtro */}
      <form method="GET" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou telefone…"
          className="qa-input"
          style={{ flex: 1, minWidth: 200 }}
        />
        <select name="status" defaultValue={status} className="qa-input" style={{ minWidth: 190, flex: "0 0 auto" }}>
          <option value="">Todos os status</option>
          <option value="NOVO">Novo</option>
          <option value="AGUARDANDO_INFORMACOES">Aguardando informações</option>
          <option value="PLANO_GERADO">Plano gerado</option>
          <option value="ACOMPANHAMENTO">Acompanhamento</option>
          <option value="ENCERRADO">Encerrado</option>
        </select>
        <button type="submit" className="qa-btn-secondary">Filtrar</button>
        {(q || status) && (
          <Link href="/clientes" className="qa-btn-secondary">Limpar</Link>
        )}
      </form>

      <div className="qa-card">
        {clientes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600 }}>
              {q || status ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
            </p>
            <p style={{ margin: "0 0 24px", color: "var(--qa-gray-400)" }}>
              {q || status
                ? "Tente outros termos ou limpe os filtros."
                : "Clique em Novo cliente para cadastrar o primeiro atendimento."}
            </p>
            {!q && !status && (
              <Link href="/clientes/novo" className="qa-btn-primary" style={{ display: "inline-flex" }}><IconPlus size={15} /> Novo cliente</Link>
            )}
          </div>
        ) : (
          <div>
            {clientes.map((cliente) => {
              const s = STATUS_ATEND[cliente.statusAtendimento] ?? STATUS_ATEND["NOVO"];
              const planos = cliente._count.planosEnviados;
              const isGratuito = (cliente as { gratuito?: boolean }).gratuito;

              return (
                <Link key={cliente.id} href={`/clientes/${cliente.id}`} className="qa-list-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <strong style={{ fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cliente.nome}
                      </strong>
                      {isGratuito && <span className="qa-badge qa-badge-blue">Gratuito</span>}
                      <span className="qa-badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                        {s.label}
                      </span>
                    </div>
                    <span style={{ display: "block", color: "var(--qa-gray-400)", fontSize: 13 }}>
                      {cliente.telefone}
                    </span>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {planos > 0 ? (
                      <strong style={{ display: "block", color: "#c4b5fd", fontSize: 13 }}>
                        {planos} plano{planos !== 1 ? "s" : ""}
                      </strong>
                    ) : (
                      <strong style={{ display: "block", color: "var(--qa-gray-500)", fontSize: 13, fontWeight: 500 }}>
                        Sem plano
                      </strong>
                    )}
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
