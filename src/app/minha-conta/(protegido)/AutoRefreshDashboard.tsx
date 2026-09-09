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
 *
 * Achado ao vivo (Ibrahim, 09/09/2026 — "seletor de mês... bastante
 * lentidão/não funcionando"): um `router.refresh()` automático disparando
 * bem no instante em que o cliente toca numa seta de trocar de mês (ou
 * qualquer outro link) colide com a navegação que o clique acabou de
 * iniciar — os dois competem pela mesma transição do App Router, e o
 * resultado sentido é a navegação travando ou "não acontecer" até um
 * segundo toque. Por isso todo clique reinicia a contagem do intervalo:
 * nunca dispara um refresh automático nos `intervalMs` seguintes a uma
 * interação do cliente, sem abrir mão do "quase em tempo real" quando ele
 * só está olhando a tela parado.
 */
export function AutoRefreshDashboard({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function tick() {
      if (document.visibilityState === "visible") {
        routerRef.current.refresh();
      }
    }

    function iniciar() {
      if (intervalId) return;
      intervalId = setInterval(tick, intervalMs);
    }

    function parar() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function reiniciarContagem() {
      if (document.visibilityState !== "visible") return;
      parar();
      iniciar();
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
    // capture:true pra pegar o clique o mais cedo possível (antes de
    // qualquer preventDefault/stopPropagation de quem foi clicado) e
    // passive:true porque só lemos o evento, nunca cancelamos nada aqui.
    document.addEventListener("click", reiniciarContagem, { capture: true, passive: true });

    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
      document.removeEventListener("click", reiniciarContagem, { capture: true });
    };
  }, [intervalMs]);

  return null;
}
