import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { IconCheckCircle, IconAlertTriangle } from "@/components/icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtData(d: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

const LABEL_CATEGORIA: Record<string, string> = {
  CANCELAMENTO: "Cancelamento",
  ERRO_COBRANCA: "Erro de cobrança",
  RECLAMACAO_GRAVE: "Reclamação grave",
  PEDIR_HUMANO: "Pediu falar com humano",
};

type Aba = "critica" | "monitoramento";

// Fila do rescue parser (ai-bot.ts). Reescrita (Ibrahim, 2026-09-06,
// "pensa em 10 mil clientes tendo que olhar manualmente"): o bot agora
// SEMPRE resolve algo pro cliente na hora — nunca fica esperando alguém
// olhar aqui. Esta tela virou duas coisas bem diferentes:
// - Crítica: cancelamento/reclamação grave/erro de cobrança/pedido de
//   humano — precisa de ação real de alguém da equipe, o cliente já
//   recebeu uma resposta na hora, mas o caso de fundo (ex: cancelar de
//   verdade, investigar uma cobrança) ainda precisa de gente.
// - Monitoramento: mensagem que o bot não entendeu e não é crítica — é só
//   dado pra melhorar o parser depois (vocabulário faltando etc.), nunca
//   uma tarefa pendente de ninguém. Sem notificação automática em nenhum
//   dos dois casos (pedido do Ibrahim).
export default async function RevisaoPendentePage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; filtro?: string }>;
}) {
  const { aba: abaBruta, filtro } = await searchParams;
  const aba: Aba = abaBruta === "monitoramento" ? "monitoramento" : "critica";
  const somenteAbertas = filtro !== "todas";

  const [mensagens, totalCriticasAbertas] = await Promise.all([
    prisma.mensagemPendenteRevisao.findMany({
      where: {
        criticidade: aba === "critica" ? "CRITICA" : "MONITORAMENTO",
        ...(somenteAbertas ? { resolvida: false } : {}),
      },
      orderBy: { criadoEm: "desc" },
      take: 200,
      include: { cliente: { select: { id: true, nome: true } } },
    }),
    prisma.mensagemPendenteRevisao.count({ where: { criticidade: "CRITICA", resolvida: false } }),
  ]);

  async function marcarResolvida(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    await prisma.mensagemPendenteRevisao.update({
      where: { id },
      data: { resolvida: true, resolvidaEm: new Date() },
    });
    revalidatePath("/revisao-pendente");
    redirect("/revisao-pendente");
  }

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Revisão pendente</h1>
          <p className="qa-page-subtitle">
            {aba === "critica"
              ? "Mensagens que precisam de ação real de alguém da equipe — o cliente já recebeu uma resposta na hora, mas o caso de fundo ainda depende de gente."
              : "Painel de monitoramento: mensagens que o bot não entendeu (e resolveu sozinho na hora). Não é uma fila de tarefas — use pra identificar padrão/vocabulário faltando."}
          </p>
        </div>
        <Link href="/painel" className="qa-btn-secondary">← Dashboard</Link>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Link href="/revisao-pendente" className={aba === "critica" ? "qa-btn-primary" : "qa-btn-secondary"}>
          <IconAlertTriangle size={14} /> Crítica{totalCriticasAbertas > 0 ? ` (${totalCriticasAbertas})` : ""}
        </Link>
        <Link href="/revisao-pendente?aba=monitoramento" className={aba === "monitoramento" ? "qa-btn-primary" : "qa-btn-secondary"}>
          Monitoramento
        </Link>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Link href={`/revisao-pendente?aba=${aba}`} className={somenteAbertas ? "qa-btn-primary" : "qa-btn-secondary"}>
          Abertas
        </Link>
        <Link href={`/revisao-pendente?aba=${aba}&filtro=todas`} className={!somenteAbertas ? "qa-btn-primary" : "qa-btn-secondary"}>
          Todas
        </Link>
      </div>

      {mensagens.length === 0 ? (
        <div className="qa-card" style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "#6ee7b7" }}>
            <IconCheckCircle size={40} />
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 600 }}>
            {aba === "critica" ? "Nada crítico pendente" : "Nada no monitoramento"}
          </p>
          <p style={{ margin: 0, color: "var(--qa-gray-400)" }}>
            {aba === "critica"
              ? "Cancelamento, reclamação grave, erro de cobrança ou pedido de humano cai aqui."
              : "Mensagem que o bot não entendeu (mas já resolveu sozinho pro cliente) cai aqui."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {mensagens.map((m) => (
            <div key={m.id} className="qa-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {m.cliente ? (
                      <Link href={`/clientes/${m.cliente.id}`} style={{ fontWeight: 700, fontSize: 15 }}>{m.cliente.nome}</Link>
                    ) : (
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{m.nome || m.telefone || "Contato desconhecido"}</span>
                    )}
                    {m.categoria && (
                      <span className="qa-badge" style={{ background: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}>
                        {LABEL_CATEGORIA[m.categoria] ?? m.categoria}
                      </span>
                    )}
                  </div>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--qa-gray-400)", marginTop: 2 }}>
                    {m.motivo} · {fmtData(m.criadoEm)}
                  </span>
                  <p style={{ margin: "10px 0 0", fontSize: 14, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 12px" }}>
                    "{m.mensagem}"
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <span className="qa-badge">{m.resolvida ? "Resolvida" : "Pendente"}</span>
                  {!m.resolvida && (
                    <form action={marcarResolvida}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="qa-btn-secondary">Marcar resolvida</button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
