// ─────────────────────────────────────────
// QuitaZAP — Orientador de Quitação (leitura do banco)
// ─────────────────────────────────────────
// Só LÊ: monta a entrada do motor puro (motor.ts) a partir dos dados do
// cliente. Nada aqui altera dado financeiro.

import { prisma } from "@/lib/prisma";
import { anoMesAtualBrasil, calcularResumoFinanceiro, limitesDoMes } from "@/lib/financeiro/motor";
import { diasCalendarioBrasil } from "@/lib/financeiro/dias-brasil";
import { riscoCritico } from "@/lib/financeiro/risco-tipo-divida";
import type { ProgressoDividas } from "./proativo";
import {
  formatarOrientacao,
  formatarSimulacaoExtra,
  montarFila,
  montarOrientacao,
  type DividaEntrada,
  type EntradaOrientacao,
  type Orientacao,
} from "./motor";

/** Meta usada como colchão ("Respiro"): achada pelo nome, sem coluna nova no banco. */
export const NOME_META_RESPIRO = "Respiro";

/** Dívidas do cliente prontas pro motor (leitura leve: não calcula o resumo financeiro). */
export async function carregarDividasParaOrientacao(clienteId: string, agora: Date = new Date()) {
  const dividas = await prisma.divida.findMany({
    where: { clienteId, status: { in: ["ATIVA", "QUITADA"] } },
    include: { parcelas: { where: { status: { not: "PAGA" } }, orderBy: { vencimento: "asc" } } },
  });

  const entradas: DividaEntrada[] = dividas
    .filter((d) => d.status === "ATIVA")
    .map((d) => {
      const proxima = d.parcelas[0] ?? null;
      return {
        id: d.id,
        credor: d.credor,
        tipo: d.tipo,
        saldoDevedor: Math.max(d.valorTotal - d.valorPago, 0),
        valorTotal: d.valorTotal,
        valorPago: d.valorPago,
        emAtraso: d.emAtraso,
        diasAtraso: d.emAtraso ? d.diasAtraso ?? 0 : 0,
        venceEmDias: proxima ? diasCalendarioBrasil(proxima.vencimento, agora) : null,
        risco: riscoCritico(d.tipo),
        consignado: d.descontadoEmFolha,
        parcelasPendentes: d.parcelas.map((p) => p.valor),
      };
    });

  const limiteRecente = agora.getTime() - 7 * 86_400_000;
  return {
    entradas,
    quitadas: dividas.filter((d) => d.status === "QUITADA").length,
    quitadasRecentes: dividas.filter((d) => d.status === "QUITADA" && d.atualizadoEm.getTime() >= limiteRecente).map((d) => ({ id: d.id, credor: d.credor })),
    totalContratado: dividas.reduce((s, d) => s + d.valorTotal, 0),
    totalPago: dividas.reduce((s, d) => s + d.valorPago, 0),
  };
}

/** Progresso de quitação pro agente proativo (marcos e dívida quitada). Leve: só dívidas. */
export async function carregarProgressoDividas(clienteId: string, agora: Date = new Date()): Promise<ProgressoDividas> {
  const d = await carregarDividasParaOrientacao(clienteId, agora);
  const alvo = montarFila(d.entradas)[0] ?? null;
  return {
    totalContratado: d.totalContratado,
    totalPago: d.totalPago,
    quitadasRecentes: d.quitadasRecentes,
    faltaPagar: Math.max(d.totalContratado - d.totalPago, 0),
    proximoAlvo: alvo ? { credor: alvo.credor, saldoDevedor: alvo.saldoDevedor } : null,
  };
}

export async function carregarEntradaOrientacao(clienteId: string, agora: Date = new Date()): Promise<EntradaOrientacao & { dividasCompletas: DividaEntrada[] }> {
  const { ano, mes } = anoMesAtualBrasil(agora);
  const periodo = limitesDoMes(ano, mes);

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { rendaMensal: true } });
  const resumo = await calcularResumoFinanceiro({ clienteId, periodo, rendaMensalDeclarada: cliente?.rendaMensal ?? null });

  const [d, metas] = await Promise.all([
    carregarDividasParaOrientacao(clienteId, agora),
    prisma.meta.findMany({
      where: { clienteId, nome: { contains: "respiro", mode: "insensitive" } },
      include: { depositos: { select: { valor: true } } },
    }),
  ]);
  const respiroAtual = metas.reduce((s, m) => s + m.depositos.reduce((a, dep) => a + dep.valor, 0), 0);

  return {
    rendaEfetiva: resumo.comprometimento.rendaEfetiva ?? null,
    percentualComprometido: resumo.comprometimento.calculavel ? resumo.comprometimento.percentualComprometido : null,
    saldoProjetado: resumo.comprometimento.calculavel ? resumo.comprometimento.saldoProjetado : resumo.totais.resultadoSemPlano,
    custoDeVidaMensal: resumo.totais.despesasFixas + resumo.totais.despesasVariaveis,
    respiroAtual: Math.max(respiroAtual, 0),
    respiroMetaExiste: metas.length > 0,
    dividas: d.entradas,
    dividasCompletas: d.entradas,
    quitadas: d.quitadas,
    totalContratado: d.totalContratado,
    totalPago: d.totalPago,
  };
}

export async function orientarQuitacao(clienteId: string, agora: Date = new Date()): Promise<{ orientacao: Orientacao; texto: string }> {
  const entrada = await carregarEntradaOrientacao(clienteId, agora);
  const orientacao = montarOrientacao(entrada);
  return { orientacao, texto: formatarOrientacao(orientacao) };
}

/** "E se eu pagar R$ X a mais por mês?" — simula na dívida que está na frente da fila. */
export async function simularPagamentoExtra(clienteId: string, extra: number, agora: Date = new Date()): Promise<string> {
  const entrada = await carregarEntradaOrientacao(clienteId, agora);
  const fila = montarFila(entrada.dividas);
  const alvo = fila[0];
  if (!alvo) return "Você não tem dívidas ativas para simular. 🎉";
  const divida = entrada.dividas.find((d) => d.id === alvo.id);
  return formatarSimulacaoExtra(alvo.credor, extra, divida?.parcelasPendentes ?? []);
}
