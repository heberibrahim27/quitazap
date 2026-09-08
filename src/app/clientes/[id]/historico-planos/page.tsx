import { redirect } from "next/navigation";

// Rota desativada: painel admin não exibe mais histórico de planos de
// quitação (dívidas) de clientes — decisão de produto: o admin não deve
// ver/gerenciar dívidas de clientes. Isso é 100% self-service do
// cliente em /minha-conta.
export default async function HistoricoPlanosDesativado({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/clientes/${id}`);
}
