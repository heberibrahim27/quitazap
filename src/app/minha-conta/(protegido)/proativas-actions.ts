"use server";

import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

export async function atualizarAceitaProativas(aceita: boolean): Promise<void> {
  const cliente = await getClienteAtual();
  if (!cliente) return;

  await prisma.cliente.update({
    where: { id: cliente.id },
    data: { aceitaProativas: aceita },
  });
}
