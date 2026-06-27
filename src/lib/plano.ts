// ─────────────────────────────────────────
// QuitaZAP — Gerador de Relatório Financeiro
// ─────────────────────────────────────────

import type { DiagnosticoIA } from "./ai-bot";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(v: number, total: number): string {
  if (!total) return "0%";
  return `${((v / total) * 100).toFixed(0)}%`;
}

// ── Mantém compatibilidade com código antigo ─
export type DividaTemp = {
  texto: string;
  valor: number;
  parcelas: number;
  valorParcela?: number;
  diaVencimento?: number;
  diaFechamento?: number;
  emAtraso?: boolean;
  mesesAtraso?: number;
};

export function gerarMensagemPlano(nome: string, dividas: DividaTemp[], renda: number): string {
  return gerarRelatorio({
    dadosPessoais: { nome },
    renda: { salarioLiquido: renda, totalFamiliar: renda },
    despesasFixas: [],
    despesasVariaveis: [],
    dividas: dividas.map((d) => ({
      credor: d.texto,
      tipo: "OUTRO" as const,
      valorOriginal: d.valor,
      saldoAtual: d.valor,
      valorParcela: d.valorParcela ?? d.valor / (d.parcelas || 1),
      parcelasRestantes: d.parcelas || 1,
      diaVencimento: d.diaVencimento,
      emAtraso: d.emAtraso ?? false,
      diasAtraso: (d.mesesAtraso ?? 0) * 30,
    })),
    cartoes: [],
    emprestimos: [],
    patrimonio: {},
    objetivos: {},
    alertas: {},
  });
}

// ── Relatório principal ───────────────────
export function gerarRelatorio(diag: DiagnosticoIA): string {
  const nome = diag.dadosPessoais?.nome ?? "cliente";
  const renda = diag.renda?.totalFamiliar ?? diag.renda?.salarioLiquido ?? 0;

  // ── Despesas fixas
  const totalFixo = (diag.despesasFixas ?? []).reduce((s, d) => s + d.valor, 0);
  const totalVariavel = (diag.despesasVariaveis ?? []).reduce((s, d) => s + d.valor, 0);

  // ── Dívidas
  const dividas = diag.dividas ?? [];
  const cartoes = diag.cartoes ?? [];
  const emprestimos = diag.emprestimos ?? [];

  const totalDividas = dividas.reduce((s, d) => s + (d.saldoAtual ?? 0), 0);
  const totalParcelas = dividas.reduce((s, d) => s + (d.valorParcela ?? 0), 0);
  const totalFaturas = cartoes.reduce((s, c) => s + (c.faturaAtual ?? 0), 0);

  const comprometidoMes = totalParcelas + totalFaturas;
  const comprometimento = renda > 0 ? (comprometidoMes / renda) * 100 : 0;
  const sobra = renda - totalFixo - totalVariavel - comprometidoMes;

  // Nível de risco
  const nivelRisco =
    comprometimento > 70 ? "🔴 CRÍTICO"
    : comprometimento > 50 ? "🟠 ALTO"
    : comprometimento > 30 ? "🟡 ATENÇÃO"
    : "🟢 CONTROLADO";

  // Alertas
  const alertas = diag.alertas ?? {};
  const temAlerta = Object.values(alertas).some(Boolean);

  // Dívidas em atraso
  const emAtraso = dividas.filter((d) => d.emAtraso);

  // Ordenação por prioridade: em atraso primeiro, depois por maior juros, depois por maior valor
  const ordenadas = [...dividas].sort((a, b) => {
    if (a.emAtraso && !b.emAtraso) return -1;
    if (!a.emAtraso && b.emAtraso) return 1;
    if ((b.juros ?? 0) !== (a.juros ?? 0)) return (b.juros ?? 0) - (a.juros ?? 0);
    return (b.saldoAtual ?? 0) - (a.saldoAtual ?? 0);
  });

  // Meses para quitar (bola de neve)
  const mesesParaQuitar = dividas.length > 0
    ? Math.max(...dividas.map((d) => d.parcelasRestantes || 1))
    : 0;
  const dataQuitacao = new Date();
  dataQuitacao.setMonth(dataQuitacao.getMonth() + mesesParaQuitar);
  const mesQuitacao = dataQuitacao.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Data atual
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const mesAtual = hoje.toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();

  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

  // ── SEÇÃO: O QUE PAGAR ESTE MÊS ─────────
  const dividasComVenc = ordenadas.filter((d) => d.diaVencimento);
  const dividasSemVenc = ordenadas.filter((d) => !d.diaVencimento);

  const listaMes = [
    ...dividasComVenc.sort((a, b) => {
      const vA = a.diaVencimento! >= diaHoje ? a.diaVencimento! : a.diaVencimento! + 31;
      const vB = b.diaVencimento! >= diaHoje ? b.diaVencimento! : b.diaVencimento! + 31;
      return vA - vB;
    }).map((d, i) => {
      const diasRestantes = d.diaVencimento! >= diaHoje
        ? d.diaVencimento! - diaHoje
        : (31 - diaHoje) + d.diaVencimento!;
      const urgencia = diasRestantes <= 3 ? "⚠️ *URGENTE* — " : diasRestantes <= 7 ? "⏰ Esta semana — " : "";
      const atrasoTag = d.emAtraso ? ` 🚨 *EM ATRASO*${d.diasAtraso ? ` (${d.diasAtraso} dias)` : ""}` : "";
      const desconto = d.descontoAVista ? `\n   💡 Desconto para quitar à vista${d.valorParaQuitar ? `: R$ ${fmt(d.valorParaQuitar)}` : ""}` : "";
      return `${emojis[i] ?? "•"} *${d.credor}*${atrasoTag}\n   ${urgencia}Pagar *R$ ${fmt(d.valorParcela)}* até dia *${d.diaVencimento}*${desconto}`;
    }),
    ...dividasSemVenc.map((d, i) => {
      const atrasoTag = d.emAtraso ? ` 🚨 *EM ATRASO*` : "";
      return `• *${d.credor}*${atrasoTag} — R$ ${fmt(d.valorParcela)}/mês _(confirme o vencimento)_`;
    }),
    ...cartoes.map((c, i) => {
      return `• *${c.banco} (cartão)* — Fatura R$ ${fmt(c.faturaAtual)}${c.valorMinimo ? ` | Mínimo R$ ${fmt(c.valorMinimo)}` : ""}${c.melhorDiaCompra ? ` | Melhor dia de compra: *${c.melhorDiaCompra}*` : ""}`;
    }),
  ].join("\n");

  // ── SEÇÃO: LISTA DE DÍVIDAS ──────────────
  const listaDividas = ordenadas.map((d, i) => {
    const jurosInfo = d.juros ? ` | Juros: ${d.juros}% a.m.` : "";
    const parcInfo = `${d.parcelasRestantes}x de R$ ${fmt(d.valorParcela)}`;
    const quitarInfo = d.valorParaQuitar ? ` | Para quitar hoje: *R$ ${fmt(d.valorParaQuitar)}*` : "";
    return `${emojis[i] ?? "•"} *${d.credor}* — R$ ${fmt(d.saldoAtual)}${jurosInfo}\n   ${parcInfo}${quitarInfo}`;
  }).join("\n");

  // ── SEÇÃO: DESPESAS FIXAS ─────────────────
  const listaDespesas = (diag.despesasFixas ?? []).length > 0
    ? (diag.despesasFixas ?? []).map((d) => `• ${d.descricao}: R$ ${fmt(d.valor)}`).join("\n")
    : "_(não informado)_";

  // ── SUGESTÕES AUTOMÁTICAS ─────────────────
  const sugestoes: string[] = [];

  if (emAtraso.length > 0) {
    sugestoes.push(`🔥 Prioridade máxima: regularize as dívidas em atraso (${emAtraso.map((d) => d.credor).join(", ")}). Juros de mora corroem qualquer plano.`);
  }

  const dividasComDesconto = dividas.filter((d) => d.descontoAVista && d.valorParaQuitar);
  if (dividasComDesconto.length > 0) {
    sugestoes.push(`💡 Há oferta(s) de desconto para quitação à vista. Se tiver como, quite ${dividasComDesconto.map((d) => d.credor).join(" e ")} primeiro — economia garantida.`);
  }

  if (comprometimento > 50) {
    sugestoes.push(`📉 Mais de ${comprometimento.toFixed(0)}% da sua renda vai para dívidas. Priorize renegociar as de maior juros para reduzir esse percentual.`);
  }

  if (sobra < 0) {
    sugestoes.push(`⚠️ Suas despesas superam sua renda. É necessário cortar gastos variáveis ou renegociar dívidas imediatamente.`);
  } else if (sobra > 200) {
    sugestoes.push(`💚 Você tem *R$ ${fmt(sobra)}/mês* disponíveis após todas as despesas. Use isso para amortizar as dívidas mais caras.`);
  }

  const sugestoesTexto = sugestoes.length > 0 ? sugestoes.join("\n\n") : "Siga o plano de pagamento e evite novas dívidas.";

  // ── PLANO 30/90/180 DIAS ─────────────────
  const meta30 = emAtraso.length > 0
    ? `Regularizar ${emAtraso.map((d) => d.credor).join(", ")} (em atraso).`
    : dividasComDesconto.length > 0
    ? `Aproveitar desconto de quitação à vista (${dividasComDesconto[0].credor}).`
    : `Pagar todas as parcelas do mês em dia.`;

  const meta90 = `Quitar a menor dívida completa${ordenadas[0] ? ` (*${ordenadas[0].credor}* — R$ ${fmt(ordenadas[0].saldoAtual)})` : ""} usando o método bola de neve.`;

  const meta180 = mesesParaQuitar <= 6
    ? `Quitar *todas* as dívidas — você pode estar livre em *${mesQuitacao}* seguindo o plano!`
    : `Reduzir o total de dívidas em pelo menos 30%. Foque nos credores com maior juros.`;

  // ── INFORMAÇÕES PENDENTES ─────────────────
  const pendentes: string[] = [];
  if (!diag.renda?.totalFamiliar && !diag.renda?.salarioLiquido) pendentes.push("renda mensal");
  if ((diag.despesasFixas ?? []).length === 0) pendentes.push("despesas fixas detalhadas");
  if (cartoes.length === 0 && dividas.some((d) => d.tipo === "CARTAO")) pendentes.push("limite e fatura atual dos cartões");
  if (dividas.some((d) => !d.diaVencimento)) pendentes.push("datas de vencimento das dívidas sem data");

  const pendentesTexto = pendentes.length > 0
    ? `\n\n📋 *Para completar seu diagnóstico, ainda falta:*\n${pendentes.map((p) => `• ${p}`).join("\n")}`
    : "";

  // ── RELATÓRIO FINAL ───────────────────────
  return `📊 *DIAGNÓSTICO FINANCEIRO — ${nome.toUpperCase()}*
${temAlerta ? "\n🚨 *ATENÇÃO: Situação requer ação imediata!*" : ""}

━━━━━━━━━━━━━━━━━━━━
💰 *RESUMO FINANCEIRO*
━━━━━━━━━━━━━━━━━━━━
Renda mensal: *R$ ${fmt(renda)}*
Despesas fixas: *R$ ${fmt(totalFixo)}*${totalVariavel > 0 ? `\nGastos variáveis: *R$ ${fmt(totalVariavel)}*` : ""}
Total em dívidas: *R$ ${fmt(totalDividas)}*
Parcelas/mês: *R$ ${fmt(comprometidoMes)}*
Comprometimento: *${pct(comprometidoMes, renda)}* ${nivelRisco}
${sobra >= 0 ? `Sobra mensal: *R$ ${fmt(sobra)}*` : `⚠️ Déficit: *R$ ${fmt(Math.abs(sobra))}* (renda insuficiente)`}

━━━━━━━━━━━━━━━━━━━━
🗓️ *O QUE PAGAR EM ${mesAtual}*
━━━━━━━━━━━━━━━━━━━━
${listaMes || "_(nenhuma dívida cadastrada)_"}

Total a pagar este mês: *R$ ${fmt(comprometidoMes)}*

━━━━━━━━━━━━━━━━━━━━
📋 *SUAS DÍVIDAS (por prioridade)*
━━━━━━━━━━━━━━━━━━━━
${listaDividas || "_(nenhuma dívida cadastrada)_"}

━━━━━━━━━━━━━━━━━━━━
💡 *ORIENTAÇÕES*
━━━━━━━━━━━━━━━━━━━━
${sugestoesTexto}

━━━━━━━━━━━━━━━━━━━━
🎯 *METAS*
━━━━━━━━━━━━━━━━━━━━
*30 dias:* ${meta30}
*90 dias:* ${meta90}
*180 dias:* ${meta180}

📅 Previsão de quitação total: *${mesQuitacao}*${pendentesTexto}

━━━━━━━━━━━━━━━━━━━━
✅ Diagnóstico salvo. Me avise quando pagar uma parcela ou contrair nova dívida — atualizo seu plano na hora.

_QuitaZAP — Organize hoje, quite amanhã_ 💚`;
}
