"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantém o dashboard do cliente atualizado sozinho enquanto a aba estiver
 * aberta, sem precisar de F5 — pedido do Héber: "quero que atualize
 * automático no dashboard do cliente assim que o bot confirmar" (um
 * lançamento pelo WhatsApp).
 *
 * Como o layout/páginas do painel (`(protegido)/**`) já são Server
 * Components que buscam os dados direto do Prisma a cada render, basta
 * disparar `router.refresh()` periodicamente — ele re-executa a busca no
 * servidor e atualiza a árvore em tela sem navegação/reload completo, sem
 * perder o scroll nem precisar de WebSocket/infra nova.
 *
 * Cuidados: só faz polling com a aba visível (evita gasto de bateria/rede
 * e chamadas ao banco à toa quando o cliente trocou de aba). Intervalo de
 * 4s (reduzido de 20s a pedido do Héber — 20s dava a impressão de que
 * precisava dar F5): é "quase em tempo real", suficiente pra refletir um
 * lançamento feito no WhatsApp poucos segundos depois, sem precisar de
 * WebSocket/Supabase Realtime.
 */
export function AutoRefreshDashboard({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function iniciar() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") {
          routerRef.current.refresh();
        }
      }, intervalMs);
    }

    function parar() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function aoTrocarVisibilidade() {
      if (document.visibilityState === "visible") {
        // Ao voltar pra aba, atualiza na hora (não espera o próximo tick)
        // — cobre o caso comum de "mandei o gasto no WhatsApp, voltei pro
        // painel pra conferir".
        routerRef.current.refresh();
        iniciar();
      } else {
        parar();
      }
    }

    if (document.visibilityState === "visible") iniciar();
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);

    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
    };
  }, [intervalMs]);

  return null;
}
