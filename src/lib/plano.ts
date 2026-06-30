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

// ── Helpers de formatação ─────────────────
function fmtParcela(obs: string | null | undefined, valorTotal: number): number {
  if (obs) {
    const m = obs.match(/de R\$?(\d+(?:[,.]?\d+)?)\s*[—\-]/);
    if (m) {
      const v = parseFloat(m[1].replace(",", "."));
      if (!isNaN(v) && v > 0) return v;
    }
  }
  return valorTotal;
}

// ── Resumo mensal curto ───────────────────
export function gerarResumoMensal(nome: string, renda: number, totalParcelas: number): string {
  const saldo = renda - totalParcelas;
  const mesAtual = new Date().toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();

  const dica =
    saldo > 500
      ? `Você ainda tem *R$ ${fmt(saldo)}* livres este mês. Considere usar uma parte pra quitar uma dívida mais rápido — é a melhor decisão agora. 💪`
      : saldo > 0
      ? `Sobram *R$ ${fmt(saldo)}* — guarda esse valor e evite gastos por impulso esta semana.`
      : `Sua renda está toda comprometida. Foque em pagar em dia e evite qualquer gasto extra.`;

  return `📊 *RESUMO SIMPLES — ${mesAtual}*

> RECEITA MENSAL:
• *R$ ${fmt(renda)}*

> DESPESAS ACUMULADAS (dívidas):
• *R$ ${fmt(totalParcelas)}*

> SALDO:
• *R$ ${fmt(Math.max(saldo, 0))}*${saldo < 0 ? `\n_⚠️ Déficit de R$ ${fmt(Math.abs(saldo))}/mês_` : ""}

💡 ${dica}`;
}

// ── Resumo semanal (autônomos, Uber, taxistas) ──
export function gerarResumoSemana(
  nome: string,
  renda: number,
  totalParcelas: number,
  modo: "receita" | "gastar"
): string {
  const saldoMensal = renda - totalParcelas;
  const necessidadeSemanal = totalParcelas / 4.33;
  const disponivelSemanal = saldoMensal / 4.33;
  const primeiroNome = nome.split(" ")[0];

  if (modo === "receita") {
    return `📅 *META DA SEMANA — ${primeiroNome}*

Para cobrir suas dívidas mensais você precisa faturar pelo menos:
💵 *R$ ${fmt(necessidadeSemanal)}/semana*

${renda > 0 ? `Sua renda atual dá ~R$ ${fmt(renda / 4.33)}/semana.` : ""}

${
  disponivelSemanal >= 0
    ? `✅ Está no caminho certo! Sobrando R$ ${fmt(disponivelSemanal)}/semana.`
    : `⚠️ Precisa faturar mais *R$ ${fmt(Math.abs(disponivelSemanal))}/semana* para cobrir tudo.`
}

Força! Cada corrida, venda ou serviço conta. 💪`;
  } else {
    return `💳 *DISPONÍVEL ESTA SEMANA — ${primeiroNome}*

${
  disponivelSemanal > 0
    ? `Você pode gastar até *R$ ${fmt(disponivelSemanal)}* esta semana sem comprometer seu plano.`
    : `⚠️ Sua renda atual não cobre todas as dívidas. Evite gastos extras esta semana.`
}

_Calculado com base na sua renda menos as parcelas mensais, dividido por 4 semanas._`;
  }
}

// ── Lista de despesas do mês ──────────────
export function gerarDespesasMes(
  dividas: Array<{
    credor: string;
    valorParcela: number;
    diaVencimento: number | null;
    emAtraso: boolean;
    tipo?: string | null;
    obs?: string | null;
  }>
): string {
  // Filtra consignados/associações (descontados em folha — não são despesas manuais)
  dividas = dividas.filter((d) => {
    const tipo = (d.tipo ?? "").toUpperCase();
    if (tipo === "EMPRESTIMO" || tipo === "ASSOCIACAO") return false;
    // Fallback: obs com "contracheque" também indica consignado
    if ((d.obs ?? "").toLowerCase().includes("contracheque")) return false;
    return true;
  });
  const mesAtual = new Date().toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();
  const total = dividas.reduce((t, d) => t + d.valorParcela, 0);
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

  const lista = [...dividas]
    .sort((a, b) => (a.diaVencimento ?? 99) - (b.diaVencimento ?? 99))
    .map((d, i) => {
      const venc = d.diaVencimento ? ` — vence dia *${d.diaVencimento}*` : "";
      const atraso = d.emAtraso ? " 🚨 *EM ATRASO*" : "";
      return `${emojis[i] ?? "•"} *${d.credor}*${atraso}: R$ ${fmt(d.valorParcela)}${venc}`;
    })
    .join("\n");

  return `💸 *DESPESAS DE ${mesAtual}*

${lista || "_(nenhuma dívida cadastrada)_"}

━━━━━━━━━
Total a pagar: *R$ ${fmt(total)}*

🔔 _Me avise quando pagar qualquer uma e eu atualizo seu plano!_`;
}

// ── Lista de comandos disponíveis ─────────
export function gerarListaComandos(nome: string): string {
  const primeiroNome = nome.split(" ")[0];
  return `Oi ${primeiroNome}! 👋 Aqui está tudo que você pode me pedir:

📊 *"resumo do mês"* ou *"saldo do mês"*
↳ Receita, despesas e saldo rápido

💸 *"despesas do mês"*
↳ Lista tudo que você precisa pagar

📅 *"quanto preciso ganhar essa semana?"*
↳ Ideal pra Uber, taxista, autônomo...

💳 *"posso gastar quanto essa semana?"*
↳ Seu saldo disponível da semana

🔄 *"atualiza meu plano"*
↳ Me conta que pagou uma dívida ou adicione uma nova

💰 *"Cobrar [Nome], [número], R$[valor], dia [X]"*
↳ Agenda cobrança automática pelo WhatsApp
↳ Funciona por áudio também! 🎤
↳ Pode incluir: *pix: [sua chave]* para o devedor pagar direto

📋 *"minhas cobranças"*
↳ Vê quem ainda não pagou e o status de cada cobrança

⭐ *"quitascore"* ou *"meu score"*
↳ Consulta seu score de saúde financeira atualizado

É só mandar a mensagem — pode escrever ou mandar áudio do seu jeito! 😊`;
}

// ── Calcula total mensal a partir das dívidas do DB ──
export function calcularTotalParcelas(
  dividas: Array<{ obs: string | null; valorTotal: number }>
): number {
  return dividas.reduce((t, d) => t + fmtParcela(d.obs, d.valorTotal), 0);
}

// ── QuitaScore ────────────────────────────
export function gerarQuitaScore(diag: DiagnosticoIA): string {
  const renda = diag.renda?.salarioLiquido ?? diag.renda?.totalFamiliar ?? 0;
  const dividas = diag.dividas ?? [];
  const cartoes = diag.cartoes ?? [];
  const isServidor = (diag.dadosPessoais?.vinculo ?? "").toUpperCase().includes("SERVIDOR_PUBLICO");

  // Para servidor: consignados já saem do líquido, não somam no comprometimento
  const dividasComprometimento = isServidor
    ? dividas.filter((d) => d.tipo !== "EMPRESTIMO" && d.tipo !== "ASSOCIACAO")
    : dividas;

  const totalParcelas = dividasComprometimento.reduce((s, d) => s + (d.valorParcela ?? 0), 0)
    + cartoes.reduce((s, c) => s + (c.faturaAtual ?? 0), 0);
  const totalDividas  = dividas.reduce((s, d) => s + (d.saldoAtual ?? 0), 0);
  const totalFixo     = (diag.despesasFixas ?? []).reduce((s, d) => s + d.valor, 0);
  const totalVariavel = (diag.despesasVariaveis ?? []).reduce((s, d) => s + d.valor, 0);
  const sobra         = renda - totalFixo - totalVariavel - totalParcelas;
  const emAtraso      = dividas.filter((d) => d.emAtraso);
  const reserva       = diag.patrimonio?.reservaEmergencia ?? 0;

  // 1. Comprometimento (300 pts)
  const pctComprometimento = renda > 0 ? totalParcelas / renda : 1;
  const ptComprometimento =
    pctComprometimento < 0.15 ? 300
    : pctComprometimento < 0.30 ? 240
    : pctComprometimento < 0.40 ? 150
    : pctComprometimento < 0.50 ? 60
    : 0;

  // 2. Equilíbrio (250 pts)
  const pctSobra = renda > 0 ? sobra / renda : -1;
  const ptEquilibrio =
    pctSobra > 0.20 ? 250
    : pctSobra > 0.10 ? 200
    : pctSobra > 0.01 ? 120
    : pctSobra === 0  ? 60
    : pctSobra > -0.10 ? 20
    : 0;

  // 3. Endividamento (200 pts)
  const multRenda = renda > 0 ? totalDividas / renda : 99;
  const ptEndividamento =
    multRenda < 3  ? 200
    : multRenda < 6  ? 160
    : multRenda < 12 ? 100
    : multRenda < 24 ? 40
    : 0;

  // 4. Adimplência (150 pts — 50% se orçamento negativo)
  const fatorAdimplencia = sobra < 0 ? 0.5 : 1;
  const ptAdimplenciaBase =
    emAtraso.length === 0 ? 150
    : emAtraso.length === 1 && (emAtraso[0].diasAtraso ?? 31) < 30 ? 90
    : emAtraso.length === 1 ? 50
    : 0;
  const ptAdimplencia = Math.round(ptAdimplenciaBase * fatorAdimplencia);

  // 5. Reserva (100 pts)
  const mesesReserva = renda > 0 ? reserva / renda : 0;
  const ptReserva =
    mesesReserva >= 6 ? 100
    : mesesReserva >= 3 ? 75
    : mesesReserva >= 1 ? 50
    : mesesReserva > 0 ? 20
    : 0;

  const score = ptComprometimento + ptEquilibrio + ptEndividamento + ptAdimplencia + ptReserva;
  const emoji =
    score >= 901 ? "⭐"
    : score >= 701 ? "🟢"
    : score >= 501 ? "🟡"
    : score >= 301 ? "⚠️"
    : "🔴";

  const faixa =
    score >= 901 ? "Excelente"
    : score >= 701 ? "Bom"
    : score >= 501 ? "Regular"
    : score >= 301 ? "Atenção"
    : "Crítico";

  const scoreBar = "█".repeat(Math.round(score / 100)) + "░".repeat(10 - Math.round(score / 100));

  return `💳 *Seu QuitaScore*

\`\`\`
Score atual    ${score}/1000  ${emoji} ${faixa}
${scoreBar}
─────────────────────────────────
Comprometimento renda  ${ptComprometimento}/300
Equilíbrio orçamento   ${ptEquilibrio}/250
Nível endividamento    ${ptEndividamento}/200
Adimplência            ${ptAdimplencia}/150
Reserva emergência     ${ptReserva}/100
\`\`\`

O QuitaScore mostra seu ponto de partida financeiro. Ele não é um julgamento, é uma forma simples de acompanhar sua evolução.

${score >= 700
    ? `Sua pontuação está em uma faixa positiva. Continue acompanhando seu plano para manter essa evolução. 💪`
    : score >= 500
    ? `Sua pontuação está em uma faixa regular — com organização e disciplina é possível evoluir mês a mês. 📋`
    : score >= 300
    ? `Sua pontuação pede atenção. Priorizar as dívidas em atraso e evitar novos compromissos ajuda a melhorar esse cenário. ⚠️`
    : `Sua pontuação está em uma faixa crítica. Com um plano de ação claro e foco no que pode ser ajustado, é possível melhorar essa situação aos poucos. 💚`}`;
}

// ── Relatório principal ───────────────────
export function gerarRelatorio(diag: DiagnosticoIA): string {
  const nome = diag.dadosPessoais?.nome ?? "cliente";
  const renda = diag.renda?.totalFamiliar ?? diag.renda?.salarioLiquido ?? 0;

  // ── Perfil (necessário cedo para ramificações de cálculo)
  const vinculo = (diag.dadosPessoais?.vinculo ?? "").toUpperCase();
  const objetivo = (diag.objetivos?.objetivoPrincipal ?? "").toUpperCase();
  const dependentes = diag.dadosPessoais?.dependentes ?? 0;
  const isAutonomo = ["AUTONOMO", "MEI", "FREELANCER"].some((v) => vinculo.includes(v));
  const isServidor = vinculo.includes("SERVIDOR_PUBLICO");

  // ── Despesas fixas
  const totalFixo = (diag.despesasFixas ?? []).reduce((s, d) => s + d.valor, 0);
  const totalVariavel = (diag.despesasVariaveis ?? []).reduce((s, d) => s + d.valor, 0);

  // ── Dívidas
  const dividas = diag.dividas ?? [];
  const cartoes = diag.cartoes ?? [];
  const emprestimos = diag.emprestimos ?? [];

  // Para servidor público: consignados e associações já foram descontados do líquido.
  // Separa os automáticos (folha) dos manuais (vencimento mensal normal).
  const consignadosFolha = isServidor
    ? dividas.filter((d) => d.tipo === "EMPRESTIMO" || d.tipo === "ASSOCIACAO")
    : [];
  const associacoesFolha = isServidor
    ? dividas.filter((d) => d.tipo === "ASSOCIACAO")
    : [];
  const emprestimosConsig = isServidor
    ? dividas.filter((d) => d.tipo === "EMPRESTIMO")
    : [];
  const dividasManuais = isServidor
    ? dividas.filter((d) => d.tipo !== "EMPRESTIMO" && d.tipo !== "ASSOCIACAO")
    : dividas;

  const totalConsignadosMes = consignadosFolha.reduce((s, d) => s + (d.valorParcela ?? 0), 0);
  const totalAssociacoesMes = associacoesFolha.reduce((s, d) => s + (d.valorParcela ?? 0), 0);
  const totalEmprestimosConsigMes = emprestimosConsig.reduce((s, d) => s + (d.valorParcela ?? 0), 0);

  // Saldo devedor total: consignados + demais
  const totalDividas = dividas.reduce((s, d) => s + (d.saldoAtual ?? 0), 0);
  const totalSaldoConsignados = emprestimosConsig.reduce((s, d) => s + (d.saldoAtual ?? 0), 0);

  // Para comprometimento: servidor usa apenas dívidas manuais (consignados já estão no líquido)
  const totalParcelasManuais = dividasManuais.reduce((s, d) => s + (d.valorParcela ?? 0), 0);
  const totalFaturas = cartoes.reduce((s, c) => s + (c.faturaAtual ?? 0), 0);

  const comprometidoMes = totalParcelasManuais + totalFaturas;
  const comprometimento = renda > 0 ? (comprometidoMes / renda) * 100 : 0;
  // Para servidor: sobra = líquido (já descontou consignados) - despesas normais
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

  // Dívidas em atraso (apenas manuais para servidor)
  const emAtraso = dividasManuais.filter((d) => d.emAtraso);

  // Ordenação por prioridade: em atraso primeiro, depois por maior juros, depois por maior valor
  const ordenadas = [...dividasManuais].sort((a, b) => {
    if (a.emAtraso && !b.emAtraso) return -1;
    if (!a.emAtraso && b.emAtraso) return 1;
    if ((b.juros ?? 0) !== (a.juros ?? 0)) return (b.juros ?? 0) - (a.juros ?? 0);
    return (b.saldoAtual ?? 0) - (a.saldoAtual ?? 0);
  });

  // Meses para quitar — para servidor usa só empréstimos (associações têm 999 parcelas = sem prazo)
  const dividasParaQuitacao = isServidor ? emprestimosConsig : dividasManuais;
  const mesesParaQuitar = dividasParaQuitacao.length > 0
    ? Math.max(...dividasParaQuitacao.map((d) => d.parcelasRestantes || 1))
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
    const quitarInfo = d.valorParaQuitar ? `\n• Para quitar hoje: *R$ ${fmt(d.valorParaQuitar)}*` : "";
    return `${emojis[i] ?? "•"} *${d.credor}* — R$ ${fmt(d.saldoAtual)}${jurosInfo}\n\n• ${parcInfo}${quitarInfo}`;
  }).join("\n");

  // ── SEÇÃO: DESPESAS FIXAS ─────────────────
  const listaDespesas = (diag.despesasFixas ?? []).length > 0
    ? (diag.despesasFixas ?? []).map((d) => `• ${d.descricao}: R$ ${fmt(d.valor)}`).join("\n")
    : "_(não informado)_";

  // ── SUGESTÕES AUTOMÁTICAS ─────────────────
  // Snowball: menor saldo primeiro (correto para o método) — usa dividasManuais para servidor
  const ordenadosSnowball = [...dividasManuais].sort((a, b) => (a.saldoAtual ?? 0) - (b.saldoAtual ?? 0));
  const menorDivida = ordenadosSnowball[0];

  const sugestoes: string[] = [];

  if (emAtraso.length > 0) {
    sugestoes.push(`🔥 Prioridade máxima: regularize ${emAtraso.map((d) => d.credor).join(", ")} (em atraso). Juros de mora crescem todo dia.`);
  }

  const dividasComDesconto = dividas.filter((d) => d.descontoAVista && d.valorParaQuitar);
  if (dividasComDesconto.length > 0) {
    sugestoes.push(`💡 Desconto para quitar à vista disponível em ${dividasComDesconto.map((d) => d.credor).join(" e ")}. Se tiver como, aproveite — é economia garantida.`);
  }

  if (comprometimento > 50) {
    sugestoes.push(`📉 ${comprometimento.toFixed(0)}% da sua renda vai para dívidas. Tente renegociar as de maior juros para reduzir esse percentual.`);
  }

  if (sobra < 0) {
    sugestoes.push(`⚠️ Suas despesas superam sua renda em *R$ ${fmt(Math.abs(sobra))}/mês*. Duas saídas: cortar gastos variáveis ou buscar uma renda extra. As duas juntas são mais poderosas.`);
  } else if (isServidor && sobra > 0) {
    sugestoes.push(`💚 Você tem *R$ ${fmt(sobra)}/mês* disponíveis após os descontos automáticos em folha. Suas dívidas já são pagas automaticamente — use esse valor para gastos pessoais, reserva de emergência ou acelerar o pagamento de algum empréstimo com refinanciamento.`);
  } else if (sobra > 200) {
    sugestoes.push(`💚 Sobram *R$ ${fmt(sobra)}/mês* após todas as despesas. Coloque esse valor como pagamento extra na menor dívida — vai encurtar muito o prazo.`);
  }

  // ── PERFIL DO CLIENTE ─────────────────────

  // Sugestão extra por perfil
  if (isAutonomo) {
    const metaSemanal = comprometidoMes / 4.33;
    sugestoes.push(`📅 Como autônomo, sua renda pode variar. Meta semanal de faturamento para cobrir as dívidas: *R$ ${fmt(metaSemanal)}*. Nos meses ruins, priorize as parcelas antes de qualquer outro gasto.`);
  }
  if (dependentes > 0) {
    sugestoes.push(`👨‍👩‍👧 Você tem ${dependentes} dependente(s). Inclua os gastos com família no orçamento e considere ter um seguro de vida — é proteção para quem você ama.`);
  }
  if (objetivo.includes("RESERVA")) {
    sugestoes.push(`🏦 Seu objetivo é criar uma reserva. Além de pagar as dívidas, separe pelo menos *5% da renda* todo mês. Mesmo que seja pouco no começo, o hábito é o que importa.`);
  }
  if (objetivo.includes("INVESTIR")) {
    sugestoes.push(`📈 Quer investir? Ótimo! A regra é: quite primeiro as dívidas com juros acima de 1% ao mês — elas "comem" mais do que qualquer investimento vai render. Depois, cada real livre vai direto pra renda fixa.`);
  }

  const sugestoesTexto = sugestoes.length > 0 ? sugestoes.join("\n\n") : "Siga o plano de pagamento e evite novas dívidas.";

  // ── PLANO 30/90/180 DIAS ─────────────────
  let meta30: string;
  let meta90: string;
  let meta180: string;

  if (isServidor) {
    // Metas específicas para servidor público
    const primeiroEmprestimo = [...emprestimosConsig].sort((a, b) => a.parcelasRestantes - b.parcelasRestantes)[0];
    const liberacaoStr = primeiroEmprestimo
      ? (() => {
          const t = new Date(); t.setMonth(t.getMonth() + primeiroEmprestimo.parcelasRestantes);
          return `${primeiroEmprestimo.credor} quita em ${t.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })} — libera *R$ ${fmt(primeiroEmprestimo.valorParcela)}/mês*`;
        })()
      : "";

    meta30 = `Organize seus *R$ ${fmt(renda)}/mês* disponíveis. Suas dívidas são descontadas automaticamente em folha — não há parcelas para pagar manualmente. Evite contrair novas dívidas fora da folha.`;

    meta90 = `Pesquise *portabilidade de crédito consignado* — migrar empréstimos para banco com taxa menor (ideal: abaixo de 1,8% a.m.) reduz o valor descontado em folha e aumenta o que cai na sua conta. BB, Caixa e BRB costumam ter boas taxas para servidor público.`;

    const associacoesMsg = totalAssociacoesMes > 0
      ? ` Avalie também cancelar associações que não usa — economia de *R$ ${fmt(totalAssociacoesMes)}/mês*.`
      : "";
    const liberacaoMsg = liberacaoStr ? ` Quando o ${liberacaoStr}, use os recursos liberados para construir uma reserva de emergência (meta: 3x seu salário mensal).` : "";

    meta180 = `Revise as associações em folha — você realmente usa os benefícios da ASTEBA, ASSEBA e ASPRA?${associacoesMsg}${liberacaoMsg}`;

  } else {
    // Metas para não-servidor
    meta30 = emAtraso.length > 0
      ? `Regularizar ${emAtraso.map((d) => d.credor).join(", ")} (em atraso). Isso para o sangramento dos juros.`
      : dividasComDesconto.length > 0
      ? `Aproveitar o desconto de quitação à vista (${dividasComDesconto[0].credor}) — menor saída de dinheiro.`
      : `Pagar todas as parcelas do mês em dia e não contrair nenhuma dívida nova.`;

    const snowballExplicacao = menorDivida
      ? `Método Bola de Neve: pague o mínimo em todas as dívidas e concentre qualquer dinheiro extra na *${menorDivida.credor}* (R$ ${fmt(menorDivida.saldoAtual)} — a menor). Ao quitar, some o valor da parcela dela na próxima menor.`
      : `Quite as menores dívidas primeiro e use o valor liberado para acelerar as próximas.`;

    meta90 = snowballExplicacao;

    const meta180Base = mesesParaQuitar <= 6
      ? `Quitar *todas* as dívidas — livre em *${mesQuitacao}* seguindo o plano!`
      : `Reduzir o total de dívidas em 30% e aplicar a *Regra 50-30-20*: 50% da renda para necessidades fixas, 30% para estilo de vida, 20% para dívidas/reserva.`;

    const meta180Extra = objetivo.includes("RESERVA")
      ? ` Depois, construa sua reserva de emergência (3x sua renda mensal).`
      : objetivo.includes("INVESTIR")
      ? ` Com as dívidas quitadas, abra uma conta em corretora e comece com renda fixa.`
      : "";

    meta180 = meta180Base + meta180Extra;
  }

  // ── INFORMAÇÕES PENDENTES ─────────────────
  const pendentes: string[] = [];
  if (!diag.renda?.totalFamiliar && !diag.renda?.salarioLiquido) pendentes.push("renda mensal");
  // Servidor público: despesas fixas são os descontos em folha — não pedir
  if (!isServidor && (diag.despesasFixas ?? []).length === 0) pendentes.push("despesas fixas detalhadas");
  // Limite, valor mínimo e juros do cartão são dados complementares — não são exigidos para o diagnóstico básico
  // Consignados não têm vencimento manual — não reclamar deles
  if (dividasManuais.some((d) => !d.diaVencimento)) pendentes.push("datas de vencimento das dívidas sem data");

  const pendentesTexto = pendentes.length > 0
    ? `\n\n📋 *Para completar seu diagnóstico, ainda falta:*\n${pendentes.map((p) => `• ${p}`).join("\n")}`
    : "";

  // ── CALENDÁRIO DE LIBERAÇÃO (servidor público) ───────────────────────
  let calendarioLiberacao = "";
  if (isServidor && emprestimosConsig.length > 0) {
    const hoje2 = new Date();
    const linhas = [...emprestimosConsig]
      .filter((d) => d.parcelasRestantes > 0)
      .sort((a, b) => a.parcelasRestantes - b.parcelasRestantes)
      .map((d) => {
        const termino = new Date(hoje2);
        termino.setMonth(termino.getMonth() + d.parcelasRestantes);
        const mesTermino = termino.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
        return `• ${d.credor} — termina *${mesTermino}* → libera *R$ ${fmt(d.valorParcela)}/mês*`;
      });
    if (linhas.length > 0) {
      calendarioLiberacao = `
━━━━━━━━━━━━━━━━━━━━
📅 *CALENDÁRIO DE LIBERAÇÃO DE MARGEM*
━━━━━━━━━━━━━━━━━━━━
${linhas.join("\n")}`;
    }
  }

  // ── POTENCIAL DE RECUPERAÇÃO (servidor público) ──────────────────────
  let potencialRecuperacao = "";
  if (isServidor && totalConsignadosMes > 0) {
    const linhas: string[] = [];
    if (totalEmprestimosConsigMes > 0) {
      linhas.push(`💸 Se quitar todos os empréstimos: recebe *+R$ ${fmt(totalEmprestimosConsigMes)}/mês* a mais`);
    }
    if (totalAssociacoesMes > 0) {
      linhas.push(`🤝 Se cancelar as associações: recebe *+R$ ${fmt(totalAssociacoesMes)}/mês* a mais`);
    }
    if (linhas.length > 0) {
      potencialRecuperacao = `
━━━━━━━━━━━━━━━━━━━━
🚀 *POTENCIAL DE RECUPERAÇÃO SALARIAL*
━━━━━━━━━━━━━━━━━━━━
${linhas.join("\n")}
_Seu salário líquido real poderia ser *R$ ${fmt(renda + totalConsignadosMes)}* se estivesse livre de todas as dívidas em folha._`;
    }
  }

  // ── LINHA DE PERFIL ───────────────────────
  const perfilLabel =
    vinculo.includes("SERVIDOR_PUBLICO") ? "🏛️ Servidor Público"
    : vinculo.includes("CLT") ? "💼 CLT"
    : vinculo.includes("AUTONOMO") ? "🔧 Autônomo"
    : vinculo.includes("MEI") ? "🏪 MEI"
    : vinculo.includes("EMPRESARIO") ? "🏢 Empresário"
    : vinculo.includes("FREELANCER") ? "💻 Freelancer"
    : "";

  const objetivoLabel =
    objetivo.includes("QUITAR") ? "🎯 Quitar dívidas"
    : objetivo.includes("RESERVA") ? "🏦 Criar reserva"
    : objetivo.includes("INVESTIR") ? "📈 Investir"
    : objetivo.includes("ORGANIZAR") ? "📋 Organizar"
    : "";

  const perfilLinha = [perfilLabel, objetivoLabel].filter(Boolean).join(" · ");

  // ── SEÇÃO CONSIGNADOS EM FOLHA (servidor) ──────────────────────────────
  const listaConsignadosFolha = isServidor && consignadosFolha.length > 0
    ? (() => {
        const emp = emprestimosConsig.map((d) => {
          const parc = d.parcelasRestantes > 0 && d.parcelasRestantes < 900
            ? ` (${d.parcelasRestantes}x restantes)`
            : "";
          return `• *${d.credor}*${parc}: R$ ${fmt(d.valorParcela)}/mês`;
        }).join("\n");
        const assoc = associacoesFolha.map((d) =>
          `• *${d.credor}* (associação): R$ ${fmt(d.valorParcela)}/mês`
        ).join("\n");
        const partes = [emp, assoc].filter(Boolean).join("\n");
        return `\n━━━━━━━━━━━━━━━━━━━━
🏦 *DESCONTOS AUTOMÁTICOS EM FOLHA*
━━━━━━━━━━━━━━━━━━━━
_Pagos direto na folha — não precisa de ação manual:_
${partes}
Total descontado em folha: *R$ ${fmt(totalConsignadosMes)}/mês*`;
      })()
    : "";

  // ── RELATÓRIO FINAL ───────────────────────
  return `📊 *DIAGNÓSTICO FINANCEIRO — ${nome.toUpperCase()}*
${perfilLinha ? `_${perfilLinha}_` : ""}
${temAlerta ? "\n🚨 *ATENÇÃO: Situação requer ação imediata!*" : ""}

━━━━━━━━━━━━━━━━━━━━
💰 *RESUMO FINANCEIRO*
━━━━━━━━━━━━━━━━━━━━
${isServidor && diag.renda?.salarioLiquidoComExtras
  ? `Salário líquido do mês: *R$ ${fmt(diag.renda.salarioLiquidoComExtras)}*\n  ↳ Salário mensal normal: *R$ ${fmt(renda)}*\n  ↳ Adiantamento 13°: *R$ ${fmt(diag.renda.adiantamento13 ?? 0)}*`
  : `Salário líquido mensal: *R$ ${fmt(renda)}*`}
_↳ Já descontados em folha: R$ ${fmt(totalConsignadosMes)}/mês_
${totalFixo > 0 ? `Despesas fixas: *R$ ${fmt(totalFixo)}*\n` : ""}${totalVariavel > 0 ? `Gastos variáveis: *R$ ${fmt(totalVariavel)}*\n` : ""}${isServidor
  ? `💳 Disponível na conta este mês: *R$ ${fmt(diag.renda?.salarioLiquidoComExtras ?? renda)}*${diag.renda?.adiantamento13 ? `\n_↳ Nos demais meses (sem 13°): R$ ${fmt(renda)}_` : ""}`
  : `Total em dívidas: *R$ ${fmt(totalDividas)}*
Parcelas/mês: *R$ ${fmt(comprometidoMes)}*
Comprometimento: *${pct(comprometidoMes, renda)}* ${nivelRisco}
${sobra >= 0 ? `Sobra mensal: *R$ ${fmt(sobra)}*` : `⚠️ Déficit: *R$ ${fmt(Math.abs(sobra))}* (renda insuficiente)`}`}
${listaConsignadosFolha}
${(diag.despesasFixas ?? []).length > 0 ? `
━━━━━━━━━━━━━━━━━━━━
🏠 *DESPESAS FIXAS*
━━━━━━━━━━━━━━━━━━━━
${listaDespesas}

Total fixo: *R$ ${fmt(totalFixo)}*` : ""}
${comprometidoMes > 0 ? `
━━━━━━━━━━━━━━━━━━━━
🗓️ *O QUE PAGAR EM ${mesAtual}*
━━━━━━━━━━━━━━━━━━━━
${listaMes}

Total a pagar este mês: *R$ ${fmt(comprometidoMes)}*
🔔 _Vou te avisar 1 dia antes de cada vencimento aqui pelo WhatsApp._` : ""}
${listaDividas ? `
━━━━━━━━━━━━━━━━━━━━
📋 *SUAS DÍVIDAS (por prioridade)*
━━━━━━━━━━━━━━━━━━━━
${listaDividas}` : ""}${calendarioLiberacao}${potencialRecuperacao}

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
✅ Diagnóstico salvo. Estou aqui 24h — me avise quando pagar uma parcela e atualizo seu plano.

⚠️ _Evite contrair novas dívidas por enquanto. Sua situação pede foco. Um passo de cada vez._

_QuitaZAP — organização financeira, um passo de cada vez_ 💚`;
}
