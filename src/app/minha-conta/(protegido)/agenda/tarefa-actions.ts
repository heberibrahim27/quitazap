"use server";

import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

// Cliente cria um lembrete de pagamento futuro direto pelo painel (sem
// precisar mandar mensagem pro bot do WhatsApp) — os lembretes automáticos
// (push + WhatsApp, véspera e dia do vencimento) já funcionam pra qualquer
// Tarefa com vencimento, via o cron existente (ver api/cron/tarefas) — não
// precisa de nada especial aqui além de criar o registro certo.
export async function criarTarefa(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const descricao = String(formData.get("descricao") || "").trim();
  const valorTexto = String(formData.get("valor") || "").replace(",", ".").trim();
  const valor = valorTexto ? Number(valorTexto) : null;
  const vencimentoTexto = String(formData.get("vencimento") || "").trim();
  const recorrente = formData.get("recorrente") === "on";

  if (!descricao) return { erro: "Digite uma descrição." };
  if (valorTexto && (!Number.isFinite(valor) || (valor as number) <= 0)) {
    return { erro: "Digite um valor válido." };
  }
  if (!vencimentoTexto) return { erro: "Escolha a data do lembrete." };

  const vencimento = new Date(`${vencimentoTexto}T12:00:00`);
  if (Number.isNaN(vencimento.getTime())) return { erro: "Data inválida." };

  await prisma.tarefa.create({
    data: {
      clienteId: cliente.id,
      tipo: "PAGAMENTO",
      descricao,
      valor,
      vencimento,
      recorrente,
      frequencia: recorrente ? "MENSAL" : null,
      diaMes: recorrente ? vencimento.getDate() : null,
      status: "PENDENTE",
      origem: "WEB",
    },
  });

  revalidatePath("/minha-conta", "layout");
  return {};
}

// Editar um lembrete pendente (pedido do Ibrahim, 08/10/2026: "não tem como
// editar nem excluir"). Só mexe em tarefa do próprio cliente. Mudar a data
// zera o ultimoLembrete, senão um aviso já enviado hoje no dia errado
// impediria o aviso da data nova.
export async function editarTarefa(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const id = String(formData.get("id") || "");
  const tarefa = await prisma.tarefa.findUnique({ where: { id } });
  if (!tarefa || tarefa.clienteId !== cliente.id) return { erro: "Lembrete não encontrado." };

  const descricao = String(formData.get("descricao") || "").trim();
  const valorBruto = String(formData.get("valor") || "").trim();
  // "1.500,00" (vírgula = decimal, ponto = milhar) ou "250.50" (ponto = decimal).
  const valorTexto = valorBruto.includes(",") ? valorBruto.replace(/\./g, "").replace(",", ".") : valorBruto;
  const valor = valorTexto ? Number(valorTexto) : null;
  const vencimentoTexto = String(formData.get("vencimento") || "").trim();
  const recorrente = formData.get("recorrente") === "on";

  if (!descricao) return { erro: "Digite uma descrição." };
  if (valorTexto && (!Number.isFinite(valor) || (valor as number) <= 0)) {
    return { erro: "Digite um valor válido." };
  }
  if (!vencimentoTexto) return { erro: "Escolha a data do lembrete." };

  const vencimento = new Date(`${vencimentoTexto}T12:00:00`);
  if (Number.isNaN(vencimento.getTime())) return { erro: "Data inválida." };

  const mudouData = !tarefa.vencimento || tarefa.vencimento.toISOString().slice(0, 10) !== vencimento.toISOString().slice(0, 10);

  await prisma.tarefa.update({
    where: { id },
    data: {
      descricao,
      valor,
      vencimento,
      recorrente,
      frequencia: recorrente ? "MENSAL" : null,
      diaMes: recorrente ? Number(vencimentoTexto.slice(8, 10)) : null,
      ...(mudouData ? { ultimoLembrete: null } : {}),
    },
  });

  revalidatePath("/minha-conta", "layout");
  return {};
}

// Excluir de vez. Num lembrete recorrente isso encerra a repetição inteira
// (a série é um único registro que avança de mês em mês).
export async function excluirTarefa(id: string): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const resultado = await prisma.tarefa.deleteMany({ where: { id, clienteId: cliente.id } });
  if (resultado.count === 0) return { erro: "Lembrete não encontrado." };

  revalidatePath("/minha-conta", "layout");
  return {};
}
