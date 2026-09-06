// ─────────────────────────────────────────
// QuitaZAP — Marketing (projeção de investimento em Ads)
// /marketing
// ─────────────────────────────────────────
// Pedido do Ibrahim (2026-09-06, especificação revisada com o ChatGPT):
// projetar meses de investimento em Instagram Ads (CAC, MRR, resultado) e
// depois comparar projetado x real. Preço, taxa da Cakto, custo de IA por
// cliente e infraestrutura mensal vêm sempre do motor financeiro central
// (financeiro-admin/motor.ts) — nunca redigitados aqui, pra nunca
// dessincronizar do resto do sistema. Toda a aritmética mora em
// src/lib/marketing/motor-marketing.ts (puro, testável sem banco).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { IconMegaphone, IconAlertTriangle } from "@/components/icons";
import { calcularDreAdmin, mesAtualBrasil, PRECO_MENSAL, COMISSAO_CAKTO } from "@/lib/financeiro-admin/motor";
import { calcularMetricasNegocio } from "@/lib/financeiro-admin/metricas-negocio";
import {
  projetarMarketing,
  avaliarEscalaControlada,
  calcularPaybackMeses,
  type ParametrosMotorFinanceiro,
  type NivelEscala,
} from "@/lib/marketing/motor-marketing";

export const dynamic = "force-dynamic";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtNum(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}
function fmtMeses(v: number | null) {
  return v == null ? "—" : `${v.toFixed(1)} ${v === 1 ? "mês" : "meses"}`;
}

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function rotuloMes(mes: string): string {
  const [ano, mesNum] = mes.split("-").map(Number);
  return `${NOMES_MES[mesNum - 1]}/${ano}`;
}

const COR_NIVEL: Record<NivelEscala, { bg: string; color: string; border: string; emoji: string; label: string }> = {
  VERDE: { bg: "rgba(16,185,129,0.12)", color: "#6ee7b7", border: "rgba(16,185,129,0.25)", emoji: "🟢", label: "Pode escalar" },
  AMARELO: { bg: "rgba(250,204,21,0.12)", color: "#fcd34d", border: "rgba(250,204,21,0.25)", emoji: "🟡", label: "Manter" },
  VERMELHO: { bg: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "rgba(239,68,68,0.25)", emoji: "🔴", label: "Não escalar" },
};

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  const mesAtual = mesAtualBrasil();

  const [dreAtual, parametrosSalvos, mesesReais] = await Promise.all([
    calcularDreAdmin(mesAtual),
    prisma.marketingParametros.findFirst(),
    prisma.marketingMesReal.findMany({ orderBy: { mes: "asc" } }),
  ]);

  const totalClientesAtivos = dreAtual.totalAssinantes + dreAtual.totalGratuitos;
  // Custo de IA por cliente ativo — mesmo cálculo de /financeiro. Separado
  // de propósito da infraestrutura fixa abaixo (nunca somar como se fosse
  // a mesma coisa — evita contar OpenAI duas vezes).
  const custoIAPorClienteAtivo = totalClientesAtivos > 0 ? dreAtual.custoIA / totalClientesAtivos : 0;

  const motor: ParametrosMotorFinanceiro = {
    precoMensal: PRECO_MENSAL,
    comissaoCakto: COMISSAO_CAKTO,
    custoIAPorClienteAtivo,
    infraestruturaMensal: dreAtual.custoManual,
  };

  const parametros = {
    investimentoInicialMensal: parametrosSalvos?.investimentoInicialMensal ?? 1000,
    cacProjetado: parametrosSalvos?.cacProjetado ?? 25,
    churnMensal: parametrosSalvos?.churnMensal ?? 0.15,
    horizonteMeses: parametrosSalvos?.horizonteMeses ?? 12,
  };

  const linhas = projetarMarketing(
    {
      ativosIniciais: dreAtual.totalAssinantes,
      investimentoMensal: parametros.investimentoInicialMensal,
      cacProjetado: parametros.cacProjetado,
      churnMensal: parametros.churnMensal,
      horizonteMeses: parametros.horizonteMeses,
      mesInicialCalendario: mesAtual,
    },
    motor
  );
  const ultimaLinha = linhas[linhas.length - 1];

  const temDadosReais = mesesReais.length > 0;
  const mesRealMaisRecente = temDadosReais ? mesesReais[mesesReais.length - 1] : null;

  // Churn real de CADA mês informado (não só o mais recente) — reaproveita
  // calcularMetricasNegocio, que já calcula isso com precisão a partir de
  // Cliente/EventoCakto reais, pra exibir na tabela Real x Projetado sem
  // pedir esse número de novo ao Ibrahim.
  const churnPorMesReal = new Map<string, number>();
  if (temDadosReais) {
    const metricasPorMes = await Promise.all(mesesReais.map((m) => calcularMetricasNegocio(m.mes)));
    mesesReais.forEach((m, i) => churnPorMesReal.set(m.mes, metricasPorMes[i].churnPct / 100));
  }

  let avaliacao: ReturnType<typeof avaliarEscalaControlada> | null = null;
  if (mesRealMaisRecente) {
    const dreDoMesReal = await calcularDreAdmin(mesRealMaisRecente.mes);
    // Resultado operacional real do mês da campanha: receita líquida real
    // (Cakto observada) menos infraestrutura real menos o investimento em
    // Ads desse mês — investimento em Ads NUNCA entra em CustoMensal
    // (infraestrutura), fica só rastreado aqui, pra não contar duas vezes.
    const resultadoOperacionalReal = dreDoMesReal.receitaLiquida - dreDoMesReal.custoManual - mesRealMaisRecente.investimentoReal;

    const indiceAtual = mesesReais.findIndex((m) => m.mes === mesRealMaisRecente.mes);
    const mesRealAnterior = indiceAtual > 0 ? mesesReais[indiceAtual - 1] : null;
    const investimentoAnterior = mesRealAnterior?.investimentoReal ?? mesRealMaisRecente.investimentoReal;

    avaliacao = avaliarEscalaControlada({
      dados: { investimentoReal: mesRealMaisRecente.investimentoReal, novasAssinaturasPagas: mesRealMaisRecente.novasAssinaturasPagas },
      churnRealFracao: churnPorMesReal.get(mesRealMaisRecente.mes) ?? null,
      churnMetaFracao: parametros.churnMensal,
      resultadoOperacionalDoMes: resultadoOperacionalReal,
      investimentoAnterior,
      motor,
    });
  }

  const cacExibido = avaliacao ? avaliacao.cacReal : parametros.cacProjetado;
  const paybackExibido = avaliacao ? avaliacao.paybackMeses : calcularPaybackMeses(parametros.cacProjetado, motor);

  async function salvarParametros(formData: FormData) {
    "use server";
    const investimentoInicialMensal = Number(formData.get("investimentoInicialMensal"));
    const cacProjetado = Number(formData.get("cacProjetado"));
    const churnPercentual = Number(formData.get("churnPercentual"));
    const horizonteMeses = Number(formData.get("horizonteMeses"));

    const data = {
      investimentoInicialMensal: Number.isFinite(investimentoInicialMensal) && investimentoInicialMensal >= 0 ? investimentoInicialMensal : 1000,
      cacProjetado: Number.isFinite(cacProjetado) && cacProjetado > 0 ? cacProjetado : 25,
      churnMensal: Number.isFinite(churnPercentual) && churnPercentual >= 0 ? churnPercentual / 100 : 0.15,
      horizonteMeses: Number.isInteger(horizonteMeses) && horizonteMeses > 0 && horizonteMeses <= 36 ? horizonteMeses : 12,
    };

    const existente = await prisma.marketingParametros.findFirst();
    if (existente) {
      await prisma.marketingParametros.update({ where: { id: existente.id }, data });
    } else {
      await prisma.marketingParametros.create({ data });
    }
    revalidatePath("/marketing");
    redirect("/marketing?ok=parametros");
  }

  async function salvarMesReal(formData: FormData) {
    "use server";
    const mes = String(formData.get("mes") ?? "");
    const investimentoReal = Number(formData.get("investimentoReal"));
    const novasAssinaturasPagas = Number(formData.get("novasAssinaturasPagas"));

    if (!/^\d{4}-\d{2}$/.test(mes) || !Number.isFinite(investimentoReal) || investimentoReal < 0 || !Number.isInteger(novasAssinaturasPagas) || novasAssinaturasPagas < 0) {
      redirect("/marketing?ok=erro");
    }

    await prisma.marketingMesReal.upsert({
      where: { mes },
      update: { investimentoReal, novasAssinaturasPagas },
      create: { mes, investimentoReal, novasAssinaturasPagas },
    });
    revalidatePath("/marketing");
    redirect("/marketing?ok=mesreal");
  }

  const mensagemOk: Record<string, string> = {
    parametros: "Parâmetros da projeção atualizados!",
    mesreal: "Dado real do mês salvo!",
    erro: "Não deu pra salvar — confira os valores.",
  };

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title"><IconMegaphone size={22} style={{ marginRight: 8, verticalAlign: "-3px" }} /> Marketing</h1>
          <p className="qa-page-subtitle">Projeção de investimento em Ads e comparação com o que aconteceu de verdade.</p>
        </div>
      </div>

      {ok && mensagemOk[ok] && (
        <div className="qa-card" style={{ marginBottom: 16, borderColor: ok === "erro" ? "rgba(239,68,68,0.3)" : undefined, color: ok === "erro" ? "#fca5a5" : "#6ee7b7" }}>
          {mensagemOk[ok]}
        </div>
      )}

      {/* Parâmetros da projeção */}
      <div className="qa-card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>Parâmetros da projeção</h2>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--qa-gray-400)" }}>
          Preço (R$ {PRECO_MENSAL.toFixed(2).replace(".", ",")}), comissão da Cakto ({pct(COMISSAO_CAKTO)}), custo de IA por cliente e infraestrutura vêm do motor financeiro — não são editáveis aqui.
        </p>
        <form action={salvarParametros} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
            Investimento mensal (R$)
            <input type="number" name="investimentoInicialMensal" min={0} step="0.01" defaultValue={parametros.investimentoInicialMensal} className="qa-input" style={{ width: 150 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
            CAC projetado (R$)
            <input type="number" name="cacProjetado" min={0.01} step="0.01" defaultValue={parametros.cacProjetado} className="qa-input" style={{ width: 130 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
            Churn mensal (%)
            <input type="number" name="churnPercentual" min={0} max={100} step="0.1" defaultValue={(parametros.churnMensal * 100).toFixed(1)} className="qa-input" style={{ width: 110 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
            Horizonte (meses)
            <input type="number" name="horizonteMeses" min={1} max={36} step="1" defaultValue={parametros.horizonteMeses} className="qa-input" style={{ width: 100 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
            Estratégia de escala
            <select disabled className="qa-input" style={{ width: 170, opacity: 0.7 }}>
              <option>Escala Controlada</option>
            </select>
          </label>
          <button type="submit" className="qa-btn-primary">Salvar parâmetros</button>
        </form>
      </div>

      {/* Cards executivos */}
      <div className="qa-stat-grid" style={{ marginBottom: 20 }}>
        <div className="qa-stat-card">
          <p className="qa-stat-label">CAC {avaliacao ? "real" : "projetado"}</p>
          <strong className="qa-stat-value">{fmt(cacExibido)}</strong>
          <p className="qa-stat-caption">{avaliacao ? `mês de ${rotuloMes(mesRealMaisRecente!.mes)}` : "sem dado real ainda"}</p>
        </div>
        <div className="qa-stat-card">
          <p className="qa-stat-label">Payback estimado</p>
          <strong className="qa-stat-value">{fmtMeses(paybackExibido)}</strong>
          <p className="qa-stat-caption">CAC ÷ margem de contribuição/assinante</p>
        </div>
        <div className="qa-stat-card">
          <p className="qa-stat-label">Assinantes ativos (fim do horizonte)</p>
          <strong className="qa-stat-value">{fmtNum(ultimaLinha.ativosFim)}</strong>
          <p className="qa-stat-caption">em {rotuloMes(ultimaLinha.mesCalendario)}</p>
        </div>
        <div className="qa-stat-card">
          <p className="qa-stat-label">MRR (fim do horizonte)</p>
          <strong className="qa-stat-value">{fmt(ultimaLinha.mrr)}</strong>
          <p className="qa-stat-caption">em {rotuloMes(ultimaLinha.mesCalendario)}</p>
        </div>
        <div className="qa-stat-card">
          <p className="qa-stat-label">Resultado operacional acumulado</p>
          <strong className="qa-stat-value" style={{ color: ultimaLinha.resultadoAcumulado >= 0 ? "#6ee7b7" : "#fca5a5" }}>{fmt(ultimaLinha.resultadoAcumulado)}</strong>
          <p className="qa-stat-caption">ainda sem abater impostos/contador</p>
        </div>
      </div>

      {!temDadosReais ? (
        <div className="qa-card" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start", borderColor: "rgba(250,204,21,0.3)" }}>
          <IconAlertTriangle size={18} style={{ color: "#fcd34d", flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 13.5 }}>Baseado nas premissas informadas — ainda sem dados reais de campanha.</p>
        </div>
      ) : (
        avaliacao && (
          <div className="qa-card" style={{ marginBottom: 20, background: COR_NIVEL[avaliacao.nivel].bg, border: `1px solid ${COR_NIVEL[avaliacao.nivel].border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 28 }}>{COR_NIVEL[avaliacao.nivel].emoji}</span>
              <div>
                <strong style={{ fontSize: 16, color: COR_NIVEL[avaliacao.nivel].color }}>{COR_NIVEL[avaliacao.nivel].label}</strong>
                <span style={{ display: "block", fontSize: 12, color: "var(--qa-gray-400)" }}>Decisão pra {rotuloMes(mesesReais[mesesReais.length - 1] ? proximoMesRotulo(mesesReais[mesesReais.length - 1].mes) : mesAtual)}</span>
              </div>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 13.5 }}>{avaliacao.motivo}</p>
            <p style={{ margin: 0, fontSize: 13 }}>
              Investimento sugerido pro próximo mês: <strong>{fmt(avaliacao.investimentoSugerido)}</strong>
            </p>
          </div>
        )
      )}

      {/* Real x Projetado */}
      {temDadosReais && (
        <div className="qa-card" style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Real x Projetado</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Mês", "Investimento (real)", "Investimento (proj.)", "CAC (real)", "CAC (proj.)", "Novos pagos (real)", "Churn (real)"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: "var(--qa-gray-400)", borderBottom: "1px solid var(--qa-line)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mesesReais.map((real) => {
                  const linhaProjetada = linhas.find((l) => l.mesCalendario === real.mes);
                  const cacRealDoMes = real.novasAssinaturasPagas > 0 ? real.investimentoReal / real.novasAssinaturasPagas : null;
                  const churnRealDoMes = churnPorMesReal.get(real.mes);
                  return (
                    <tr key={real.mes}>
                      <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600 }}>{rotuloMes(real.mes)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>{fmt(real.investimentoReal)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--qa-gray-500)" }}>{linhaProjetada ? fmt(linhaProjetada.investimentoAds) : "—"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>{cacRealDoMes != null ? fmt(cacRealDoMes) : "—"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--qa-gray-500)" }}>{linhaProjetada ? fmt(linhaProjetada.cac) : "—"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>{real.novasAssinaturasPagas}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>{churnRealDoMes != null ? pct(churnRealDoMes) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Informar mês real */}
      <div className="qa-card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>Informar mês real de campanha</h2>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--qa-gray-400)" }}>
          Sem integração automática com Instagram/Meta Ads ainda — informe quanto gastou de fato e quantas assinaturas pagas confirmadas pela Cakto entraram naquele mês.
        </p>
        <form action={salvarMesReal} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
            Mês
            <input type="month" name="mes" defaultValue={mesAtual} className="qa-input" style={{ width: 160 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
            Investimento real (R$)
            <input type="number" name="investimentoReal" min={0} step="0.01" placeholder="Ex: 1000" className="qa-input" style={{ width: 160 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
            Novas assinaturas pagas (Cakto)
            <input type="number" name="novasAssinaturasPagas" min={0} step="1" placeholder="Ex: 40" className="qa-input" style={{ width: 220 }} />
          </label>
          <button type="submit" className="qa-btn-primary">Salvar mês real</button>
        </form>
      </div>

      {/* Tabela de projeção */}
      <div className="qa-card">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>Projeção — {parametros.horizonteMeses} meses</h2>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--qa-gray-400)" }}>
          Investimento constante de {fmt(parametros.investimentoInicialMensal)}/mês, CAC de {fmt(parametros.cacProjetado)} e churn de {pct(parametros.churnMensal)} — "se nada mudar a partir de hoje".
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Mês", "Investimento", "CAC", "Novos pagos", "Cancelados", "Ativos finais", "MRR", "Receita líquida", "Infraestrutura", "Resultado operacional", "Acumulado"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: "var(--qa-gray-400)", borderBottom: "1px solid var(--qa-line)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.mes} style={{ background: linha.mesCalendario === mesAtual ? "rgba(0,123,255,0.08)" : "transparent" }}>
                  <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: linha.mesCalendario === mesAtual ? 700 : 400 }}>{rotuloMes(linha.mesCalendario)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{fmt(linha.investimentoAds)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{fmt(linha.cac)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{fmtNum(linha.novosPagos)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center", color: "#fcd34d" }}>{fmtNum(linha.cancelados)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600 }}>{fmtNum(linha.ativosFim)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{fmt(linha.mrr)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{fmt(linha.receitaLiquida)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center", color: "#fca5a5" }}>- {fmt(linha.infraestrutura)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: linha.resultadoOperacional >= 0 ? "#6ee7b7" : "#fca5a5" }}>{fmt(linha.resultadoOperacional)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: linha.resultadoAcumulado >= 0 ? "#6ee7b7" : "#fca5a5" }}>{fmt(linha.resultadoAcumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function proximoMesRotulo(mes: string): string {
  const [ano, mesNum] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mesNum, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
