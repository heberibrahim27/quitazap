"use client";

import { motion } from "framer-motion";

/**
 * Anel de progresso (SVG puro) — usado no hero do Financeiro pra mostrar a
 * margem líquida. `value` é uma fração (0.234 = 23,4%), pode passar de 1;
 * o preenchimento visual satura em 100%, mas o texto mostra o valor real.
 */
export function QaRing({
  value,
  size = 88,
  strokeWidth = 8,
  color = "#00bfff",
  label,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label: string;
}) {
  const preenchido = Math.max(0, Math.min(1, value));
  const raio = (size - strokeWidth) / 2;
  const perimetro = 2 * Math.PI * raio;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={raio} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={raio}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={perimetro}
          initial={{ strokeDashoffset: perimetro }}
          animate={{ strokeDashoffset: perimetro * (1 - preenchido) }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <strong style={{ fontSize: size * 0.2, fontWeight: 600 }}>{label}</strong>
      </div>
    </div>
  );
}
