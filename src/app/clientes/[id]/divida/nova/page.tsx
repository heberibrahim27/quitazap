import { redirect } from "next/navigation";

// Rota desativada: o painel admin não gerencia mais dívidas de clientes.
// A dívida é 100% cadastrada e controlada pelo próprio cliente em
// /minha-conta — decisão de produto (não é o admin quem decide o que
// entra/sai da dívida de alguém). Mantido como redirect, em vez de
// apagar o arquivo, pra não quebrar link antigo salvo em algum lugar.
export default async function NovaDividaDesativada({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/clientes/${id}`);
}
