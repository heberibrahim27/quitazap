"use server";

import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { enviarPush, enviarPushDetalhado, fingerprintEndpoint, type ResultadoEnvioPush } from "@/lib/push-service";

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

// Mantida pro botão normal "Enviar notificação de teste" fora do modo
// diagnóstico — comportamento simples de sempre.
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

export type DiagnosticoPushResultado = {
  testId: string;
  temInscricaoNoBanco: boolean;
  inscricaoLocalBateComBanco: boolean | null; // null = não tinha subscription local pra comparar
  resultadosProvedor: ResultadoEnvioPush[];
};

// Diagnóstico completo (ver docs/ — instrumentação de push, 10/09/2026):
// dispara o teste já marcado com testId (o service worker devolve a
// confirmação de exibição de forma assíncrona, correlacionada por esse
// id — ver /api/minha-conta/push/recibo) e devolve, junto, se a
// inscrição LOCAL deste navegador (endpoint que o próprio aparelho
// reportou via getSubscription()) bate com algum registro ativo no banco
// pra este cliente — sem isso, "tenho uma subscription local" e "essa
// subscription está cadastrada de verdade" pareciam a mesma coisa, e não
// são: pode ter sido apagada do banco (404/410 anterior) sem o navegador
// saber, ou pertencer a um ambiente de preview com chave VAPID diferente.
export async function enviarPushDiagnostico(testId: string, endpointLocal: string | null): Promise<DiagnosticoPushResultado | { erro: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const inscricoesBanco = await prisma.pushSubscription.findMany({ where: { clienteId: cliente.id } });

  const inscricaoLocalBateComBanco =
    endpointLocal == null ? null : inscricoesBanco.some((i) => i.endpoint === endpointLocal);

  await prisma.pushTesteDiagnostico.create({
    data: { testId, clienteId: cliente.id },
  });

  const resultadosProvedor = await enviarPushDetalhado(cliente.id, {
    titulo: "Notificação de teste",
    corpo: "Se você recebeu isso, o push tá funcionando certinho no seu aparelho.",
    url: "/minha-conta/perfil",
    testId,
  });

  await prisma.pushTesteDiagnostico
    .update({ where: { testId }, data: { provedorResultado: resultadosProvedor } })
    .catch(() => {});

  return {
    testId,
    temInscricaoNoBanco: inscricoesBanco.length > 0,
    inscricaoLocalBateComBanco,
    resultadosProvedor,
  };
}

// Só devolve o fingerprint (nunca o endpoint completo) — a página de
// diagnóstico usa isso pra montar o dado que vai pra tela/log.
export async function fingerprintEndpointAction(endpoint: string): Promise<string> {
  return fingerprintEndpoint(endpoint);
}
