"use server";

import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

export async function inscreverPush(inscricao: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  const cliente = await getClienteAtual();
  if (!cliente) return;

  await prisma.pushSubscription.upsert({
    where: { endpoint: inscricao.endpoint },
    update: { clienteId: cliente.id, p256dh: inscricao.keys.p256dh, auth: inscricao.keys.auth },
    create: {
      clienteId: cliente.id,
      endpoint: inscricao.endpoint,
      p256dh: inscricao.keys.p256dh,
      auth: inscricao.keys.auth,
    },
  });
}

export async function removerInscricaoPush(endpoint: string): Promise<void> {
  const cliente = await getClienteAtual();
  if (!cliente) return;

  await prisma.pushSubscription.deleteMany({ where: { endpoint, clienteId: cliente.id } });
}
