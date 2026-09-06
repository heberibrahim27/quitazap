"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { criarMetaTyped, criarDepositoTyped, criarSaqueTyped } from "@/lib/meta-service";

export async function criarMeta(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const nome = String(formData.get("nome") || "").trim();
  const valorTexto = String(formData.get("valorAlvo") || "").replace(",", ".").trim();
  const valorAlvo = Number(valorTexto);

  const resultado = await criarMetaTyped(cliente.id, nome, valorAlvo);
  if (!resultado.ok) return { erro: resultado.erro };

  revalidatePath("/minha-conta", "layout");
  return {};
}

// Confere posse da meta antes de aceitar o depósito, senão um cliente
// logado poderia depositar num cofrinho de outro só sabendo o id.
//
// O depósito é dinheiro que sai da conta pro cofrinho — sem criar um
// Lancamento espelho (categoria "Metas"), o "Disponível" do Dashboard e
// todo o resto do app continuariam contando esse valor como se ainda
// estivesse livre pra gastar.
export async function criarDeposito(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const metaId = String(formData.get("metaId") || "").trim();
  const valorTexto = String(formData.get("valor") || "").replace(",", ".").trim();
  const valor = Number(valorTexto);

  const resultado = await criarDepositoTyped(cliente.id, metaId, valor, "WEB");
  if (!resultado.ok) return { erro: resultado.erro };

  revalidatePath("/minha-conta", "layout");
  return {};
}

// Resgate: o dinheiro volta da meta pra conta, então vira uma "entrada"
// (RECEITA) em vez de despesa — o inverso exato do depósito. Guardado como
// DepositoMeta com valor NEGATIVO: soma direto no total guardado sem
// precisar de um campo à parte pra distinguir depósito de saque.
export async function criarSaque(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const metaId = String(formData.get("metaId") || "").trim();
  const valorTexto = String(formData.get("valor") || "").replace(",", ".").trim();
  const valor = Number(valorTexto);

  const resultado = await criarSaqueTyped(cliente.id, metaId, valor, "WEB");
  if (!resultado.ok) return { erro: resultado.erro };

  revalidatePath("/minha-conta", "layout");
  return {};
}

export async function apagarMeta(formData: FormData): Promise<void> {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const metaId = String(formData.get("metaId") || "").trim();
  const meta = await prisma.meta.findUnique({ where: { id: metaId }, include: { depositos: true } });
  if (!meta || meta.clienteId !== cliente.id) redirect("/minha-conta/metas");

  // onDelete: Cascade no schema já apaga os DepositoMeta junto, mas os
  // Lancamento espelho (que afetam o saldo/histórico do app inteiro) não
  // somem sozinhos — sem apagar aqui, ficariam "despesas"/"receitas"
  // fantasmas de uma meta que não existe mais.
  const lancamentoIds = meta.depositos.map((d) => d.lancamentoId).filter((lid): lid is string => lid != null);

  await prisma.$transaction([
    prisma.meta.delete({ where: { id: metaId } }),
    ...(lancamentoIds.length > 0 ? [prisma.lancamento.deleteMany({ where: { id: { in: lancamentoIds } } })] : []),
  ]);

  revalidatePath("/minha-conta", "layout");
  redirect("/minha-conta/metas");
}
