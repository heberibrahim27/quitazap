"use client";

import { useEffect, useRef } from "react";

// Adiciona a classe "run" no wrapper assim que ele entra na tela (uma
// vez só, depois para de observar) — dispara animações CSS que dependem
// dessa classe, como o preenchimento das barras de progresso.
export function AnimarAoAparecer({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entrada], obs) => {
        if (!entrada.isIntersecting) return;
        el.classList.add("run");
        obs.unobserve(el);
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="animar">
      {children}
    </div>
  );
}
