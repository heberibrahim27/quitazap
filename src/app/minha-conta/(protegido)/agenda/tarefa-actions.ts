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
