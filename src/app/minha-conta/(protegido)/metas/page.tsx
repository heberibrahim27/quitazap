import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { MetaCard, type MetaView } from "./MetaCard";
import { NovaMetaForm } from "./NovaMetaForm";

function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function MetasPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const metas = await prisma.meta.findMany({
    where: { clienteId: cliente.id },
    include: { depositos: { orderBy: { data: "desc" } } },
    orderBy: { criadoEm: "asc" },
  });

  const itens: MetaView[] = metas.map((m) => ({
    id: m.id,
    nome: m.nome,
    valorAlvo: m.valorAlvo,
    guardado: m.depositos.reduce((soma, d) => soma + d.valor, 0),
    depositos: m.depositos.map((d) => ({ id: d.id, valor: d.valor, dataFmt: fmtData(d.data) })),
  }));

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
          </span>
          <span className="title-label">Metas</span>
        </p>
      </div>

      <NovaMetaForm />

      {itens.length === 0 ? (
        <div className="mc-card">
          <p className="mc-empty">
            Nenhuma meta ainda. Toque em &ldquo;+ Adicionar meta&rdquo; pra começar um cofrinho (ex: &ldquo;Trocar de carro&rdquo;).
          </p>
        </div>
      ) : (
        itens.map((meta) => <MetaCard key={meta.id} meta={meta} />)
      )}
    </div>
  );
}
