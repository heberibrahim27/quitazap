import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "https://quitazap.com.br";

const configurado = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (configurado) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

export type PushPayload = { titulo: string; corpo: string; url?: string };

// Manda a notificação pra todos os dispositivos inscritos do cliente.
// Inscrições que o navegador já revogou (404/410) são apagadas na hora —
// não faz sentido tentar de novo depois. Devolve quantos envios deram
// certo, pra quem chama saber se realmente chegou notificação em algum
// dispositivo (0 não é erro — só significa "sem inscrição ativa").
export async function enviarPush(clienteId: string, payload: PushPayload): Promise<number> {
  if (!configurado) {
    console.warn("[PUSH] VAPID não configurado (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ausentes).");
    return 0;
  }

  const inscricoes = await prisma.pushSubscription.findMany({ where: { clienteId } });
  if (inscricoes.length === 0) return 0;

  const resultados = await Promise.all(
    inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
          JSON.stringify(payload)
        );
        return true;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: inscricao.id } }).catch(() => {});
        } else {
          console.error("[PUSH] Erro ao enviar notificação:", err);
        }
        return false;
      }
    })
  );

  return resultados.filter(Boolean).length;
}

export function pushConfigurado(): boolean {
  return configurado;
}
