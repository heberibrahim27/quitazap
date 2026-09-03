"use client";

import { useLayoutEffect, useRef } from "react";

const TAMANHO_MINIMO = 20;

// Encolhe a fonte do valor até ele caber na largura real disponível no
// elemento pai (medida de verdade no navegador, não estimativa) — sem
// isso, um valor com mais dígitos cresce e invade o que está ao lado
// (o anel de % na hero). Parte sempre do tamanho definido no CSS
// (clamp responsivo) e reage a mudanças de tamanho de tela via
// ResizeObserver.
//
// scrollWidth só reflete a largura real do conteúdo (sem quebrar linha)
// quando o próprio elemento tem overflow diferente de "visible" — por
// isso o overflow:hidden aqui é essencial, não só estético: sem ele o
// navegador reporta scrollWidth igual ao clientWidth (a caixa, já
// encolhida pelo flex), nunca detectando o estouro de verdade.
export function ValorAutoAjustavel({ texto, className }: { texto: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const pai = el?.parentElement;
    if (!el || !pai) return;

    function ajustar() {
      if (!el || !pai) return;
      el.style.fontSize = "";
      let atual = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > pai.clientWidth && atual > TAMANHO_MINIMO) {
        atual -= 1;
        el.style.fontSize = `${atual}px`;
      }
    }

    ajustar();
    const observer = new ResizeObserver(ajustar);
    observer.observe(pai);
    return () => observer.disconnect();
  }, [texto]);

  return (
    <p ref={ref} className={className} style={{ whiteSpace: "nowrap", overflow: "hidden" }}>
      {texto}
    </p>
  );
}
