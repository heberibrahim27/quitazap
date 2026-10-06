"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// Páginas que não se beneficiam de refresh quase-em-tempo-real (não são
// "saldo ao vivo") e cujo carregamento é caro o suficiente pra não valer
// repetir a cada intervalMs — achado ao vivo (Ibrahim, 10/09/2026):
// "QuitaZAP Hoje" ficando "muito lenta" era o auto-refresh de 4s se
// empilhando em cima da própria avaliação da página (força
// force-dynamic, várias queries sequenciais + um upsert de escrita a
// cada chamada) sempre que uma rodada demorava mais que os 4s seguintes
// — o refresh nunca espera o anterior terminar. "Hoje" é uma tela de
// briefing pra ser avaliada uma vez por visita, não um ticker.
const ROTAS_SEM_AUTO_REFRESH = ["/minha-conta/hoje"];

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
// Atualização automática (revisada em 06/10/2026): em vez de router.refresh() cego a cada 4s — que re-executava
// a página inteira (dezenas de queries) mesmo sem nada novo —, consulta /api/minha-conta/versao (3 agregados
// baratos) e só dispara o refresh quando um lançamento, pagamento ou dívida mudou. Mantém o "quase em tempo
// real" do WhatsApp sem sobrecarregar o servidor.
export function AutoRefreshDashboard({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const pathname = usePathname();
  const desativado = ROTAS_SEM_AUTO_REFRESH.some((rota) => pathname === rota || pathname.startsWith(rota + "/"));

  useEffect(() => {
    if (desativado) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let ultimaVersao: string | null = null;
    let consultando = false;

    // Consulta barata (3 agregados): só recarrega a tela pesada quando algo mudou de verdade.
    // Nunca empilha: se a consulta anterior ainda não voltou, pula o tick.
    async function verificar(forcar = false) {
      if (consultando || document.visibilityState !== "visible") return;
      consultando = true;
      try {
        const r = await fetch("/api/minha-conta/versao", { cache: "no-store" });
        if (!r.ok) return;
        const { versao } = (await r.json()) as { versao?: string };
        if (!versao) return;
        const mudou = ultimaVersao !== null && versao !== ultimaVersao;
        ultimaVersao = versao;
        if (mudou || forcar) routerRef.current.refresh();
      } catch {
        // sem rede / servidor ocupado: tenta de novo no próximo tick
      } finally {
        consultando = false;
      }
    }

    function iniciar() {
      if (intervalId) return;
      intervalId = setInterval(() => void verificar(), intervalMs);
    }

    function parar() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function aoTrocarVisibilidade() {
      if (document.visibilityState === "visible") {
        // Voltou pra aba (ex.: mandou o gasto no WhatsApp e voltou): confere na hora.
        void verificar();
        iniciar();
      } else {
        parar();
      }
    }

    // Marca a versão atual sem recarregar nada; a partir daí, só muda se houver dado novo.
    void verificar();
    if (document.visibilityState === "visible") iniciar();
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
    };
  }, [intervalMs, desativado]);

  return null;
}
