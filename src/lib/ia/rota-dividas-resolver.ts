// ─────────────────────────────────────────
// QuitaZAP — "Rota para ficar livre das dívidas" por WhatsApp (Skill Analista)
// ─────────────────────────────────────────
// "Qual dívida eu pago primeiro?" / "como fico livre das minhas dívidas?"
// — sempre lê de src/lib/financeiro/rota-livre-dividas.ts, nunca
// recalcula por conta própria. IA só formata; fallback determinístico se
// falhar.

import { calcularRotaLivreDividas } from "@/lib/financeiro/rota-livre-dividas";
import { chatCompletion } from "@/lib/ai/openai-client";
import { orientarQuitacao } from "@/lib/orientador-quitacao/service";
import { INSTRUCAO_FORMATACAO_WHATSAPP } from "./whatsapp-formatacao";

const REGEX_ROTA_DIVIDAS =
  /\b(?:qual\s+d[ií]vida\s+(?:eu\s+|devo\s+)?(?:pag[oaer]*|quit[oaer]*)\s+primeiro|por\s+onde\s+(?:eu\s+)?come[cç]o\s+a\s+pagar|como\s+(?:eu\s+)?fic(?:o|ar)\s+livre\s+d(?:e|as)\s+(?:minhas\s+)?d[ií]vidas|como\s+(?:eu\s+)?sa(?:io|ir)\s+(?:livre\s+)?d(?:e|as)\s+(?:minhas\s+)?d[ií]vidas|rota\s+(?:pra|para)\s+(?:ficar\s+livre|sair)\s+d(?:e|as)\s+d[ií]vidas|o\s+que\s+(?:eu\s+)?fa[cç]o\s+com\s+(?:a|minha)\s+sobra|como\s+(?:eu\s+)?quito\s+(?:minhas\s+|as\s+)?d[ií]vidas|(?:me\s+ajuda|quero\s+ajuda)\s+(?:a|pra|para)\s+(?:sair|quitar)|qual\s+d[ií]vida\s+(?:eu\s+|devo\s+)?ataco|quero\s+(?:sair|quitar)\s+(?:das|minhas)\s+d[ií]vidas)\b/i;

// "Preciso me livrar dos empréstimos", "quero acabar com as dívidas", "tô devendo muito" —
// o cliente não pergunta, declara o objetivo; a resposta é a mesma rota do Orientador.
const REGEX_ROTA_DIVIDAS_OBJETIVO =
  /\b(?:(?:preciso|quero|queria|gostaria\s+de|tenho\s+que|vou)\s+(?:me\s+)?(?:livrar|sair|fugir|acabar|quitar|pagar)\s+(?:d[aeo]s?|com\s+(?:as|os)|tod[ao]s?\s+(?:as|os)|meus|minhas)?\s*(?:minhas\s+|meus\s+)?(?:d[ií]vidas?|empr[eé]stimos?|consignados?|parcelas|cart[aã]o|cart[oõ]es|contas\s+atrasadas)|(?:t[oô]|estou|ando)\s+(?:muito\s+|bem\s+)?(?:devendo|endividad[oa]|afogad[oa]\s+em\s+d[ií]vidas?)|n[aã]o\s+(?:consigo|dou\s+conta\s+de)\s+(?:mais\s+)?pagar\s+(?:minhas|as|meus|os)\s+(?:d[ií]vidas?|contas|empr[eé]stimos?|parcelas))\b/i;

export function detectarRotaDividas(mensagem: string): boolean {
  return REGEX_ROTA_DIVIDAS.test(mensagem) || REGEX_ROTA_DIVIDAS_OBJETIVO.test(mensagem);
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

async function fatosRotaDividas(clienteId: string) {
  const resultado = await calcularRotaLivreDividas(clienteId);
  return {
    quantidadeDividas: resultado.porMenorSaldo.length,
    ordemMenorSaldo: resultado.porMenorSaldo.map((d) => ({ credor: d.credor, saldoDevedor: d.saldoDevedor })),
    ordemMaiorJuros: resultado.porMaiorJuros.map((d) => ({ credor: d.credor, saldoDevedor: d.saldoDevedor, jurosRestante: d.jurosRestante })),
    dataLivreDeTudo: resultado.dataLivreDeTudo,
    prioridadeJuros: resultado.prioridadeJuros
      ? { credor: resultado.prioridadeJuros.credor, saldoDevedor: resultado.prioridadeJuros.saldoDevedor, jurosRestante: resultado.prioridadeJuros.jurosRestante }
      : null,
  };
}

function fallbackRotaDividas(f: Awaited<ReturnType<typeof fatosRotaDividas>>): string {
  if (f.quantidadeDividas === 0) {
    return "Você não tem nenhuma dívida ativa registrada agora. 🎉";
  }
  const menorSaldo = f.ordemMenorSaldo[0];
  const linhaMenorSaldo = `Por menor saldo primeiro: comece por "${menorSaldo.credor}" (${fmt(menorSaldo.saldoDevedor)}).`;
  const linhaJuros = f.prioridadeJuros
    ? `Por maior juros primeiro: "${f.prioridadeJuros.credor}" tem ${fmt(f.prioridadeJuros.jurosRestante ?? 0)} de juros ainda embutido — quitando ela à vista, você economiza esse valor em vez de pagar o cronograma todo.`
    : "Por maior juros primeiro: nenhuma das suas dívidas tem juros identificável nos dados cadastrados (parcelamento sem juros, ou sem cronograma).";
  const linhaData = f.dataLivreDeTudo ? ` Se nada mudar, você fica livre de tudo em ${fmtData(f.dataLivreDeTudo)}.` : "";
  return `${linhaMenorSaldo}\n${linhaJuros}${linhaData}`;
}

async function frasearComIA(fatos: unknown, clienteId: string, gratuito: boolean, fallback: () => string): Promise<string> {
  try {
    const { conteudo } = await chatCompletion({
      model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      mensagens: [
        {
          role: "system",
          content:
            "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente do que já vem pronto. Explique as duas estratégias (menor saldo primeiro vs maior juros primeiro) de forma simples, cite os nomes reais das dívidas do JSON, e se prioridadeJuros não for null, destaque quanto de juros dá pra economizar quitando ela à vista. Se prioridadeJuros for null, diga que não há juros identificável nos dados. Responda em português do Brasil, tom direto e amigável, no máximo 6 linhas, emoji com moderação." +
            INSTRUCAO_FORMATACAO_WHATSAPP,
        },
        { role: "user", content: `Dados reais (JSON, já calculados — só formate):\n${JSON.stringify(fatos)}` },
      ],
      maxTokens: 350,
      telemetria: { clienteId, gratuito, skill: "rota-dividas" },
    });
    return conteudo?.trim() || fallback();
  } catch (e) {
    console.error("[RotaDividas] Erro ao formatar com IA, usando fallback determinístico:", e);
    return fallback();
  }
}

async function responderRotaDividasClassica(clienteId: string, gratuito: boolean): Promise<string> {
  const fatos = await fatosRotaDividas(clienteId);
  const resposta = await frasearComIA(fatos, clienteId, gratuito, () => fallbackRotaDividas(fatos));
  return `${resposta}\n\n_Análise baseada nas informações registradas no QuitaZap._`;
}

// Resposta oficial (os dois canais chamam esta): Orientador de Quitação — diagnóstico, AGORA /
// DEPOIS / PRÓXIMO ALVO, tudo calculado no backend (src/lib/orientador-quitacao). Se algo falhar,
// cai na rota clássica (menor saldo x maior juros) em vez de ficar sem resposta.
export async function responderRotaDividas(clienteId: string, gratuito: boolean): Promise<string> {
  try {
    const { texto } = await orientarQuitacao(clienteId);
    if (texto.trim()) return texto;
  } catch (e) {
    console.error("[Orientador] falhou, usando a rota clássica:", e);
  }
  return responderRotaDividasClassica(clienteId, gratuito);
}
