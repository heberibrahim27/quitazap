"use client";

import { useLayoutEffect, useRef } from "react";

const TAMANHO_MINIMO = 13;

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
      el.style.whiteSpace = "nowrap";
      let atual = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > pai.clientWidth && atual > TAMANHO_MINIMO) {
        atual -= 1;
        el.style.fontSize = `${atual}px`;
      }
      // Mesmo no menor tamanho ainda não coube (valor com muitos dígitos
      // numa tela muito estreita) — deixa quebrar linha em vez de cortar.
      // Um valor financeiro nunca pode ficar escondido (achado real via
      // print do Ibrahim, 10/09/2026: "-R$457," sem os centavos).
      if (el.scrollWidth > pai.clientWidth) {
        el.style.whiteSpace = "normal";
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
