// ─────────────────────────────────────────
// QuitaZAP — Lógica financeira centralizada
// ─────────────────────────────────────────

export type ParcelaCalculo = {
  id: string;
  valor: number;
  vencimento: Date;
  status: string;
  divida?: { credor: string };
};

export type DividaCalculo = {
  id: string;
  credor: string;
  valorTotal: number;
  valorPago: number;
  status: string;
  prioridade?: number;
  dataReferencia?: Date | null;
  parcelas?: ParcelaCalculo[];
};

export type ClienteCalculo = {
  rendaMensal?: number | null;
  despesasFixas?: number | null;
  valorDisponivelMensal?: number | null;
  dividas: DividaCalculo[];
};

export type Cenario = {
  nome: string;
  descricao: string;
  cor: string;
  valorMensal: number;
  valorSemanal: number;
  mesesParaQuitacao: number;
  dataQuitacao: Date | null;
};

// ─────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────

export function hoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(data: Date | string | null | undefined): string {
  if (!data) return "-";
  return new Date(data).toLocaleDateString("pt-BR");
}

export function diferencaDias(data: Date): number {
  const agora = hoje();
  const alvo = new Date(data);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
}

export function adicionarMeses(data: Date, meses: number): Date {
  const d = new Date(data);
  d.setMonth(d.getMonth() + meses);
  return d;
}

// ─────────────────────────────────────────
// TOTAIS
// ─────────────────────────────────────────

export function totalDevido(cliente: ClienteCalculo): number {
  return cliente.dividas
    .filter((d) => d.status !== "QUITADA")
    .reduce((acc, d) => acc + d.valorTotal, 0);
}

export function totalPago(cliente: ClienteCalculo): number {
  return cliente.dividas.reduce((acc, d) => acc + d.valorPago, 0);
}

export function saldoRestante(cliente: ClienteCalculo): number {
  return Math.max(0, totalDevido(cliente) - totalPago(cliente));
}

// ─────────────────────────────────────────
// PARCELAS
// ─────────────────────────────────────────

export function parcelasVencidas(parcelas: ParcelaCalculo[]): ParcelaCalculo[] {
  const agora = hoje();
  return parcelas.filter((p) => {
    const v = new Date(p.vencimento);
    v.setHours(0, 0, 0, 0);
    return v < agora && p.status === "PENDENTE";
  });
}

export function parcelasProximas(parcelas: ParcelaCalculo[], dias = 7): ParcelaCalculo[] {
  const agora = hoje();
  const limite = new Date(agora);
  limite.setDate(limite.getDate() + dias);
  return parcelas.filter((p) => {
    const v = new Date(p.vencimento);
    v.setHours(0, 0, 0, 0);
    return v >= agora && v <= limite && p.status === "PENDENTE";
  });
}

export function totalParcelas(parcelas: ParcelaCalculo[]): number {
  return parcelas.reduce((acc, p) => acc + p.valor, 0);
}

// ─────────────────────────────────────────
// CENÁRIOS DE QUITAÇÃO
// ─────────────────────────────────────────

function calcularCenario(
  saldo: number,
  valorMensalBruto: number,
  nome: string,
  descricao: string,
  cor: string
): Cenario {
  const valorMensal = Math.max(valorMensalBruto, 1);
  const meses = saldo > 0 ? Math.ceil(saldo / valorMensal) : 0;
  return {
    nome,
    descricao,
    cor,
    valorMensal,
    valorSemanal: valorMensal / 4,
    mesesParaQuitacao: meses,
    dataQuitacao: meses > 0 ? adicionarMeses(hoje(), meses) : null,
  };
}

export function gerarCenarios(
  saldo: number,
  cliente: {
    rendaMensal?: number | null;
    despesasFixas?: number | null;
    valorDisponivelMensal?: number | null;
  },
  totalProx30Dias: number
): Cenario[] {
  const renda     = Number(cliente.rendaMensal ?? 0);
  const despesas  = Number(cliente.despesasFixas ?? 0);
  const disponivel = Number(cliente.valorDisponivelMensal ?? 0);

  // Leve: cobre só parcelas dos próximos 30 dias, ou 8% da renda
  const leveBase = totalProx30Dias > 0
    ? totalProx30Dias
    : renda > 0 ? renda * 0.08 : saldo / 24;

  // Realista: valor disponível informado, ou renda - despesas, ou saldo/12
  const realistaBase = disponivel > 0
    ? disponivel
    : renda > 0
    ? Math.max(renda - despesas, renda * 0.15)
    : saldo / 12;

  // Agressivo: 1.5x o realista, ou 30% da renda
  const agressivoBase = renda > 0
    ? Math.max(realistaBase * 1.5, renda * 0.30)
    : realistaBase * 1.5;

  return [
    calcularCenario(saldo, Math.max(leveBase, 50),        "Leve",      disponivel > 0 ? "Pagando só o mínimo das parcelas próximas" : "Ritmo mais tranquilo — demora mais, mas é sustentável", "#2563eb"),
    calcularCenario(saldo, Math.max(realistaBase, 100),   "Realista",  disponivel > 0 ? "Baseado no valor disponível informado"       : "Ritmo equilibrado considerando sua renda",              "#16a34a"),
    calcularCenario(saldo, Math.max(agressivoBase, 150),  "Agressivo", "Quitação mais rápida com maior esforço mensal",                                                                          "#dc2626"),
  ];
}

// ─────────────────────────────────────────
// PRIORIDADE DE DÍVIDAS
// ─────────────────────────────────────────

export function ordenarDividasPorPrioridade(dividas: DividaCalculo[]): DividaCalculo[] {
  return [...dividas]
    .filter((d) => d.status !== "QUITADA")
    .sort((a, b) => {
      if ((b.prioridade ?? 0) !== (a.prioridade ?? 0)) return (b.prioridade ?? 0) - (a.prioridade ?? 0);
      const aV = (a.parcelas ?? []).filter((p) => p.status === "PENDENTE" && new Date(p.vencimento) < hoje()).length;
      const bV = (b.parcelas ?? []).filter((p) => p.status === "PENDENTE" && new Date(p.vencimento) < hoje()).length;
      if (bV !== aV) return bV - aV;
      return (b.valorTotal - b.valorPago) - (a.valorTotal - a.valorPago);
    });
}

// ─────────────────────────────────────────
// GERADOR DE PLANO PARA WHATSAPP
// ─────────────────────────────────────────

export type PlanoWhatsAppInput = {
  nomeCliente: string;
  dividas: DividaCalculo[];
  parcelas: ParcelaCalculo[];
  cenarios?: Cenario[];
};

export function gerarPlanoWhatsApp(input: PlanoWhatsAppInput): string {
  const { nomeCliente, dividas, parcelas, cenarios } = input;

  const totalDiv = dividas.filter((d) => d.status !== "QUITADA").reduce((acc, d) => acc + d.valorTotal, 0);
  const totalPg  = dividas.reduce((acc, d) => acc + d.valorPago, 0);
  const saldo    = Math.max(0, totalDiv - totalPg);

  const vencidas = parcelasVencidas(parcelas);
  const prox7    = parcelasProximas(parcelas, 7);
  const prox30   = parcelasProximas(parcelas, 30);
  const cenarioR = cenarios?.[1];

  const linhas: string[] = [];

  linhas.push(`📋 *PLANO DE QUITAÇÃO — ${nomeCliente.toUpperCase()}*`);
  linhas.push(`─────────────────────────`);
  linhas.push(`\n💳 *SUAS DÍVIDAS:*`);
  dividas.forEach((d) => {
    const saldoD = Math.max(0, d.valorTotal - d.valorPago);
    const icone  = d.status === "QUITADA" ? "✅" : "🔴";
    linhas.push(`${icone} ${d.credor} — ${formatarMoeda(d.valorTotal)}` +
      (d.status !== "QUITADA" ? ` (restam ${formatarMoeda(saldoD)})` : " (QUITADA)"));
  });

  linhas.push(`\n💰 *RESUMO FINANCEIRO:*`);
  linhas.push(`• Total em dívidas: ${formatarMoeda(totalDiv)}`);
  linhas.push(`• Total já pago: ${formatarMoeda(totalPg)}`);
  linhas.push(`• *Saldo a quitar: ${formatarMoeda(saldo)}*`);

  if (vencidas.length > 0) {
    linhas.push(`\n⚠️ *PARCELAS VENCIDAS (${vencidas.length}):*`);
    vencidas.forEach((p) => {
      linhas.push(`• ${p.divida?.credor ?? "Dívida"} — ${formatarMoeda(p.valor)} (venceu em ${formatarData(p.vencimento)})`);
    });
  }

  if (prox7.length > 0) {
    linhas.push(`\n📅 *VENCEM NOS PRÓXIMOS 7 DIAS:*`);
    prox7.forEach((p) => {
      const diff   = diferencaDias(new Date(p.vencimento));
      const quando = diff === 0 ? "hoje" : diff === 1 ? "amanhã" : `em ${diff} dias`;
      linhas.push(`• ${p.divida?.credor ?? "Dívida"} — ${formatarMoeda(p.valor)} (${quando})`);
    });
  }

  linhas.push(`\n📊 *PLANO SUGERIDO (CENÁRIO REALISTA):*`);
  if (!parcelas.some((p) => p.status === "PENDENTE")) {
    linhas.push(`✅ Todas as parcelas estão pagas!`);
  } else if (cenarioR) {
    linhas.push(`• Separar por semana: *${formatarMoeda(cenarioR.valorSemanal)}*`);
    linhas.push(`• Separar por mês: *${formatarMoeda(cenarioR.valorMensal)}*`);
    if (cenarioR.dataQuitacao) linhas.push(`• Previsão de quitação: *${formatarData(cenarioR.dataQuitacao)}*`);
    linhas.push(`• Parcelas nos próx. 30 dias: ${prox30.length} (${formatarMoeda(totalParcelas(prox30))})`);
  }

  linhas.push(`\n⚠️ *Observação importante:*`);
  linhas.push(`Este plano é uma organização inicial para ajudar você a ter mais controle. Antes de assumir um novo acordo, confira se a parcela cabe no seu orçamento mensal.`);
  linhas.push(`\n_Gerado pelo QuitaZAP_ ✅`);

  return linhas.join("\n");
}
