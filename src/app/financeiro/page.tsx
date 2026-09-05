// ─────────────────────────────────────────
// QuitaZAP — Página Financeiro
// /financeiro
// ─────────────────────────────────────────
// Painel executivo do SaaS: MRR, base ativa, churn, crescimento, custos e
// resultado operacional do negócio — nunca dado financeiro pessoal do
// cliente final (isso é escopo do admin de Clientes/Assinaturas, ver
// decisão do Ibrahim documentada em src/lib/status-assinatura.ts).

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ExcluirForm } from "@/components/ExcluirForm";
import { IconWallet, IconTrendUp, IconTrendDown, IconTarget, IconCheckCircle, IconAlertTriangle, IconUsers } from "@/components/icons";
import { QaReveal } from "@/components/QaReveal";
import { QaTrendChart } from "@/components/QaTrendChart";
import { QaFlowChart } from "@/components/QaFlowChart";
import { calcularDreAdmin, mesAtualBrasil, PRECO_MENSAL, COMISSAO_CAKTO } from "@/lib/financeiro-admin/motor";
import { calcularMetricasNegocio } from "@/lib/financeiro-admin/metricas-negocio";

export const dynamic = "force-dynamic";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

function pctDireto(v: number) {
  return v.toFixed(1) + "%";
}

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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

/** Badge de variação vs. mês anterior. `invertido` = métrica em que
 * "menor é melhor" (cancelamentos, reembolsos) — inverte a cor do sinal. */
function DeltaBadge({ atual, anterior, invertido = false }: { atual: number; anterior: number; invertido?: boolean }) {
  const diff = atual - anterior;
  if (diff === 0) {
    return <span style={{ fontSize: 11.5, color: "var(--qa-gray-500)" }}>= vs. mês anterior</span>;
  }
  const positivo = invertido ? diff < 0 : diff > 0;
  const Icone = diff > 0 ? IconTrendUp : IconTrendDown;
  return (
    <span style={{ fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 3, color: positivo ? "#6ee7b7" : "#fca5a5" }}>
      <Icone size={11} /> {diff > 0 ? "+" : ""}{diff} vs. mês anterior
    </span>
  );
}

export default async function FinanceiroPage() {
  const mesAtual = mesAtualBrasil();
  const [ano, mesNum] = mesAtual.split("-").map(Number);

  // Motor DRE Admin (receita/custo/resultado do mês) + métricas de negócio
  // (MRR, churn, movimento da base) — duas fontes complementares, cada uma
  // com seu próprio contrato documentado (motor-contrato.ts e o topo de
  // metricas-negocio.ts). /painel consome o mesmo motor DRE.
  const [dre, metricas, custosDoMes, metas] = await Promise.all([
    calcularDreAdmin(mesAtual),
    calcularMetricasNegocio(mesAtual),
    prisma.custoMensal.findMany({ where: { mes: mesAtual }, orderBy: { criadoEm: "asc" } }),
    prisma.metaFinanceira.findMany(),
  ]);

  const {
    totalAssinantes,
    totalGratuitos,
    receitaBruta,
    receitaFonte,
    comissaoCakto,
    receitaLiquida,
    custoIA,
    custoManual: custoManualMes,
    resultadoOperacional,
    margem,
  } = dre;
  const totalClientesAtivos = totalAssinantes + totalGratuitos;
  const custoTotal = comissaoCakto + custoIA + custoManualMes;
  const custoVariavelPorCliente = totalClientesAtivos > 0 ? custoIA / totalClientesAtivos : 0;
  const custoMedioPorAssinante = totalAssinantes > 0 ? custoTotal / totalAssinantes : 0;
  const margemOperacionalPorAssinante = totalAssinantes > 0 ? resultadoOperacional / totalAssinantes : 0;

  // Break-even: quantos assinantes cobrem o custo fixo do mês (custo manual)
  // + a fatia variável de IA por cliente, considerando a comissão da CAKTO
  // sobre cada nova assinatura.
  const margemPorCliente = PRECO_MENSAL * (1 - COMISSAO_CAKTO) - custoVariavelPorCliente;
  const breakEvenClientes = margemPorCliente > 0 ? Math.ceil(custoManualMes / margemPorCliente) : null;
  const clientesFaltam = breakEvenClientes != null ? Math.max(0, breakEvenClientes - totalAssinantes) : null;
  const resultadoPositivo = resultadoOperacional >= 0;

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
          <p className="qa-page-subtitle">Saúde financeira do QuitaZAP — {NOMES_MES[mesNum - 1]}/{ano}</p>
        </div>
      </div>

      {receitaFonte === "ESTIMADA" && (
        <div className="qa-alert qa-alert-amber" style={{ marginBottom: 14 }}>
          <IconAlertTriangle size={18} />
          <div>
            <strong style={{ display: "block" }}>Receita estimada, não observada</strong>
            <span style={{ opacity: 0.85 }}>
              Nenhum pagamento real da Cakto com valor identificado neste mês ainda — a receita abaixo é contagem de
              assinantes × {fmt(PRECO_MENSAL)}, não o valor de fato recebido.
            </span>
          </div>
        </div>
      )}

      {metricas.alertas.map((alerta) => (
        <div key={alerta} className="qa-alert qa-alert-amber" style={{ marginBottom: 14 }}>
          <IconAlertTriangle size={18} />
          <span>{alerta}</span>
        </div>
      ))}

      <QaReveal className="qa-hero">
        <div>
          <p className="qa-hero-label" style={{ display: "flex", alignItems: "center", gap: 6 }}><IconWallet size={14} /> MRR — receita mensal recorrente</p>
          <strong className="qa-hero-value">{fmt(metricas.mrrAtual)}</strong>
          <p className="qa-hero-caption">
            {metricas.ativos} assinante{metricas.ativos !== 1 ? "s" : ""} ativo{metricas.ativos !== 1 ? "s" : ""}
            {metricas.crescimentoMrrPct != null && (
              <> · {metricas.crescimentoMrrPct >= 0 ? "+" : ""}{pctDireto(metricas.crescimentoMrrPct)} vs. mês anterior</>
            )}
          </p>
        </div>
        <div className="qa-hero-chart">
          <QaTrendChart data={metricas.serieMensal} dataKey="mrr" labelKey="rotulo" color="#00bfff" />
        </div>
      </QaReveal>

      <p style={{ margin: "20px 0 10px", fontSize: 11.5, fontWeight: 700, color: "var(--qa-gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Visão do mês
      </p>
      <div className="qa-stat-grid">
        <QaReveal className="qa-stat-card" delay={0}>
          <p className="qa-stat-label"><IconWallet size={13} /> Receita recebida no mês</p>
          <strong className="qa-stat-value">{fmt(receitaBruta)}</strong>
          <p className="qa-stat-caption">{receitaFonte === "OBSERVADA" ? "valor real recebido (Cakto)" : "estimado (sem pagamento observado)"}</p>
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.05}>
          <p className="qa-stat-label"><IconUsers size={13} /> Assinantes ativos</p>
          <strong className="qa-stat-value" style={{ color: "#6ee7b7" }}>{metricas.ativos}</strong>
          <p className="qa-stat-caption">+ {totalGratuitos} lead{totalGratuitos !== 1 ? "s" : ""} gratuito{totalGratuitos !== 1 ? "s" : ""} (não pagante)</p>
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.1}>
          <p className="qa-stat-label">Churn do mês</p>
          <strong className="qa-stat-value" style={{ color: metricas.churnVariacaoPP > 0 ? "#fca5a5" : "#6ee7b7" }}>{pctDireto(metricas.churnPct)}</strong>
          <p className="qa-stat-caption">{metricas.cancelamentos} cancelamento{metricas.cancelamentos !== 1 ? "s" : ""} este mês</p>
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.15}>
          <p className="qa-stat-label"><IconTrendUp size={13} /> Resultado operacional/mês</p>
          <strong className="qa-stat-value" style={{ color: resultadoPositivo ? "#6ee7b7" : "#fca5a5" }}>{fmt(resultadoOperacional)}</strong>
          <p className="qa-stat-caption">Margem: {pct(margem ?? 0)}</p>
        </QaReveal>
      </div>

      <p style={{ margin: "20px 0 10px", fontSize: 11.5, fontWeight: 700, color: "var(--qa-gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Movimento da base — vs. mês anterior
      </p>
      <div className="qa-stat-grid">
        <QaReveal className="qa-stat-card" delay={0}>
          <p className="qa-stat-label">Novos assinantes</p>
          <strong className="qa-stat-value" style={{ color: "#6ee7b7" }}>{metricas.novosAssinantes}</strong>
          <DeltaBadge atual={metricas.novosAssinantes} anterior={metricas.novosAssinantesMesAnterior} />
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.05}>
          <p className="qa-stat-label">Cancelamentos</p>
          <strong className="qa-stat-value" style={{ color: "#fca5a5" }}>{metricas.cancelamentos}</strong>
          <DeltaBadge atual={metricas.cancelamentos} anterior={metricas.cancelamentosMesAnterior} invertido />
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.1}>
          <p className="qa-stat-label">Reativações</p>
          <strong className="qa-stat-value" style={{ color: "#7dc4ff" }}>{metricas.reativacoes}</strong>
          <DeltaBadge atual={metricas.reativacoes} anterior={metricas.reativacoesMesAnterior} />
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.15}>
          <p className="qa-stat-label">Reembolsos / chargebacks</p>
          <strong className="qa-stat-value" style={{ color: "#fcd34d" }}>{metricas.eventosProblema}</strong>
          <DeltaBadge atual={metricas.eventosProblema} anterior={metricas.eventosProblemaMesAnterior} invertido />
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.2}>
          <p className="qa-stat-label">Leads gratuitos (total)</p>
          <strong className="qa-stat-value">{metricas.inativosTotal}</strong>
          <DeltaBadge atual={metricas.inativosTotal} anterior={metricas.inativosTotalMesAnterior} />
        </QaReveal>
      </div>
      <p style={{ margin: "-8px 0 20px", fontSize: 11.5, color: "var(--qa-gray-500)" }}>
        &quot;Pagamento pendente/falho&quot; ainda não entra aqui — falta confirmar com a Cakto o nome exato do evento de recusa/pendência de pagamento; hoje o webhook só distingue aprovação, reembolso, cancelamento e chargeback.
      </p>

      <div className="qa-grid-2col">
        <div className="qa-card">
          <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>MRR — últimos 12 meses</h2>
          <div style={{ width: "100%", height: 220 }}>
            <QaTrendChart data={metricas.serieMensal} dataKey="mrr" labelKey="rotulo" color="#00bfff" />
          </div>
        </div>
        <div className="qa-card">
          <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>Novos vs. cancelados por mês</h2>
          <div style={{ width: "100%", height: 220 }}>
            <QaFlowChart data={metricas.serieMensal} labelKey="rotulo" />
          </div>
        </div>
      </div>

      <p style={{ margin: "20px 0 10px", fontSize: 11.5, fontWeight: 700, color: "var(--qa-gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Indicadores
      </p>
      <div className="qa-stat-grid">
        <QaReveal className="qa-stat-card" delay={0}>
          <p className="qa-stat-label">ARPU</p>
          <strong className="qa-stat-value">{fmt(metricas.arpu)}</strong>
          <p className="qa-stat-caption">Receita recorrente / assinante ativo</p>
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.05}>
          <p className="qa-stat-label">Custo médio / assinante</p>
          <strong className="qa-stat-value">{fmt(custoMedioPorAssinante)}</strong>
          <p className="qa-stat-caption">Comissão + IA + custos manuais do mês</p>
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.1}>
          <p className="qa-stat-label">Margem operacional / assinante</p>
          <strong className="qa-stat-value" style={{ color: margemOperacionalPorAssinante >= 0 ? "#6ee7b7" : "#fca5a5" }}>{fmt(margemOperacionalPorAssinante)}</strong>
          <p className="qa-stat-caption">Resultado operacional / assinante ativo</p>
        </QaReveal>
        <QaReveal className="qa-stat-card" delay={0.15}>
          <p className="qa-stat-label">Receita perdida em cancelamentos</p>
          <strong className="qa-stat-value" style={{ color: "#fca5a5" }}>{fmt(metricas.receitaPerdidaCancelamentos)}</strong>
          <p className="qa-stat-caption">MRR perdido este mês</p>
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

      <div className="qa-grid-2col">
        {/* Custos do mês */}
        <div className="qa-card">
          <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>DRE — {NOMES_MES[mesNum - 1]}/{ano}</h2>

          <div className="qa-list-row">
            <span style={{ fontSize: 13.5, color: "var(--qa-gray-400)" }}>Receita líquida (após comissão CAKTO)</span>
            <strong style={{ fontSize: 13.5 }}>{fmt(receitaLiquida)}</strong>
          </div>
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
                {["Assinantes", "Receita Bruta", "- CAKTO", "- Custos", "Resultado Operacional", "Margem"].map((h) => (
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
