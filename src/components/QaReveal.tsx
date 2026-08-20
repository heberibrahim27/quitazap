"use client";

import { useRef } from "react";
import { motion } from "framer-motion";

/**
 * Substitui a div de um card do painel admin — anima entrada (fade + leve
 * subida) uma única vez ao montar. Usar `delay` incremental (ex: index*0.05)
 * pra criar o efeito de cascata entre cards de um mesmo grid.
 */
export function QaReveal({
  children,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.2, 0.8, 0.2, 1] }}
      onAnimationComplete={() => {
        // Framer Motion deixa o transform gravado inline depois da
        // animação, o que sobrepõe o `:hover { transform }` do CSS
        // (.qa-card/.qa-stat-card) por especificidade. Limpa o inline
        // pra devolver o hover pro CSS assim que a entrada termina.
        if (ref.current) ref.current.style.transform = "";
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}
