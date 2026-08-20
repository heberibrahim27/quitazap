// ─────────────────────────────────────────
// QuitaZAP — Página Financeiro
// /financeiro
// ─────────────────────────────────────────

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ExcluirForm } from "@/components/ExcluirForm";
import { IconWallet, IconTrendUp, IconTarget, IconCheckCircle, IconAlertTriangle } from "@/components/icons";
import { QaReveal } from "@/components/QaReveal";
import { QaRing } from "@/components/QaRing";

export const dynamic = "force-dynamic";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

function mesAtualBrasil(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const PRECO_MENSAL = 29.90;
const COMISSAO_CAKTO = 0.053; // 5,3% via PIX

const ROTULO_METRICA: Record<string, string> = {
  clientes_pagos: "Clientes pagos",
  mrr: "MRR (receita mensal)",
};

const excluirEstiloDark: React.CSSProperties = {
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.25)",
  color: "#fca5a5",
  padding: "5px 10px",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 12,
};

export default async function FinanceiroPage() {
  const mesAtual = mesAtualBrasil();
  const [ano, mesNum] = mesAtual.split("-").map(Number);

  // Início do mês corrente em horário de Brasília (meia-noite BRT = 03:00
  // UTC) — mesma convenção usada em /minha-conta, pra não desalinhar do
  // "mes" (YYYY-MM em BR) usado no filtro dos custos manuais. Calcular isso
  // com Date local do servidor (UTC na Vercel) faria o custo de IA já
  // contar o dia 1 (UTC) enquanto ainda é dia 31 (BR) — achado da
  // auto-revisão.
  const inicioMesBrasil = new Date(Date.UTC(ano, mesNum - 1, 1, 3, 0, 0, 0));

  const [pagantes, totalGratuitos, custosDoMes, metas, custoIA] = await Promise.all([
    prisma.cliente.count({ where: { gratuito: false } }),
    prisma.cliente.count({ where: { gratuito: true } }),
    prisma.custoMensal.findMany({ where: { mes: mesAtual }, orderBy: { criadoEm: "asc" } }),
    prisma.metaFinanceira.findMany(),
    (async () => {
      const r = await prisma.logIA.aggregate({ _sum: { custoUSD: true }, where: { criadoEm: { gte: inicioMesBrasil } } });
      return (r._sum.custoUSD ?? 0) * 5.7; // USD → BRL
    })(),
  ]);

  const totalAssinantes = pagantes;
  const totalClientesAtivos = totalAssinantes + totalGratuitos;

  // Receita
  const receitaBruta = totalAssinantes * PRECO_MENSAL;
  const comissaoCakto = receitaBruta * COMISSAO_CAKTO;
  const receitaLiquida = receitaBruta - comissaoCakto;

  // Custos: comissão + IA (automáticos, dados reais) + o que o fundador lançou manualmente esse mês
  const custoManualMes = custosDoMes.reduce((soma, c) => soma + c.valor, 0);
  const custoTotal = comissaoCakto + custoIA + custoManualMes;
  const custoVariavelPorCliente = totalClientesAtivos > 0 ? custoIA / totalClientesAtivos : 0;

  // Resultado
  const lucroLiquido = receitaLiquida - custoIA - custoManualMes;
  const margem = receitaLiquida > 0 ? lucroLiquido / receitaLiquida : 0;

  // Break-even: quantos assinantes cobrem o custo fixo do mês (custo manual)
  // + a fatia variável de IA por cliente, considerando a comissão da CAKTO
  // sobre cada nova assinatura.
  const margemPorCliente = PRECO_MENSAL * (1 - COMISSAO_CAKTO) - custoVariavelPorCliente;
  const breakEvenClientes = margemPorCliente > 0 ? Math.ceil(custoManualMes / margemPorCliente) : null;
  const clientesFaltam = breakEvenClientes != null ? Math.max(0, breakEvenClientes - totalAssinantes) : null;
  const lucroPositivo = lucroLiquido >= 0;

  const metaClientes = metas.find((m) => m.metrica === "clientes_pagos");
  const metaMrr = metas.find((m) => m.metrica === "mrr");

  async function lancarCusto(formData: FormData) {
    "use server";
    const categoria = String(formData.get("categoria") || "").trim();
    const descricao = String(formData.get("descricao") || "").trim();
    const valorTexto = String(formData.get("valor") || "0").replace(",", ".");
    const valor = Number(valorTexto);
    const mes = String(formData.get("mes") || mesAtualBrasil());

    if (!categoria || !Number.isFinite(valor) || valor <= 0) {
      redirect("/financeiro?erro=custo");
    }

    await prisma.custoMensal.create({
      data: { mes, categoria, descricao: descricao || null, valor },
    });
    redirect("/financeiro");
  }

  async function apagarCusto(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    if (!id) return;
    try {
      await prisma.custoMensal.delete({ where: { id } });
    } catch (err) {
      console.error("[FINANCEIRO] Erro ao apagar custo:", err);
    }
    redirect("/financeiro");
  }

  async function salvarMeta(formData: FormData) {
    "use server";
    const metrica = String(formData.get("metrica") || "");
    const valorTexto = String(formData.get("valorAlvo") || "0").replace(",", ".");
    const valorAlvo = Number(valorTexto);
    const dataAlvoTexto = String(formData.get("dataAlvo") || "");

    if (!ROTULO_METRICA[metrica] || !Number.isFinite(valorAlvo) || valorAlvo <= 0) {
      redirect("/financeiro?erro=meta");
    }

    await prisma.metaFinanceira.upsert({
      where: { metrica },
      update: { valorAlvo, dataAlvo: dataAlvoTexto ? new Date(`${dataAlvoTexto}T12:00:00`) : null },
      create: { metrica, valorAlvo, dataAlvo: dataAlvoTexto ? new Date(`${dataAlvoTexto}T12:00:00`) : null },
    });
    redirect("/financeiro");
  }

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Financeiro</h1>
          <p className="qa-page-subtitle">Receita, custos e lucro do QuitaZAP — {NOMES_MES[mesNum - 1]}/{ano}</p>
        </div>
      </div>

      <QaReveal className="qa-hero">
        <div>
          <p className="qa-hero-label" style={{ display: "flex", alignItems: "center", gap: 6 }}><IconTrendUp size={14} /> Lucro líquido do mês</p>
          <strong className="qa-hero-value" style={{ color: lucroPositivo ? undefined : "#fca5a5" }}>{fmt(lucroLiquido)}</strong>
          <p className="qa-hero-caption">Receita líquida {fmt(receitaLiquida)} · Custos {fmt(custoIA + custoManualMes)}</p>
        </div>
        <QaRing
          value={margem}
          color={lucroPositivo ? "#10b981" : "#ef4444"}
          label={`${Math.round(margem * 100)}%`}
        />
      </QaReveal>

      <div className="qa-stat-grid">
        <QaReveal className="qa-stat-card" delay={0}>
          <p className="qa-stat-label">Assinantes pagos</p>
          <strong className="qa-stat-value" style={{ color: "#6ee7b7" }}>{totalAssinantes}</strong>
          <p className="qa-stat-caption">+ {totalGratuitos} gratuito{totalGratuitos !== 1 ? "s" : ""} (não contabilizados)</p>
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.05}>
          <p className="qa-stat-label"><IconWallet size={13} /> Receita bruta/mês</p>
          <strong className="qa-stat-value">{fmt(receitaBruta)}</strong>
          <p className="qa-stat-caption">{totalAssinantes} × {fmt(PRECO_MENSAL)}</p>
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.1}>
          <p className="qa-stat-label">Comissão CAKTO (5,3%)</p>
          <strong className="qa-stat-value" style={{ color: "#fcd34d" }}>- {fmt(comissaoCakto)}</strong>
          <p className="qa-stat-caption">Descontado automaticamente</p>
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.15}>
          <p className="qa-stat-label"><IconTrendUp size={13} /> Lucro líquido/mês</p>
          <strong className="qa-stat-value" style={{ color: lucroPositivo ? "#6ee7b7" : "#fca5a5" }}>{fmt(lucroLiquido)}</strong>
          <p className="qa-stat-caption">Margem: {pct(margem)}</p>
        </QaReveal>
      </div>

      {breakEvenClientes != null && clientesFaltam !== null && clientesFaltam > 0 && (
        <div className="qa-alert qa-alert-amber">
          <IconAlertTriangle size={18} />
          <div>
            <strong style={{ display: "block" }}>Faltam {clientesFaltam} assinante(s) para o break-even</strong>
            <span style={{ opacity: 0.85 }}>Com {breakEvenClientes} assinantes você cobre todos os custos lançados este mês. Hoje você tem {totalAssinantes}.</span>
          </div>
        </div>
      )}

      {breakEvenClientes != null && clientesFaltam === 0 && totalAssinantes > 0 && (
        <div className="qa-alert qa-alert-emerald">
          <IconCheckCircle size={18} />
          <div>
            <strong style={{ display: "block" }}>No lucro!</strong>
            <span style={{ opacity: 0.85 }}>Você superou o break-even de {breakEvenClientes} assinantes.</span>
          </div>
        </div>
      )}

      {breakEvenClientes == null && custoManualMes === 0 && (
        <div className="qa-alert qa-alert-amber">
          <IconAlertTriangle size={18} />
          <div>
            <strong style={{ display: "block" }}>Nenhum custo lançado este mês</strong>
            <span style={{ opacity: 0.85 }}>Lance seus custos fixos (Z-API, domínio, hospedagem...) abaixo pra calcular o break-even certinho.</span>
          </div>
        </div>
      )}

      {breakEvenClientes == null && custoManualMes > 0 && (
        <div className="qa-alert qa-alert-red">
          <IconAlertTriangle size={18} />
          <div>
            <strong style={{ display: "block" }}>Break-even impossível no preço atual</strong>
            <span style={{ opacity: 0.85 }}>
              O custo médio de IA por cliente ({fmt(custoVariavelPorCliente)}) já é maior que o quanto sobra de cada assinatura
              ({fmt(PRECO_MENSAL * (1 - COMISSAO_CAKTO))}) — mais assinante nenhum cobre os custos fixos nesse ritmo.
              Vale rever o preço ou o custo de IA por cliente.
            </span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Custos do mês */}
        <div className="qa-card">
          <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>Custos — {NOMES_MES[mesNum - 1]}/{ano}</h2>

          <div className="qa-list-row">
            <span style={{ fontSize: 13.5, color: "var(--qa-gray-400)" }}>IA (uso real, automático)</span>
            <strong style={{ fontSize: 13.5 }}>{fmt(custoIA)}</strong>
          </div>
          <div className="qa-list-row">
            <span style={{ fontSize: 13.5, color: "var(--qa-gray-400)" }}>Comissão CAKTO (automático)</span>
            <strong style={{ fontSize: 13.5 }}>{fmt(comissaoCakto)}</strong>
          </div>

          {custosDoMes.length === 0 ? (
            <p className="qa-empty">Nenhum custo manual lançado este mês.</p>
          ) : (
            custosDoMes.map((c) => (
              <div key={c.id} className="qa-list-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5 }}>{c.categoria}</div>
                  {c.descricao && <div style={{ fontSize: 11.5, color: "var(--qa-gray-500)" }}>{c.descricao}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <strong style={{ fontSize: 13.5 }}>{fmt(c.valor)}</strong>
                  <ExcluirForm
                    action={apagarCusto}
                    mensagem={`Apagar o custo "${c.categoria}" (${fmt(c.valor)})?`}
                    label="apagar"
                    tamanho="pequeno"
                    fields={{ id: c.id }}
                    estiloBotao={excluirEstiloDark}
                  />
                </div>
              </div>
            ))
          )}

          <div className="qa-list-row" style={{ borderTop: "1px solid var(--qa-line)", marginTop: 4, fontWeight: 700 }}>
            <span>Custo total do mês</span>
            <span style={{ color: "#fca5a5" }}>{fmt(custoTotal)}</span>
          </div>

          <form action={lancarCusto} style={{ display: "grid", gap: 12, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--qa-line)" }}>
            <input type="hidden" name="mes" value={mesAtual} />
            <label className="qa-label">
              Categoria
              <input name="categoria" required placeholder="Ex: Z-API, Domínio, Hospedagem..." className="qa-input" />
            </label>
            <label className="qa-label">
              Valor (R$)
              <input name="valor" required placeholder="0,00" className="qa-input" />
            </label>
            <label className="qa-label">
              Descrição (opcional)
              <input name="descricao" className="qa-input" />
            </label>
            <button type="submit" className="qa-btn-primary">Lançar custo</button>
          </form>
        </div>

        {/* Meta */}
        <div className="qa-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <IconTarget size={16} />
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Meta</h2>
          </div>

          {[metaClientes, metaMrr].filter(Boolean).map((meta) => {
            const valorAtual = meta!.metrica === "clientes_pagos" ? totalAssinantes : receitaBruta;
            const progresso = meta!.valorAlvo > 0 ? Math.min(1, valorAtual / meta!.valorAlvo) : 0;
            return (
              <div key={meta!.metrica} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "var(--qa-gray-400)" }}>{ROTULO_METRICA[meta!.metrica]}</span>
                  <strong>
                    {meta!.metrica === "mrr" ? fmt(valorAtual) : valorAtual} / {meta!.metrica === "mrr" ? fmt(meta!.valorAlvo) : meta!.valorAlvo}
                  </strong>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progresso * 100}%`, background: "var(--qa-gradient)" }} />
                </div>
                {meta!.dataAlvo && (
                  <p style={{ fontSize: 11.5, color: "var(--qa-gray-500)", marginTop: 4 }}>
                    Meta até {new Intl.DateTimeFormat("pt-BR").format(new Date(meta!.dataAlvo))}
                  </p>
                )}
              </div>
            );
          })}

          {!metaClientes && !metaMrr && <p className="qa-empty">Nenhuma meta definida ainda.</p>}

          <form action={salvarMeta} style={{ display: "grid", gap: 12, marginTop: 8, paddingTop: 16, borderTop: "1px solid var(--qa-line)" }}>
            <label className="qa-label">
              Métrica
              <select name="metrica" required className="qa-input">
                <option value="clientes_pagos">Clientes pagos</option>
                <option value="mrr">MRR (receita mensal)</option>
              </select>
            </label>
            <label className="qa-label">
              Valor alvo
              <input name="valorAlvo" required placeholder="Ex: 50" className="qa-input" />
            </label>
            <label className="qa-label">
              Data alvo (opcional)
              <input name="dataAlvo" type="date" className="qa-input" />
            </label>
            <button type="submit" className="qa-btn-secondary">Salvar meta</button>
          </form>
        </div>
      </div>

      {/* Projeção */}
      <div className="qa-card">
        <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Projeção</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr>
                {["Assinantes", "Receita Bruta", "- CAKTO", "- Custos", "Lucro Líquido", "Margem"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "var(--qa-gray-400)", borderBottom: "1px solid var(--qa-line)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 3, 5, 10, 20, 50].map((n) => {
                const rb = n * PRECO_MENSAL;
                const ck = rb * COMISSAO_CAKTO;
                const cv = n * custoVariavelPorCliente;
                const ct = custoManualMes + cv;
                const ll = rb - ck - ct;
                const mg = rb - ck > 0 ? ll / (rb - ck) : 0;
                const isAtual = n === totalAssinantes;
                return (
                  <tr key={n} style={{ background: isAtual ? "rgba(0,123,255,0.08)" : "transparent" }}>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: isAtual ? 700 : 400 }}>
                      {n}{isAtual ? " ← atual" : ""}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>{fmt(rb)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center", color: "#fcd34d" }}>- {fmt(ck)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center", color: "#fca5a5" }}>- {fmt(ct)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: ll >= 0 ? "#6ee7b7" : "#fca5a5" }}>{fmt(ll)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center", color: ll >= 0 ? "#6ee7b7" : "#fca5a5" }}>{pct(mg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--qa-gray-500)", marginTop: 12 }}>
          Considera o custo fixo lançado este mês ({fmt(custoManualMes)}) + custo médio de IA por cliente ativo ({fmt(custoVariavelPorCliente)}).
        </p>
      </div>
    </div>
  );
}
