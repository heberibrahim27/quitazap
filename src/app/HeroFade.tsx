"use client";

import { useEffect, useRef } from "react";

// Fade ligado à posição/direção do scroll: o vídeo + overlays + conteúdo do
// Hero vão desaparecendo conforme rola pra baixo (dobra de Dor entrando) e
// voltam a aparecer se rolar de volta pra cima — não é um reveal de uma vez
// só (IntersectionObserver) nem um pin com overlay por cima (efeito rejeitado
// antes: "não é o vídeo ficar fixo e os cards rolando por cima dele"). Como é
// só uma opacidade em um único elemento, aplicada direto no DOM (sem
// re-render React) e throttled por rAF, o custo é muito menor que o parallax
// multi-camada que já tinha sido cortado do escopo por segurança de prazo.
export function HeroFade({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let ticking = false;

    const aplicarOpacidade = () => {
      ticking = false;
      // Fundo (gradiente + glow) da seção fica de fora do fade — só o vídeo e
      // o conteúdo somem, então nunca aparece um flash do branco do fundo da
      // página por trás enquanto o Hero se dissolve.
      const distancia = Math.max(window.innerHeight * 0.85, 1);
      const opacidade = 1 - Math.min(Math.max(window.scrollY / distancia, 0), 1);
      el.style.opacity = String(opacidade);
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(aplicarOpacidade);
      }
    };

    aplicarOpacidade();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <div ref={ref}>{children}</div>;
}
