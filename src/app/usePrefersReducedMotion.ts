"use client";

import { useEffect, useState } from "react";

// Usado pelos efeitos scrubados por scroll (compression, depth rig,
// parallax) pra desligar o movimento sem quebrar o layout — o conteúdo
// continua visível, só para de escalar/deslocar/reagir ao mouse.
export function usePrefersReducedMotion(): boolean {
  const [reduzido, setReduzido] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduzido(query.matches);
    const ouvir = (e: MediaQueryListEvent) => setReduzido(e.matches);
    query.addEventListener("change", ouvir);
    return () => query.removeEventListener("change", ouvir);
  }, []);

  return reduzido;
}
