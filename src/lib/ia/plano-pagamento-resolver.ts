// ─────────────────────────────────────────
// QuitaZAP — "Plano de Pagamento" por WhatsApp (Skill Analista)
// ─────────────────────────────────────────
// "Monta meu plano de pagamento" / "o que eu pago primeiro esse mês?" /
// "quero quitar o Carrefour em 6 meses" — sempre lê de
// src/lib/plano-pagamento-motor.ts, nunca recalcula por conta própria. A
// IA só formata a resposta em cima dos números que o motor já devolveu;
// se falhar, cai num texto determinístico equivalente. Mesmo princípio de
// rota-dividas-resolver.ts/simulador-parcela-resolver.ts.
//
// Duas intenções distintas:
// 1. Plano do mês — ordem recomendada de pagamento dado o orçamento atual
//    (calcularPlanoPagamento). Não confundir com "rota pra ficar livre
//    das dívidas" (rota-dividas-resolver.ts), que é sobre estratégia de
//    longo prazo (menor saldo vs. maior juros), não sobre o mês corrente.
// 2. Meta/prazo — "quero quitar X em N meses/anos" (calcularParaMeta).
//    Precisa identificar a dívida citada por nome; reaproveita o mesmo
//    fuzzy-match por credor já usado no fluxo de tarefas
//    (encontrarDividaCorrespondente).

import { prisma } from "@/lib/prisma";
import { calcularPlanoPagamento, calcularParaMeta, type ItemPlano } from "@/lib/plano-pagamento-motor";
import { encontrarDividaCorrespondente } from "@/lib/tarefa-flow";
import { chatCompletion } from "@/lib/ai/openai-client";

const REGEX_PLANO_PAGAMENTO =
  /\b(?:(?:monta|montar|monte|faz|fazer|faça|ver|mostra|mostrar)\s+(?:o\s+)?meu\s+plano\s+de\s+pagamento|plano\s+de\s+pagamento|o\s+que\s+(?:eu\s+)?(?:devo\s+)?pag(?:o|ar)\s+primeiro\s+esse\s+m[eê]s|ordem\s+(?:de\s+|pra\s+|para\s+)?pag(?:ar|amento)|quais\s+contas\s+(?:eu\s+)?(?:devo\s+|preciso\s+)?pag(?:ar)?\s+esse\s+m[eê]s)\b/i;

export function detectarPlanoPagamento(mensagem: string): boolean {
  return REGEX_PLANO_PAGAMENTO.test(mensagem);
}

const REGEX_META_PRAZO =
  /\bquero\s+(?:quitar|pagar|terminar\s+de\s+pagar)\s+(?:a\s+|o\s+|minha\s+|meu\s+)?(?:d[ií]vida\s+(?:d[eo]\s+)?)?(.+?)\s+em\s+(\d{1,2})\s*(meses|mes|m[êe]s|anos?)\b/i;

export interface MetaPrazoDetectada {
  credorTexto: string;
  prazoDesejadoMeses: number;
}

export function detectarMetaPrazo(mensagem: string): MetaPrazoDetectada | null {
  const match = REGEX_META_PRAZO.exec(mensagem);
  if (!match) return null;

  const credorTexto = match[1].trim();
  if (!credorTexto) return null;

  const quantidade = Number(match[2]);
  if (!Number.isInteger(quantidade) || quantidade < 1) return null;

  const ehAno = /^anos?$/i.test(match[3]);
  const prazoDesejadoMeses = ehAno ? quantidade * 12 : quantidade;
  if (prazoDesejadoMeses > 240) return null;

  return { credorTexto, prazoDesejadoMeses };
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Plano do mês ──────────────────────────────────────────────────

function resumirItens(itens: ItemPlano[]) {
  return itens.map((i) => ({ credor: i.credor, valor: i.valor, motivo: i.justificativa }));
}

async function fatosPlanoPagamento(clienteId: string) {
  const plano = await calcularPlanoPagamento(clienteId);
  const totalPagarAgora = plano.pagarAgora.reduce((soma, i) => soma + i.valor, 0);
  return {
    calculavel: plano.calculavel,
    rendaDisponivel: plano.rendaDisponivel,
    totalDespesasNaoDivida: plano.totalDespesasNaoDivida,
    orcamentoParaDividas: plano.orcamentoParaDividas,
    faltaParaFechar: plano.faltaParaFechar,
    livreDepoisDePagar: plano.orcamentoParaDividas - totalPagarAgora,
    pagarAgora: resumirItens(plano.pagarAgora),
    negociarRever: resumirItens(plano.negociarRever),
    podeEsperar: resumirItens(plano.podeEsperar),
  };
}

function fallbackPlanoPagamento(f: Awaited<ReturnType<typeof fatosPlanoPagamento>>): string {
  if (!f.calculavel) {
    return "Cadastre sua renda mensal no Perfil pra eu conseguir montar seu plano de pagamento deste mês.";
  }
  const semNenhumaDivida = f.pagarAgora.length === 0 && f.negociarRever.length === 0 && f.podeEsperar.length === 0;
  if (semNenhumaDivida) {
    return "Você não tem nenhuma dívida ativa registrada agora. 🎉";
  }

  const linhas: string[] = [];
  if (f.pagarAgora.length === 0) {
    linhas.push("Nada obrigatório este mês — dá pra deixar tudo pra depois.");
  } else {
    linhas.push("Pague nesta ordem este mês:");
    f.pagarAgora.forEach((item, i) => linhas.push(`${i + 1}. ${item.credor} — ${fmt(item.valor)} (${item.motivo})`));
    linhas.push(`Depois desses pagamentos: ${fmt(Math.abs(f.livreDepoisDePagar))} ${f.livreDepoisDePagar >= 0 ? "livres" : "faltando"} este mês.`);
  }

  if (f.negociarRever.length > 0) {
    linhas.push(`\n⚠️ Não fecha esse mês: faltam ${fmt(Math.abs(f.faltaParaFechar))} pra cobrir tudo. Considere negociar prazo ou valor com: ${f.negociarRever.map((i) => i.credor).join(", ")}.`);
  }

  return linhas.join("\n");
}

async function frasearComIA(fatos: unknown, clienteId: string, gratuito: boolean, skill: string, instrucao: string, fallback: () => string): Promise<string> {
  try {
    const { conteudo } = await chatCompletion({
      model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      mensagens: [
        { role: "system", content: instrucao },
        { role: "user", content: `Dados reais (JSON, já calculados — só formate):\n${JSON.stringify(fatos)}` },
      ],
      maxTokens: 400,
      telemetria: { clienteId, gratuito, skill },
    });
    return conteudo?.trim() || fallback();
  } catch (e) {
    console.error(`[${skill}] Erro ao formatar com IA, usando fallback determinístico:`, e);
    return fallback();
  }
}

const INSTRUCAO_PLANO_PAGAMENTO =
  "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números e nomes do JSON fornecido — nunca invente, recalcule, reordene ou arredonde de forma diferente do que já vem pronto (a ordem de pagarAgora já é a ordem recomendada). Liste os itens de pagarAgora numerados, citando credor, valor e o motivo (campo motivo). Diga quanto fica livre ou faltando depois desses pagamentos (livreDepoisDePagar). Se negociarRever não estiver vazio, avise que o mês não fecha e cite esses credores. Responda em português do Brasil, tom direto e amigável, no máximo 8 linhas, emoji com moderação.";

export async function responderPlanoPagamento(clienteId: string, gratuito: boolean): Promise<string> {
  const fatos = await fatosPlanoPagamento(clienteId);
  const resposta = await frasearComIA(fatos, clienteId, gratuito, "plano-pagamento", INSTRUCAO_PLANO_PAGAMENTO, () => fallbackPlanoPagamento(fatos));
  return `${resposta}\n\n_Análise baseada nas informações registradas no QuitaZap — não é consultoria financeira regulamentada._`;
}

// ── Meta/prazo ────────────────────────────────────────────────────

async function localizarDividaPorNome(clienteId: string, credorTexto: string) {
  const dividas = await prisma.divida.findMany({
    where: { clienteId, status: "ATIVA", descontadoEmFolha: false },
    select: { id: true, credor: true },
  });
  return encontrarDividaCorrespondente(credorTexto, dividas);
}

const INSTRUCAO_META_PRAZO =
  "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente do que já vem pronto. Diga qual seria a parcela necessária (parcelaNecessaria) pra quitar em prazoDesejadoMeses, comparando com a parcela atual (parcelaAtual) quando existir, e se diferencaMensal for positivo avise que a parcela ficaria maior; se for negativo, que ficaria menor. Responda em português do Brasil, tom direto e amigável, no máximo 5 linhas, emoji com moderação.";

function fallbackMetaPrazo(m: Awaited<ReturnType<typeof calcularParaMeta>>): string {
  if (!m) return "Não encontrei essa dívida pra calcular a meta.";
  const linhaAtual = m.parcelaAtual != null ? ` (hoje a parcela é ${fmt(m.parcelaAtual)}${m.prazoAtualMeses ? ` em ${m.prazoAtualMeses}x` : ""})` : "";
  return `Pra quitar "${m.credor}" em ${m.prazoDesejadoMeses} meses, a parcela precisaria ser de ${fmt(m.parcelaNecessaria)}${linhaAtual}.`;
}

export async function responderMetaPrazo(clienteId: string, gratuito: boolean, deteccao: MetaPrazoDetectada): Promise<string> {
  const divida = await localizarDividaPorNome(clienteId, deteccao.credorTexto);
  if (!divida) {
    return `Não achei nenhuma dívida ativa parecida com "${deteccao.credorTexto}" — me diga o nome exatamente como está cadastrado.`;
  }

  const meta = await calcularParaMeta(clienteId, divida.id, deteccao.prazoDesejadoMeses);
  if (!meta) {
    return "Não consegui calcular essa meta — confira o prazo informado.";
  }

  const resposta = await frasearComIA(meta, clienteId, gratuito, "plano-pagamento-meta", INSTRUCAO_META_PRAZO, () => fallbackMetaPrazo(meta));
  return `${resposta}\n\n_Estimativa baseada no saldo devedor atual — não considera juros de renegociação com o credor._`;
}
