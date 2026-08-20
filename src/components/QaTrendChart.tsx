"use client";

import { useId } from "react";
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from "recharts";

type QaTrendPoint = Record<string, number | string>;

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Mini gráfico de área usado dentro do .qa-hero — linha suave com
 * gradiente translúcido, sem eixo/grade pesados (estilo "banco premium").
 * Formata o valor do tooltip como BRL sempre — a função de formatação
 * roda aqui dentro (componente cliente), não pode vir via prop de um
 * Server Component (Next.js não serializa função como prop de cliente).
 */
export function QaTrendChart({
  data,
  dataKey,
  labelKey = "label",
  color = "#00bfff",
}: {
  data: QaTrendPoint[];
  dataKey: string;
  labelKey?: string;
  color?: string;
}) {
  const gradId = useId();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
          contentStyle={{
            background: "rgba(8,12,22,0.95)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            fontSize: 12,
            padding: "6px 10px",
          }}
          labelStyle={{ color: "#9ca3af", marginBottom: 2 }}
          itemStyle={{ color: "#fff" }}
          formatter={(value) => [fmtBRL(Number(value)), ""]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.[labelKey] ?? ""}
        />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${gradId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
