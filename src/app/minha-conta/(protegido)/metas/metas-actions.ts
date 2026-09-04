"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

export async function criarMeta(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const nome = String(formData.get("nome") || "").trim();
  const valorTexto = String(formData.get("valorAlvo") || "").replace(",", ".").trim();
  const valorAlvo = Number(valorTexto);

  if (!nome) return { erro: "Digite o nome da meta." };
  if (!Number.isFinite(valorAlvo) || valorAlvo <= 0) {
    return { erro: "Digite um valor válido pra guardar." };
  }

  await prisma.meta.create({ data: { clienteId: cliente.id, nome, valorAlvo } });

  revalidatePath("/minha-conta", "layout");
  return {};
}

// Confere posse da meta antes de aceitar o depósito, senão um cliente
// logado poderia depositar num cofrinho de outro só sabendo o id.
export async function criarDeposito(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const metaId = String(formData.get("metaId") || "").trim();
  const valorTexto = String(formData.get("valor") || "").replace(",", ".").trim();
  const valor = Number(valorTexto);

  if (!Number.isFinite(valor) || valor <= 0) return { erro: "Digite um valor válido." };

  const meta = await prisma.meta.findUnique({ where: { id: metaId } });
  if (!meta || meta.clienteId !== cliente.id) return { erro: "Meta não encontrada." };

  await prisma.depositoMeta.create({ data: { metaId, valor } });

  revalidatePath("/minha-conta", "layout");
  return {};
}

export async function apagarMeta(formData: FormData): Promise<void> {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const metaId = String(formData.get("metaId") || "").trim();
  const meta = await prisma.meta.findUnique({ where: { id: metaId } });
  if (!meta || meta.clienteId !== cliente.id) redirect("/minha-conta/metas");

  // onDelete: Cascade no schema já apaga os depósitos junto.
  await prisma.meta.delete({ where: { id: metaId } });

  revalidatePath("/minha-conta", "layout");
  redirect("/minha-conta/metas");
}
