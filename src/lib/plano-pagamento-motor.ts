// ─────────────────────────────────────────
// QuitaZAP Controle — Plano de Pagamento (motor real)
// ─────────────────────────────────────────
// Implementa o motor descrito em plano-pagamento-contrato.ts
// (calcularPlanoPagamento, "ainda não escrito" até agora). Consenso de
// arquitetura fechado em 2026-09-05 (Ibrahim + ChatGPT + esta sessão,
// convergência independente): motor 100% determinístico decide números
// e ordem; a IA (quando entrar) só narra em linguagem natural — nunca
// reordena nem recalcula nada. Mesmo princípio já usado em
// rota-dividas-resolver.ts/simulador-parcela-resolver.ts.
//
// Camadas de prioridade (não é um score por pesos arbitrários somados):
// 1. CRÍTICA — risco de corte (moradia/serviço essencial ou cartão, ver
//    risco-tipo-divida.ts) E já vencida ou vencendo muito perto.
// 2. Compromisso do mês sem risco crítico específico: já atrasada, ou
//    vence muito perto (mesmo que sem risco elevado).
// 3. Maior custo efetivo (juros embutido, reaproveita a mesma técnica de
//    rota-livre-dividas.ts) entre as que sobraram — candidatas a
//    amortização extra quando há orçamento livre.
// 4. Resto, com desempate por vencimento > custo > saldo menor.
//
// Consignado (descontadoEmFolha=true) fica de fora da lista ranqueada —
// já é descontado automaticamente do salário líquido antes do cliente
// decidir qualquer coisa, mesmo princípio de exclusão já usado em
// motor.ts/limite-seguro.ts (não é uma decisão de pagamento, é automático).

import { prisma } from "@/lib/prisma";
import { calcularResumoFinanceiro, limitesDoMes, anoMesAtualBrasil } from "@/lib/financeiro/motor";
import { nivelRiscoPorTipo, riscoCritico } from "@/lib/financeiro/risco-tipo-divida";
import type { ReasonCode } from "@/lib/plano-pagamento-contrato";

const DIAS_VENCIMENTO_PROXIMO = 7;

export interface ItemPlano {
  dividaId: string;
  credor: string;
  tipo: string;
  valor: number;
  vencimento: Date | null;
  diasAtraso: number;
  custoRelativo: number | null;
  reasonCode: ReasonCode;
  justificativa: string;
}

export interface PlanoPagamento {
  calculavel: boolean;
  rendaDisponivel: number;
  totalDespesasNaoDivida: number;
  orcamentoParaDividas: number;
  totalObrigatorio: number;
  /** orcamentoParaDividas − totalObrigatorio. Negativo = falta dinheiro
   * pros compromissos prioritários (não é o mesmo "saldoProjetado" do
   * resumo simplificado, que já assume tudo pago). */
  faltaParaFechar: number;
  pagarAgora: ItemPlano[];
  negociarRever: ItemPlano[];
  podeEsperar: ItemPlano[];
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
}

function justificativaPorCodigo(codigo: ReasonCode, item: { credor: string; diasAtraso: number; vencimento: Date | null; custoRelativo: number | null; tipo: string }): string {
  switch (codigo) {
    case "RISK_SERVICE_CUTOFF":
      return item.diasAtraso > 0
        ? `Atrasada há ${item.diasAtraso} dia${item.diasAtraso === 1 ? "" : "s"} e com risco de corte/bloqueio — prioridade máxima.`
        : `Vence muito perto e tem risco de corte/bloqueio (${nivelRiscoPorTipo(item.tipo) === "CRITICO" ? "serviço essencial" : "cartão"}) — evite deixar atrasar.`;
    case "OVERDUE":
      return `Já está atrasada há ${item.diasAtraso} dia${item.diasAtraso === 1 ? "" : "s"}.`;
    case "DUE_SOON":
      return item.vencimento ? `Vence em breve (${fmtData(item.vencimento)}).` : "Vence em breve.";
    case "HIGH_COST_DEBT":
      return item.custoRelativo && item.custoRelativo > 0
        ? `É a que tem mais juros embutido no cronograma — pagar mais aqui economiza no total.`
        : "Prioridade por custo entre as que sobraram no orçamento.";
    case "MINIMUM_REQUIRED":
      return "Compromisso deste mês.";
    default:
      return "Sem urgência este mês — pode esperar.";
  }
}

export async function calcularPlanoPagamento(clienteId: string, referencia: Date = new Date()): Promise<PlanoPagamento> {
  const { ano, mes } = anoMesAtualBrasil(referencia);
  const periodo = limitesDoMes(ano, mes);

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { rendaMensal: true } });
  const resumo = await calcularResumoFinanceiro({ clienteId, periodo, rendaMensalDeclarada: cliente?.rendaMensal ?? null });

  if (!resumo.comprometimento.calculavel) {
    return {
      calculavel: false,
      rendaDisponivel: 0,
      totalDespesasNaoDivida: resumo.totais.totalSaidasSemDividas,
      orcamentoParaDividas: 0,
      totalObrigatorio: 0,
      faltaParaFechar: 0,
      pagarAgora: [],
      negociarRever: [],
      podeEsperar: [],
    };
  }

  // calculavel:true (checado acima) garante que rendaEfetiva não é null
  // na prática — o `?? 0` é só pro TypeScript, nunca deveria disparar.
  const rendaDisponivel = resumo.comprometimento.rendaEfetiva ?? 0;
  const orcamentoParaDividas = rendaDisponivel - resumo.totais.totalSaidasSemDividas;

  const dividas = await prisma.divida.findMany({
    where: { clienteId, status: "ATIVA", descontadoEmFolha: false },
    include: { parcelas: { where: { status: "PENDENTE" }, orderBy: { vencimento: "asc" } } },
  });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const emDiasAPartirDeHoje = (d: Date) => Math.round((d.getTime() - hoje.getTime()) / 86_400_000);

  type Bruto = {
    dividaId: string; credor: string; tipo: string; valor: number; vencimento: Date | null;
    diasAtraso: number; custoRelativo: number | null; emAtraso: boolean; venceLogo: boolean; risco: boolean;
  };

  const brutos: Bruto[] = dividas
    .map((d): Bruto | null => {
      const saldoDevedor = Math.max(d.valorTotal - d.valorPago, 0);
      if (saldoDevedor <= 0) return null;

      const proximaParcela = d.parcelas[0] ?? null;
      const vencimento = proximaParcela?.vencimento ?? (d.diaVencimento ? new Date(hoje.getFullYear(), hoje.getMonth(), d.diaVencimento) : null);
      const diasAteVencer = vencimento ? emDiasAPartirDeHoje(vencimento) : null;

      let custoRelativo: number | null = null;
      if (d.parcelas.length > 0) {
        const totalParcelasRestantes = d.parcelas.reduce((soma, p) => soma + p.valor, 0);
        const jurosRestante = Math.max(totalParcelasRestantes - saldoDevedor, 0);
        custoRelativo = saldoDevedor > 0 ? jurosRestante / saldoDevedor : 0;
      }

      // Valor deste mês: a parcela que vence no período, ou (sem
      // cronograma cadastrado) o saldo todo — mesma regra conservadora
      // de "trate como compromisso do mês inteiro" quando não há Parcela.
      const parcelaDoMes = d.parcelas.find((p) => p.vencimento >= periodo.inicio && p.vencimento < periodo.fim);
      const valor = parcelaDoMes?.valor ?? (d.parcelas.length === 0 ? saldoDevedor : 0);
      if (valor <= 0) return null;

      return {
        dividaId: d.id,
        credor: d.credor,
        tipo: d.tipo,
        valor,
        vencimento,
        diasAtraso: d.emAtraso ? (d.diasAtraso ?? 0) : 0,
        custoRelativo,
        emAtraso: d.emAtraso,
        venceLogo: diasAteVencer != null && diasAteVencer <= DIAS_VENCIMENTO_PROXIMO,
        risco: riscoCritico(d.tipo),
      };
    })
    .filter((b): b is Bruto => b !== null);

  const tier1: Bruto[] = [];
  const tier2: Bruto[] = [];
  const tier3: Bruto[] = [];

  for (const b of brutos) {
    if (b.risco && (b.emAtraso || b.venceLogo)) tier1.push(b);
    else if (b.emAtraso || b.venceLogo) tier2.push(b);
    else tier3.push(b);
  }

  tier1.sort((a, b) => b.diasAtraso - a.diasAtraso || (a.vencimento?.getTime() ?? 0) - (b.vencimento?.getTime() ?? 0));
  tier2.sort((a, b) => b.diasAtraso - a.diasAtraso || (a.vencimento?.getTime() ?? 0) - (b.vencimento?.getTime() ?? 0));
  tier3.sort((a, b) =>
    (b.custoRelativo ?? -1) - (a.custoRelativo ?? -1)
    || (a.vencimento?.getTime() ?? Infinity) - (b.vencimento?.getTime() ?? Infinity)
    || a.valor - b.valor
  );

  function paraItem(b: Bruto, codigo: ReasonCode): ItemPlano {
    return {
      dividaId: b.dividaId,
      credor: b.credor,
      tipo: b.tipo,
      valor: b.valor,
      vencimento: b.vencimento,
      diasAtraso: b.diasAtraso,
      custoRelativo: b.custoRelativo,
      reasonCode: codigo,
      justificativa: justificativaPorCodigo(codigo, b),
    };
  }

  const obrigatorios = [
    ...tier1.map((b) => paraItem(b, "RISK_SERVICE_CUTOFF" as ReasonCode)),
    ...tier2.map((b) => paraItem(b, b.emAtraso ? ("OVERDUE" as ReasonCode) : ("DUE_SOON" as ReasonCode))),
  ];
  const totalObrigatorio = obrigatorios.reduce((soma, i) => soma + i.valor, 0);
  const faltaParaFechar = orcamentoParaDividas - totalObrigatorio;

  const pagarAgora: ItemPlano[] = [];
  const negociarRever: ItemPlano[] = [];
  const podeEsperar: ItemPlano[] = [];

  if (faltaParaFechar >= 0) {
    // Cabe tudo o que é obrigatório — o que sobra pode ir pra amortização
    // extra nas de maior custo, até o orçamento acabar.
    pagarAgora.push(...obrigatorios);
    let sobra = faltaParaFechar;
    for (const b of tier3) {
      const codigo: ReasonCode = b.custoRelativo && b.custoRelativo > 0 ? "HIGH_COST_DEBT" : "MINIMUM_REQUIRED";
      if (sobra >= b.valor) {
        pagarAgora.push(paraItem(b, codigo));
        sobra -= b.valor;
      } else {
        podeEsperar.push(paraItem(b, "LOWER_PRIORITY"));
      }
    }
  } else {
    // Não fecha nem o obrigatório: tudo que é crítico (tier1) ainda vai
    // pra "pagar agora" (é o que tem consequência mais grave em não
    // pagar); o que sobrar de tier2 sem orçamento vai pra
    // "negociar/rever" em vez de fingir que também vai ser pago.
    pagarAgora.push(...tier1.map((b) => paraItem(b, "RISK_SERVICE_CUTOFF" as ReasonCode)));
    let orcamentoRestante = orcamentoParaDividas - tier1.reduce((s, b) => s + b.valor, 0);
    for (const b of tier2) {
      const codigo: ReasonCode = b.emAtraso ? "OVERDUE" : "DUE_SOON";
      if (orcamentoRestante >= b.valor) {
        pagarAgora.push(paraItem(b, codigo));
        orcamentoRestante -= b.valor;
      } else {
        negociarRever.push(paraItem(b, codigo));
      }
    }
    podeEsperar.push(...tier3.map((b) => paraItem(b, "LOWER_PRIORITY" as ReasonCode)));
  }

  return {
    calculavel: true,
    rendaDisponivel,
    totalDespesasNaoDivida: resumo.totais.totalSaidasSemDividas,
    orcamentoParaDividas,
    totalObrigatorio,
    faltaParaFechar,
    pagarAgora,
    negociarRever,
    podeEsperar,
  };
}

// ── Meta/prazo ("quero quitar em X meses") ──────────────────────────
// Divisão simples e conservadora: não estimamos taxa de juros mensal
// (não temos esse dado — ver plano-pagamento-contrato.ts), então a
// parcela necessária é sempre saldoDevedor / prazoMeses. Na prática pagar
// mais rápido que o cronograma tende a reduzir o juro total também
// (direito à redução proporcional na quitação antecipada, Art. 52 §2º do
// CDC — mesmo princípio já citado em rota-livre-dividas.ts), mas não
// devolvemos esse número por não sabermos calcular com precisão.
export interface MetaPrazoResultado {
  credor: string;
  saldoDevedor: number;
  parcelaAtual: number | null;
  prazoAtualMeses: number | null;
  prazoDesejadoMeses: number;
  parcelaNecessaria: number;
  diferencaMensal: number;
}

export async function calcularParaMeta(clienteId: string, dividaId: string, prazoDesejadoMeses: number): Promise<MetaPrazoResultado | null> {
  if (prazoDesejadoMeses <= 0) return null;

  const divida = await prisma.divida.findFirst({
    where: { id: dividaId, clienteId, status: "ATIVA" },
    include: { parcelas: { where: { status: "PENDENTE" }, orderBy: { vencimento: "asc" } } },
  });
  if (!divida) return null;

  const saldoDevedor = Math.max(divida.valorTotal - divida.valorPago, 0);
  const parcelaAtual = divida.parcelas[0]?.valor ?? null;
  const prazoAtualMeses = divida.parcelas.length > 0 ? divida.parcelas.length : null;
  const parcelaNecessaria = Math.round((saldoDevedor / prazoDesejadoMeses) * 100) / 100;

  return {
    credor: divida.credor,
    saldoDevedor,
    parcelaAtual,
    prazoAtualMeses,
    prazoDesejadoMeses,
    parcelaNecessaria,
    diferencaMensal: parcelaAtual != null ? Math.round((parcelaNecessaria - parcelaAtual) * 100) / 100 : parcelaNecessaria,
  };
}

export { fmt as fmtValorPlano };
