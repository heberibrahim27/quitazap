"use client";

import { useEffect, useRef, useState } from "react";

// Anima um valor em reais de 0 até `valor` quando o elemento entra na tela
// (uma vez só). Formatação idêntica ao texto estático que substitui
// ("R$ 5.820", sem centavos) — mesmo componente serve pra qualquer um dos
// 3 números da seção de prova numérica.
export function CountUp({ valor, duracaoMs = 1100 }: { valor: number; duracaoMs?: number }) {
  const [exibido, setExibido] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const jaAnimou = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting && !jaAnimou.current) {
            jaAnimou.current = true;
            const inicio = performance.now();
            const passo = (agora: number) => {
              const progresso = Math.min((agora - inicio) / duracaoMs, 1);
              const facilitado = 1 - Math.pow(1 - progresso, 3);
              setExibido(Math.round(valor * facilitado));
              if (progresso < 1) requestAnimationFrame(passo);
            };
            requestAnimationFrame(passo);
            observer.unobserve(el);
          }
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [valor, duracaoMs]);

  return (
    <span ref={ref}>
      R$ {exibido.toLocaleString("pt-BR")}
    </span>
  );
}
