"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Rastreio leve de uso da área logada (pageview + clique em CTAs
 * marcados), só pra alimentar o ranking de "páginas mais acessadas" e
 * "cliques mais comuns" em /acessos (painel admin). Fire-and-forget: nunca
 * bloqueia nem quebra a navegação do assinante — erro de rede aqui é
 * silenciosamente ignorado.
 *
 * Cliques: qualquer elemento com `data-track="algum-nome"` (ou um
 * ancestral próximo, pra funcionar em ícone dentro de botão) dispara um
 * evento "click" com esse nome. Elementos sem o atributo não geram
 * nenhum evento — evita virar ruído capturando clique em tudo.
 */
function registrarEvento(tipo: "pageview" | "click", caminho: string) {
  fetch("/api/analytics/evento", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, caminho }),
    keepalive: true,
  }).catch(() => {});
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const ultimoPathname = useRef<string | null>(null);

  useEffect(() => {
    if (pathname && pathname !== ultimoPathname.current) {
      ultimoPathname.current = pathname;
      registrarEvento("pageview", pathname);
    }
  }, [pathname]);

  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      const alvo = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-track]");
      if (!alvo) return;
      const nome = alvo.getAttribute("data-track");
      if (nome) registrarEvento("click", nome);
    }
    document.addEventListener("click", aoClicar, { capture: true, passive: true });
    return () => document.removeEventListener("click", aoClicar, { capture: true });
  }, []);

  return null;
}
