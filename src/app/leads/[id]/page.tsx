import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calcularStatusLead, LABELS_STATUS_LEAD, COR_STATUS_LEAD } from "@/lib/lead-vendas-status";

function fmtData(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

const LABELS_ETAPA: Record<string, string> = {
  QUALIFICACAO: "Qualificação",
  PROVA: "Prova/demonstração",
  OFERTA: "Oferta enviada",
  FOLLOWUP: "Follow-up automático",
  CONVERTIDO: "Convertido",
  DESISTIU: "Desistiu",
};

const LABELS_ANGULO: Record<string, string> = {
  PRECO: "Preço",
  CONFIANCA: "Confiança/segurança",
  CANCELAMENTO: "Cancelamento/fidelidade",
  CONCORRENTE: "Concorrente/planilha",
  ADIAR: "Vou pensar",
};

// Histórico completo do atendimento do bot de vendas pra um lead (pedido
// do Ibrahim: acompanhar depois o que aconteceu em cada conversa). Lê
// MensagemLeadVendas — uma linha por mensagem, nunca sobrescrita — em
// ordem cronológica, estilo transcrição de chat.
export default async function LeadDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const lead = await prisma.leadVendas.findUnique({
    where: { id },
    include: {
      mensagens: { orderBy: { criadoEm: "asc" } },
    },
  });

  if (!lead) notFound();

  const status = calcularStatusLead(lead);
  const cor = COR_STATUS_LEAD[status];
  const angulos = lead.angulosUsados ? lead.angulosUsados.split(",").filter(Boolean) : [];

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <h1 className="qa-page-title" style={{ margin: 0 }}>{lead.nome || lead.telefone}</h1>
            <span className="qa-badge" style={{ background: cor.bg, color: cor.color, border: `1px solid ${cor.border}` }}>
              {LABELS_STATUS_LEAD[status]}
            </span>
          </div>
          <p className="qa-page-subtitle" style={{ marginBottom: 2 }}>{lead.telefone}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--qa-gray-500)" }}>
            no funil desde {fmtData(lead.criadoEm)} · última atividade {fmtData(lead.atualizadoEm)}
          </p>
        </div>

        <Link href="/leads" className="qa-btn-secondary">Voltar</Link>
      </div>

      {/* ── Dados do atendimento ── */}
      <div className="qa-card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Dados do atendimento</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 18 }}>
          <div>
            <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Etapa atual do funil</span>
            <strong style={{ fontSize: 14 }}>{LABELS_ETAPA[lead.etapa] ?? lead.etapa}</strong>
          </div>

          <div>
            <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Tentativas de objeção</span>
            <strong style={{ fontSize: 14 }}>{lead.tentativasObjecao}</strong>
          </div>

          <div>
            <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Cupom enviado</span>
            <strong style={{ fontSize: 14 }}>{lead.cupomEnviado ? "Sim" : "Não"}</strong>
          </div>

          {lead.motivoDesistencia && (
            <div>
              <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Motivo da desistência</span>
              <strong style={{ fontSize: 14 }}>
                {lead.motivoDesistencia === "OPTOUT" ? "Pediu pra parar" : lead.motivoDesistencia === "RECUSOU" ? "Recusou de início" : "Esgotou as objeções sem aceitar"}
              </strong>
            </div>
          )}

          {angulos.length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span className="qa-label" style={{ display: "block", marginBottom: 6 }}>Objeções já usadas com esse lead</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {angulos.map((a, i) => (
                  <span key={`${a}-${i}`} className="qa-badge">{LABELS_ANGULO[a] ?? a}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Histórico da conversa ── */}
      <div className="qa-card">
        <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Histórico da conversa</h2>

        {lead.mensagens.length === 0 ? (
          <p style={{ margin: 0, color: "var(--qa-gray-400)", fontSize: 14 }}>
            Nenhuma mensagem registrada ainda pra este lead.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lead.mensagens.map((m) => {
              const doBot = m.direcao === "BOT";
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: doBot ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "72%",
                      background: doBot ? "var(--qa-blue-soft)" : "var(--qa-glass-strong)",
                      border: `1px solid ${doBot ? "var(--qa-blue-glow)" : "var(--qa-line)"}`,
                      borderRadius: 14,
                      padding: "10px 14px",
                      fontSize: 14,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {m.texto}
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--qa-gray-500)", marginTop: 3, padding: "0 2px" }}>
                    {doBot ? "Bot" : lead.nome || "Lead"} · {fmtData(m.criadoEm)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
