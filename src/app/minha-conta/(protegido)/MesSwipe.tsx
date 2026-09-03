"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

const DISTANCIA_MINIMA = 60; // px horizontais pra contar como swipe de mês
const TOLERANCIA_VERTICAL = 45; // px verticais tolerados (acima disso é scroll da página, não swipe)

// Troca as setas fixas de navegação de mês por gesto de arrastar o dedo
// no card: arrasta pra esquerda vai pro mês seguinte, pra direita volta
// pro anterior (mesma convenção de calendário mobile). hrefSeguinte null
// desativa o swipe pra frente (ex: já no mês atual, sem meses futuros).
export function MesSwipe({
  hrefAnterior,
  hrefSeguinte,
  children,
}: {
  hrefAnterior: string;
  hrefSeguinte: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const inicio = useRef<{ x: number; y: number } | null>(null);

  function aoComecar(e: React.TouchEvent) {
    const t = e.touches[0];
    inicio.current = { x: t.clientX, y: t.clientY };
  }

  function aoTerminar(e: React.TouchEvent) {
    const partida = inicio.current;
    inicio.current = null;
    if (!partida) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - partida.x;
    const dy = t.clientY - partida.y;
    if (Math.abs(dx) < DISTANCIA_MINIMA || Math.abs(dy) > TOLERANCIA_VERTICAL) return;

    if (dx > 0) router.push(hrefAnterior);
    else if (hrefSeguinte) router.push(hrefSeguinte);
  }

  return (
    <div onTouchStart={aoComecar} onTouchEnd={aoTerminar} style={{ touchAction: "pan-y" }}>
      {children}
    </div>
  );
}
