"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

const PALAVRA_CONFIRMACAO = "RESETAR";

// Reset "total" só no sentido de dados financeiros do Controle — receitas,
// despesas, compras no cartão, cartões, agenda e orçamentos por categoria.
// Deliberadamente NÃO mexe em Divida/Parcela/Pagamento (Empréstimos e
// Dívidas): essa tabela é compartilhada com o painel administrativo de
// cobrança, sem um campo que diferencie o que o próprio cliente cadastrou
// do que a agência lançou sobre ele — apagar aqui poderia destruir um
// registro de cobrança que não é do cliente decidir apagar. Também não
// mexe no login/perfil (nome, telefone, senha, foto).
export async function resetarDadosFinanceiros(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const confirmacao = String(formData.get("confirmacao") || "").trim().toUpperCase();
  if (confirmacao !== PALAVRA_CONFIRMACAO) {
    return { erro: `Digite "${PALAVRA_CONFIRMACAO}" (em maiúsculas) pra confirmar.` };
  }

  await prisma.$transaction([
    prisma.lancamento.deleteMany({ where: { clienteId: cliente.id } }),
    prisma.cartao.deleteMany({ where: { clienteId: cliente.id } }),
    prisma.tarefa.deleteMany({ where: { clienteId: cliente.id } }),
    prisma.orcamentoCategoria.deleteMany({ where: { clienteId: cliente.id } }),
    prisma.pushSubscription.deleteMany({ where: { clienteId: cliente.id } }),
  ]);

  revalidatePath("/minha-conta", "layout");
  redirect("/minha-conta/perfil?ok=reset");
}
