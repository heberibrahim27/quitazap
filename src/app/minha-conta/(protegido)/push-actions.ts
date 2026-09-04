"use server";

import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { enviarPush } from "@/lib/push-service";

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

// Dispara um push imediato pro próprio cliente, só pra confirmar que a
// notificação chega no aparelho — não depende do cron nem de haver
// tarefa/orçamento pra avisar.
export async function enviarPushTeste(): Promise<{ enviados: number } | { erro: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const enviados = await enviarPush(cliente.id, {
    titulo: "Notificação de teste",
    corpo: "Se você recebeu isso, o push tá funcionando certinho no seu aparelho.",
    url: "/minha-conta/perfil",
  });

  if (enviados === 0) {
    return { erro: "Não entrou nenhum push. Confirme se ativou as notificações neste aparelho." };
  }
  return { enviados };
}
