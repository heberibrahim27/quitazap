"use server";

import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

export async function salvarOrcamento(formData: FormData): Promise<void> {
  const cliente = await getClienteAtual();
  if (!cliente) return;

  const categoria = String(formData.get("categoria") || "").trim();
  const limiteTexto = String(formData.get("limiteMensal") || "").trim().replace(",", ".");
  if (!categoria) return;

  const limiteMensal = Number(limiteTexto);
  if (!Number.isFinite(limiteMensal) || limiteMensal <= 0) return;

  await prisma.orcamentoCategoria.upsert({
    where: { clienteId_categoria: { clienteId: cliente.id, categoria } },
    update: { limiteMensal },
    create: { clienteId: cliente.id, categoria, limiteMensal },
  });

  revalidatePath("/minha-conta/gastos");
}

export async function removerOrcamento(formData: FormData): Promise<void> {
  const cliente = await getClienteAtual();
  if (!cliente) return;

  const categoria = String(formData.get("categoria") || "").trim();
  if (!categoria) return;

  await prisma.orcamentoCategoria.deleteMany({ where: { clienteId: cliente.id, categoria } });
  revalidatePath("/minha-conta/gastos");
}
