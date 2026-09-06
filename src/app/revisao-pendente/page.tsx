import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { IconCheckCircle } from "@/components/icons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtData(d: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

// Fila do rescue parser (ai-bot.ts): mensagens financeiras que nem o fluxo
// determinístico nem o interpretador de IA (financeiro-intent-resolver.ts)
// conseguiram entender depois de 2 pedidos de esclarecimento. De propósito
// SEM notificação automática (pedido do Ibrahim) — alguém da equipe passa
// aqui de vez em quando pra conferir se vale ensinar o interpretador a
// reconhecer esse padrão de mensagem.
export default async function RevisaoPendentePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const somenteAbertas = filtro !== "todas";

  const mensagens = await prisma.mensagemPendenteRevisao.findMany({
    where: somenteAbertas ? { resolvida: false } : undefined,
    orderBy: { criadoEm: "desc" },
    take: 200,
    include: { cliente: { select: { id: true, nome: true } } },
  });

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
            {mensagens.length} mensagem{mensagens.length !== 1 ? "ns" : ""} que o bot não conseguiu interpretar
            {somenteAbertas ? " (aberta" + (mensagens.length !== 1 ? "s" : "") + ")" : ""}.
          </p>
        </div>
        <Link href="/painel" className="qa-btn-secondary">← Dashboard</Link>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Link href="/revisao-pendente" className={somenteAbertas ? "qa-btn-primary" : "qa-btn-secondary"}>Abertas</Link>
        <Link href="/revisao-pendente?filtro=todas" className={!somenteAbertas ? "qa-btn-primary" : "qa-btn-secondary"}>Todas</Link>
      </div>

      {mensagens.length === 0 ? (
        <div className="qa-card" style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "#6ee7b7" }}>
            <IconCheckCircle size={40} />
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 600 }}>Nada pendente</p>
          <p style={{ margin: 0, color: "var(--qa-gray-400)" }}>
            Toda mensagem que o bot não entendeu depois de 3 tentativas cai aqui.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {mensagens.map((m) => (
            <div key={m.id} className="qa-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  {m.cliente ? (
                    <Link href={`/clientes/${m.cliente.id}`} style={{ fontWeight: 700, fontSize: 15 }}>{m.cliente.nome}</Link>
                  ) : (
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{m.nome || m.telefone || "Contato desconhecido"}</span>
                  )}
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--qa-gray-400)", marginTop: 2 }}>
                    {m.motivo} · {fmtData(m.criadoEm)}
                  </span>
                  <p style={{ margin: "10px 0 0", fontSize: 14, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 12px" }}>
                    “{m.mensagem}”
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
