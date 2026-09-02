import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const ABAS = ["pendentes", "concluidas"] as const;
type Aba = (typeof ABAS)[number];

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string | string[] }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { aba: abaParamBruto } = await searchParams;
  const abaParam = Array.isArray(abaParamBruto) ? abaParamBruto[0] : abaParamBruto;
  const aba: Aba = ABAS.includes(abaParam as Aba) ? (abaParam as Aba) : "pendentes";

  async function concluirTarefa(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const id = String(formData.get("id") || "");
    const tarefa = await prisma.tarefa.findUnique({ where: { id } });
    if (!tarefa || tarefa.clienteId !== clienteAtual.id) redirect("/minha-conta/agenda");

    await prisma.tarefa.update({
      where: { id },
      data: { status: "CONCLUIDA", concluidaEm: new Date() },
    });
    redirect("/minha-conta/agenda");
  }

  const tarefas = await prisma.tarefa.findMany({
    where: { clienteId: cliente.id, status: aba === "pendentes" ? "PENDENTE" : "CONCLUIDA" },
    orderBy: aba === "pendentes" ? [{ vencimento: "asc" }, { criadoEm: "asc" }] : [{ concluidaEm: "desc" }],
  });

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18" /><path d="M8 3v3M16 3v3" /></svg>
          </span>
          <span className="title-label">Agenda</span>
        </p>
      </div>

      <div className="mc-tabs">
        <Link href="/minha-conta/agenda?aba=pendentes" className={`mc-tab ${aba === "pendentes" ? "active" : ""}`}>Pendentes</Link>
        <Link href="/minha-conta/agenda?aba=concluidas" className={`mc-tab ${aba === "concluidas" ? "active" : ""}`}>Concluídas</Link>
      </div>

      <div className="mc-card">
        {tarefas.length === 0 ? (
          <p className="mc-empty">
            {aba === "pendentes" ? "Nenhuma tarefa pendente." : "Nenhuma tarefa concluída ainda."}
          </p>
        ) : (
          <div className="mc-list">
            {tarefas.map((t) => (
              <div key={t.id} className="mc-list-row">
                <div className="mc-list-body">
                  <div className="mc-list-desc">{t.descricao}{t.recorrente ? " · recorrente" : ""}</div>
                  <div className="mc-list-meta">{t.vencimento ? fmtData(t.vencimento) : "Sem data marcada"}</div>
                </div>
                <div className="mc-list-side" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div>
                    <div className="mc-list-value">{t.valor != null ? fmtValor(t.valor) : ""}</div>
                  </div>
                  {aba === "pendentes" && (
                    <form action={concluirTarefa}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        style={{
                          background: "var(--green-soft)",
                          color: "var(--green)",
                          border: "1px solid rgba(23,166,90,0.3)",
                          borderRadius: 999,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Concluir
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
