"use client";

import { useState } from "react";

// Pedido do Ibrahim: em vez de várias linhas fixas de cenário (1, 3, 5, 10,
// 20, 50 assinantes), uma única linha com o número de assinantes editável —
// o resto (Receita Bruta, CAKTO, Custos, Resultado, Margem) recalcula na
// hora, sem salvar/recarregar. Mesma fórmula que já existia na tabela fixa
// (financeiro/page.tsx), só que em cliente: os parâmetros (preço, comissão
// da Cakto, custo fixo do mês, custo médio de IA por cliente) continuam
// vindo do motor central (financeiro-admin/motor.ts) via props — este
// componente só multiplica/soma, nunca inventa nem recalcula esses valores.

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

export function ProjecaoAssinantes({
  totalAssinantesAtual,
  precoMensal,
  comissaoCakto,
  custoManualMes,
  custoVariavelPorCliente,
}: {
  totalAssinantesAtual: number;
  precoMensal: number;
  comissaoCakto: number;
  custoManualMes: number;
  custoVariavelPorCliente: number;
}) {
  // Começa no número real de assinantes de hoje — o usuário edita a partir
  // daí pra simular outro cenário.
  const [assinantesTexto, setAssinantesTexto] = useState(String(totalAssinantesAtual));

  const n = Math.max(0, Math.floor(Number(assinantesTexto) || 0));
  const receitaBruta = n * precoMensal;
  const cakto = receitaBruta * comissaoCakto;
  const custoVariavelTotal = n * custoVariavelPorCliente;
  const custos = custoManualMes + custoVariavelTotal;
  const resultadoOperacional = receitaBruta - cakto - custos;
  const margem = receitaBruta - cakto > 0 ? resultadoOperacional / (receitaBruta - cakto) : 0;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
      <thead>
        <tr>
          {["Assinantes", "Receita Bruta", "- CAKTO", "- Custos", "Resultado Operacional", "Margem"].map((h) => (
            <th key={h} style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "var(--qa-gray-400)", borderBottom: "1px solid var(--qa-line)" }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr style={{ background: "rgba(0,123,255,0.08)" }}>
          <td style={{ padding: "8px 14px", textAlign: "center" }}>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={assinantesTexto}
              onChange={(e) => setAssinantesTexto(e.target.value)}
              aria-label="Número de assinantes pra simular"
              className="qa-input"
              style={{ width: 90, textAlign: "center", padding: "6px 8px", fontWeight: 700 }}
            />
          </td>
          <td style={{ padding: "10px 14px", textAlign: "center" }}>{fmt(receitaBruta)}</td>
          <td style={{ padding: "10px 14px", textAlign: "center", color: "#fcd34d" }}>- {fmt(cakto)}</td>
          <td style={{ padding: "10px 14px", textAlign: "center", color: "#fca5a5" }}>- {fmt(custos)}</td>
          <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: resultadoOperacional >= 0 ? "#6ee7b7" : "#fca5a5" }}>
            {fmt(resultadoOperacional)}
          </td>
          <td style={{ padding: "10px 14px", textAlign: "center", color: resultadoOperacional >= 0 ? "#6ee7b7" : "#fca5a5" }}>{pct(margem)}</td>
        </tr>
      </tbody>
    </table>
  );
}
