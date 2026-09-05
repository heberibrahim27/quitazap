"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

type QaFlowPoint = Record<string, number | string>;

/**
 * Gráfico de barras agrupadas (novos vs. cancelados por mês) — mesmo
 * estilo visual do QaTrendChart, mas sem formatação BRL (aqui os valores
 * são contagem de clientes, não dinheiro).
 */
export function QaFlowChart({ data, labelKey = "rotulo" }: { data: QaFlowPoint[]; labelKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <XAxis dataKey={labelKey} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{
            background: "rgba(8,12,22,0.95)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            fontSize: 12,
            padding: "6px 10px",
          }}
          labelStyle={{ color: "#9ca3af", marginBottom: 2 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="novos" name="Novos" fill="#34d399" radius={[4, 4, 0, 0]} />
        <Bar dataKey="cancelados" name="Cancelados" fill="#f87171" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
