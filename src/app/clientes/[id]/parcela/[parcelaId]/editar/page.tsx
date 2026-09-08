import { redirect } from "next/navigation";

// Rota desativada: painel admin não edita mais parcelas de dívida de
// clientes (isso agora é 100% self-service do cliente em /minha-conta).
export default async function EditarParcelaDesativada({
  params,
}: {
  params: Promise<{ id: string; parcelaId: string }>;
}) {
  const { id } = await params;
  redirect(`/clientes/${id}`);
}
