import { redirect } from "next/navigation";

// Rota desativada: painel admin não gerencia mais dívidas/parcelamento
// de clientes (isso agora é 100% self-service do cliente em /minha-conta).
export default async function ParcelarDesativada({
  params,
}: {
  params: Promise<{ id: string; dividaId: string }>;
}) {
  const { id } = await params;
  redirect(`/clientes/${id}`);
}
