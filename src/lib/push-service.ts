import { createHash } from "node:crypto";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "https://quitazap.com.br";

const configurado = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (configurado) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

export type PushPayload = { titulo: string; corpo: string; url?: string; testId?: string };

// Fingerprint curto e não-reversível — nunca expõe o endpoint completo em
// log/tela (achado real, Ibrahim 10/09/2026: diagnóstico de push precisa
// comparar "a inscrição deste aparelho" com "o que está no banco" sem
// nunca imprimir endpoint/auth/p256dh inteiros em lugar nenhum).
export function fingerprintEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 12);
}

// Categoriza o erro do provedor de push de um jeito que a UI consegue agir
// em cima — ver docs internos: 404/410 = inscrição morta (só ela, não
// invalida as outras do cliente); 401/403 = problema de chave/autenticação
// VAPID; 400/413 = payload; 429/5xx/sem resposta = falha temporária, NUNCA
// deveria virar "notificação desativada" pro cliente.
export type CategoriaErroPush = "sucesso" | "invalido" | "auth" | "payload" | "transitorio" | "desconhecido";

function categorizarStatus(statusCode: number | undefined): CategoriaErroPush {
  if (statusCode === 404 || statusCode === 410) return "invalido";
  if (statusCode === 401 || statusCode === 403) return "auth";
  if (statusCode === 400 || statusCode === 413) return "payload";
  if (statusCode === 429 || (statusCode !== undefined && statusCode >= 500) || statusCode === undefined) return "transitorio";
  return "desconhecido";
}

export type ResultadoEnvioPush = {
  fingerprint: string;
  ok: boolean;
  statusCode: number | null;
  categoria: CategoriaErroPush;
};

// Manda a notificação pra todos os dispositivos inscritos do cliente.
// Inscrições que o navegador já revogou (404/410) são apagadas na hora —
// não faz sentido tentar de novo depois. Devolve o resultado POR
// inscrição (não só uma contagem) — collapsar tudo num número só foi
// exatamente o que escondeu a causa real de "notificação de teste não
// chegou" (achado real, Ibrahim 10/09/2026): 401/403/429/5xx viravam a
// mesma mensagem genérica que "sem inscrição nenhuma".
export async function enviarPushDetalhado(clienteId: string, payload: PushPayload): Promise<ResultadoEnvioPush[]> {
  if (!configurado) {
    console.warn("[PUSH] VAPID não configurado (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ausentes).");
    return [];
  }

  const inscricoes = await prisma.pushSubscription.findMany({ where: { clienteId } });
  if (inscricoes.length === 0) return [];

  return Promise.all(
    inscricoes.map(async (inscricao): Promise<ResultadoEnvioPush> => {
      const fingerprint = fingerprintEndpoint(inscricao.endpoint);
      try {
        await webpush.sendNotification(
          { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
          JSON.stringify(payload)
        );
        return { fingerprint, ok: true, statusCode: 200, categoria: "sucesso" };
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        const categoria = categorizarStatus(statusCode);
        if (categoria === "invalido") {
          await prisma.pushSubscription.delete({ where: { id: inscricao.id } }).catch(() => {});
        } else {
          console.error(`[PUSH] Erro ao enviar (fingerprint ${fingerprint}, status ${statusCode ?? "sem resposta"}):`, err);
        }
        return { fingerprint, ok: false, statusCode: statusCode ?? null, categoria };
      }
    })
  );
}

// Mantida pros chamadores existentes (crons de lembrete/orçamento) que só
// precisam saber "quantos deram certo" — não muda comportamento deles.
export async function enviarPush(clienteId: string, payload: PushPayload): Promise<number> {
  const resultados = await enviarPushDetalhado(clienteId, payload);
  return resultados.filter((r) => r.ok).length;
}

export function pushConfigurado(): boolean {
  return configurado;
}
