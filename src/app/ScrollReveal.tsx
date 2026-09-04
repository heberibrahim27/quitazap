"use client";

import { useEffect } from "react";

// Observa todo elemento .qz-reveal da página e adiciona .qz-visible quando
// ele entra na tela — CSS puro (ver <style> no page.tsx) cuida da transição
// de fade/slide. Um componente client só pra isso, sem props, permite que
// o resto da landing continue sendo Server Component (o contador de vagas
// precisa ler o banco a cada request).
export function ScrollReveal() {
  useEffect(() => {
    const alvos = document.querySelectorAll<HTMLElement>(".qz-reveal");
    if (alvos.length === 0) return;

    const observer = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            entrada.target.classList.add("qz-visible");
            observer.unobserve(entrada.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    alvos.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
