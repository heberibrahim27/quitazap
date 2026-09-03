"use client";

import { useEffect, useRef } from "react";

// Camada de fundo com "blobs" de luz suave que se movem mais devagar que o
// scroll (efeito parallax) — dá profundidade real pro vidro fosco dos cards,
// que hoje só tem o degradê cinza plano atrás. Usa transform (não
// background-attachment: fixed, que trava/pisca no Safari do iOS quando
// combinado com os vários backdrop-filter dos cards) e throttling via
// requestAnimationFrame pra não pesar no scroll do celular.
export function FundoParallax() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let tique = false;
    function aplicar() {
      const el = ref.current;
      if (el) el.style.transform = `translateY(${window.scrollY * -0.12}px)`;
      tique = false;
    }
    function aoRolar() {
      if (tique) return;
      tique = true;
      requestAnimationFrame(aplicar);
    }
    aplicar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  return (
    <div className="parallax-bg" aria-hidden="true">
      <div ref={ref} className="parallax-blobs">
        <span className="parallax-blob parallax-blob-1" />
        <span className="parallax-blob parallax-blob-2" />
        <span className="parallax-blob parallax-blob-3" />
      </div>
    </div>
  );
}
