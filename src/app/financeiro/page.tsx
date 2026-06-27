// ─────────────────────────────────────────
// QuitaZAP — Página Financeiro
// /financeiro
// ─────────────────────────────────────────

import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

const PRECO_MENSAL = 29.90;
const COMISSAO_CAKTO = 0.053; // 5,3% via PIX
const CUSTO_ZAPI = 99.99;
const CUSTO_DOMINIO = 5.83;   // R$70/ano ÷ 12
const CUSTO_OPENAI_POR_CLIENTE = 0.07;

export default async function FinanceiroPage() {
  const [pagantes, totalGratuitos, totalPlanos] = await Promise.all([
    prisma.cliente.count({ where: { gratuito: false } }),
    prisma.cliente.count({ where: { gratuito: true } }),
    prisma.planoEnviado.count(),
  ]);

  const totalAssinantes = pagantes; // apenas pagantes contam na receita

  // Receita
  const receitaBruta = totalAssinantes * PRECO_MENSAL;
  const comissaoCakto = receitaBruta * COMISSAO_CAKTO;
  const receitaLiquida = receitaBruta - comissaoCakto;

  // Custos (IA estimada por todos os clientes ativos, gratuitos inclusos)
  const totalClientesAtivos = totalAssinantes + totalGratuitos;
  const custoFixo = CUSTO_ZAPI + CUSTO_DOMINIO;
  const custoVariavel = totalClientesAtivos * CUSTO_OPENAI_POR_CLIENTE;
  const custoTotal = custoFixo + custoVariavel;

  // Resultado
  const lucroLiquido = receitaLiquida - custoTotal;
  const margem = receitaLiquida > 0 ? lucroLiquido / receitaLiquida : 0;

  // Break-even
  const breakEvenClientes = Math.ceil(custoFixo / (PRECO_MENSAL * (1 - COMISSAO_CAKTO) - CUSTO_OPENAI_POR_CLIENTE));
  const clientesFaltam = Math.max(0, breakEvenClientes - totalAssinantes);

  const lucroPositivo = lucroLiquido >= 0;

  return (
    <main className="app-shell">
      <section className="home-card">

        {/* Header */}
        <div className="home-header">
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
              💰 Financeiro
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>
              Receita, custos e lucro do QuitaZAP em tempo real
            </p>
          </div>
          <Link href="/" className="primary-link">← Voltar</Link>
        </div>

        {/* Cards principais */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 16, padding: "20px 24px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "#16a34a", fontWeight: 600 }}>Assinantes pagos</p>
            <strong style={{ fontSize: 36, color: "#15803d" }}>{totalAssinantes}</strong>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
              + {totalGratuitos} gratuito{totalGratuitos !== 1 ? "s" : ""} (não contabilizados)
            </p>
          </div>

          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 16, padding: "20px 24px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "#16a34a", fontWeight: 600 }}>Receita bruta/mês</p>
            <strong style={{ fontSize: 28, color: "#15803d" }}>{fmt(receitaBruta)}</strong>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>{totalAssinantes} × R$29,90</p>
          </div>

          <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 16, padding: "20px 24px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "#a16207", fontWeight: 600 }}>Comissão CAKTO (5,3%)</p>
            <strong style={{ fontSize: 28, color: "#92400e" }}>- {fmt(comissaoCakto)}</strong>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Descontado automaticamente</p>
          </div>

          <div style={{
            background: lucroPositivo ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${lucroPositivo ? "#bbf7d0" : "#fecaca"}`,
            borderRadius: 16, padding: "20px 24px"
          }}>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: lucroPositivo ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
              Lucro líquido/mês
            </p>
            <strong style={{ fontSize: 28, color: lucroPositivo ? "#15803d" : "#dc2626" }}>
              {fmt(lucroLiquido)}
            </strong>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Margem: {pct(margem)}</p>
          </div>
        </div>

        {/* Break-even */}
        {clientesFaltam > 0 && (
          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a",
            borderRadius: 16, padding: 20, marginBottom: 24,
            display: "flex", alignItems: "center", gap: 16
          }}>
            <span style={{ fontSize: 32 }}>⚠️</span>
            <div>
              <strong style={{ color: "#92400e", display: "block" }}>
                Faltam {clientesFaltam} assinante(s) para o break-even
              </strong>
              <span style={{ fontSize: 13, color: "#78350f" }}>
                Com {breakEvenClientes} assinantes você cobre todos os custos. Hoje você tem {totalAssinantes}.
              </span>
            </div>
          </div>
        )}

        {clientesFaltam === 0 && totalAssinantes > 0 && (
          <div style={{
            background: "#f0fdf4", border: "1px solid #86efac",
            borderRadius: 16, padding: 20, marginBottom: 24,
            display: "flex", alignItems: "center", gap: 16
          }}>
            <span style={{ fontSize: 32 }}>🎉</span>
            <div>
              <strong style={{ color: "#15803d", display: "block" }}>No lucro!</strong>
              <span style={{ fontSize: 13, color: "#166534" }}>
                Você superou o break-even de {breakEvenClientes} assinantes. Cada novo assinante gera {fmt(PRECO_MENSAL * (1 - COMISSAO_CAKTO) - CUSTO_OPENAI_POR_CLIENTE)} de lucro extra.
              </span>
            </div>
          </div>
        )}

        {/* Detalhamento */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>

          {/* Receita */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#0f172a" }}>📈 Receita</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                ["Receita bruta", fmt(receitaBruta)],
                ["Comissão CAKTO (5,3%)", `- ${fmt(comissaoCakto)}`],
              ].map(([label, valor]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "#64748b" }}>{label}</span>
                  <strong style={{ color: "#0f172a" }}>{valor}</strong>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                <span style={{ fontWeight: 700 }}>Receita líquida</span>
                <strong style={{ color: "#16a34a" }}>{fmt(receitaLiquida)}</strong>
              </div>
            </div>
          </div>

          {/* Custos */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#0f172a" }}>📉 Custos</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                ["Z-API (WhatsApp)", fmt(CUSTO_ZAPI)],
                ["Domínio (.com.br)", fmt(CUSTO_DOMINIO)],
                [`OpenAI (${totalClientesAtivos} clientes × R$0,07)`, fmt(custoVariavel)],
              ].map(([label, valor]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "#64748b" }}>{label}</span>
                  <strong style={{ color: "#0f172a" }}>{valor}</strong>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                <span style={{ fontWeight: 700 }}>Custo total</span>
                <strong style={{ color: "#dc2626" }}>{fmt(custoTotal)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Resultado final */}
        <div style={{
          background: lucroPositivo ? "#f0fdf4" : "#fef2f2",
          border: `2px solid ${lucroPositivo ? "#16a34a" : "#dc2626"}`,
          borderRadius: 16, padding: 24,
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>RESULTADO MENSAL</p>
            <strong style={{ fontSize: 32, color: lucroPositivo ? "#15803d" : "#dc2626" }}>
              {fmt(lucroLiquido)}
            </strong>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Margem líquida: {pct(margem)} · {totalPlanos} planos gerados
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Por assinante</p>
            <strong style={{ fontSize: 20, color: "#15803d" }}>
              {fmt(PRECO_MENSAL * (1 - COMISSAO_CAKTO) - CUSTO_OPENAI_POR_CLIENTE)}
            </strong>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>lucro/mês</p>
          </div>
        </div>

        {/* Projeção rápida */}
        <div style={{ marginTop: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#0f172a" }}>📊 Projeção</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {["Assinantes", "Receita Bruta", "- CAKTO", "- Custos", "Lucro Líquido", "Margem"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 3, 5, 10, 20, 50].map((n, i) => {
                  const rb = n * PRECO_MENSAL;
                  const ck = rb * COMISSAO_CAKTO;
                  const cv = n * CUSTO_OPENAI_POR_CLIENTE;
                  const ct = custoFixo + cv;
                  const ll = rb - ck - ct;
                  const mg = ll / (rb - ck);
                  const isAtual = n === totalAssinantes;
                  return (
                    <tr key={n} style={{ background: isAtual ? "#f0fdf4" : i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: isAtual ? 800 : 400 }}>
                        {n}{isAtual ? " ← atual" : ""}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>{fmt(rb)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", color: "#b45309" }}>- {fmt(ck)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", color: "#dc2626" }}>- {fmt(ct)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: ll >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(ll)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", color: ll >= 0 ? "#16a34a" : "#dc2626" }}>{pct(mg)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </section>
    </main>
  );
}
