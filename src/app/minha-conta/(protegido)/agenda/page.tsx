import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { NovaTarefaForm } from "./NovaTarefaForm";
import { TarefaItem } from "./TarefaItem";

function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// yyyy-mm-dd no fuso de Brasília — valor inicial do <input type="date"> na edição.
function dataInput(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(d));
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
    revalidatePath("/minha-conta/agenda");
    revalidatePath("/minha-conta");
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="4" /><path d="M3 9.5h18" /><path d="M8 3v3M16 3v3" /><circle cx="9" cy="14" r="1.15" fill="currentColor" stroke="none" /><circle cx="15" cy="14" r="1.15" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.15" fill="currentColor" stroke="none" /></svg>
          </span>
          <span className="title-label">Agenda</span>
        </p>
      </div>

      <div className="mc-tabs">
        <Link href="/minha-conta/agenda?aba=pendentes" className={`mc-tab ${aba === "pendentes" ? "active" : ""}`}>Pendentes</Link>
        <Link href="/minha-conta/agenda?aba=concluidas" className={`mc-tab ${aba === "concluidas" ? "active" : ""}`}>Concluídas</Link>
      </div>

      <NovaTarefaForm />

      <div className="mc-card">
        {tarefas.length === 0 ? (
          <p className="mc-empty">
            {aba === "pendentes" ? "Nenhuma tarefa pendente." : "Nenhuma tarefa concluída ainda."}
          </p>
        ) : (
          <div className="mc-list">
            {tarefas.map((t) => (
              <TarefaItem
                key={t.id}
                pendente={aba === "pendentes"}
                concluirAction={concluirTarefa}
                tarefa={{
                  id: t.id,
                  descricao: t.descricao,
                  valor: t.valor,
                  vencimentoFmt: t.vencimento ? fmtData(t.vencimento) : null,
                  vencimentoInput: t.vencimento ? dataInput(t.vencimento) : "",
                  recorrente: t.recorrente,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
