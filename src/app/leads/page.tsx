import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { IconArrowUpRight } from "@/components/icons";
import { calcularStatusLead, LABELS_STATUS_LEAD, COR_STATUS_LEAD, type StatusLead } from "@/lib/lead-vendas-status";

function fmtData(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function ehStatusLead(v: string): v is StatusLead {
  return v in LABELS_STATUS_LEAD;
}

// Painel pedido pelo Ibrahim: atendimento do bot de vendas por lead, com
// status derivado (ver lead-vendas-status.ts) e filtro por status. A
// tabela de leads tende a ser pequena (funil de vendas, não a base de
// clientes inteira) — busca tudo e filtra em memória, já que o status é
// calculado (não dá pra expressar "parou há mais de 24h" direto num
// `where` do Prisma pra todos os casos sem duplicar a regra em SQL).
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q = "", status = "" } = await searchParams;
  const statusFiltro = ehStatusLead(status) ? status : null;

  const leadsRaw = await prisma.leadVendas.findMany({
    orderBy: { atualizadoEm: "desc" },
    where: q
      ? {
          OR: [
            { nome: { contains: q } },
            { telefone: { contains: q } },
          ],
        }
      : undefined,
    select: {
      id: true,
      nome: true,
      telefone: true,
      etapa: true,
      motivoDesistencia: true,
      angulosUsados: true,
      tentativasObjecao: true,
      criadoEm: true,
      atualizadoEm: true,
    },
  });

  const leads = leadsRaw
    .map((lead) => ({ ...lead, status: calcularStatusLead(lead) }))
    .filter((lead) => !statusFiltro || lead.status === statusFiltro);

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Leads (funil de vendas)</h1>
          <p className="qa-page-subtitle">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
            {q || statusFiltro ? " encontrado" + (leads.length !== 1 ? "s" : "") : " no funil"}
          </p>
        </div>
      </div>

      <form method="GET" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou telefone…"
          className="qa-input"
          style={{ flex: 1, minWidth: 200 }}
        />
        <select name="status" defaultValue={statusFiltro ?? ""} className="qa-input" style={{ minWidth: 210, flex: "0 0 auto" }}>
          <option value="">Todos os status</option>
          {(Object.keys(LABELS_STATUS_LEAD) as StatusLead[]).map((s) => (
            <option key={s} value={s}>{LABELS_STATUS_LEAD[s]}</option>
          ))}
        </select>
        <button type="submit" className="qa-btn-secondary">Filtrar</button>
        {(q || statusFiltro) && (
          <Link href="/leads" className="qa-btn-secondary">Limpar</Link>
        )}
      </form>

      <div className="qa-card">
        {leads.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600 }}>
              {q || statusFiltro ? "Nenhum lead encontrado" : "Nenhum lead ainda"}
            </p>
            <p style={{ margin: 0, color: "var(--qa-gray-400)" }}>
              {q || statusFiltro
                ? "Tente outros termos ou limpe os filtros."
                : "Leads aparecem aqui assim que alguém interage com o bot de vendas."}
            </p>
          </div>
        ) : (
          <div>
            {leads.map((lead) => {
              const cor = COR_STATUS_LEAD[lead.status];
              return (
                <Link key={lead.id} href={`/leads/${lead.id}`} className="qa-list-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <strong style={{ fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {lead.nome || lead.telefone}
                      </strong>
                      <span className="qa-badge" style={{ background: cor.bg, color: cor.color, border: `1px solid ${cor.border}` }}>
                        {LABELS_STATUS_LEAD[lead.status]}
                      </span>
                    </div>
                    <span style={{ display: "block", color: "var(--qa-gray-400)", fontSize: 13 }}>
                      {lead.telefone}
                    </span>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <strong style={{ display: "block", color: "var(--qa-gray-500)", fontSize: 13, fontWeight: 500 }}>
                      última msg {fmtData(lead.atualizadoEm)}
                    </strong>
                    <span style={{ fontSize: 12, color: "var(--qa-gray-500)" }}>
                      no funil desde {fmtData(lead.criadoEm)}
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
