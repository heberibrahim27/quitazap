import { redirect } from "next/navigation";

// Rota desativada: painel admin não exibe mais histórico de pagamentos
// de dívida de clientes (isso agora é 100% self-service do cliente em
// /minha-conta).
export default async function PagamentosDesativado({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/clientes/${id}`);
}
