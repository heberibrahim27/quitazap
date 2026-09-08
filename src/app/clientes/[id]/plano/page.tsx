import { redirect } from "next/navigation";

// Rota desativada: painel admin não gera mais plano de quitação a
// partir das dívidas do cliente — decisão de produto: o admin não deve
// ver/gerenciar dívidas de clientes. Isso é 100% self-service do
// cliente em /minha-conta.
export default async function PlanoDesativado({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/clientes/${id}`);
}
