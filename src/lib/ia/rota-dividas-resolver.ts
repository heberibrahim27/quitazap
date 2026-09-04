// ─────────────────────────────────────────
// QuitaZAP — "Rota para ficar livre das dívidas" por WhatsApp (Skill Analista)
// ─────────────────────────────────────────
// "Qual dívida eu pago primeiro?" / "como fico livre das minhas dívidas?"
// — sempre lê de src/lib/financeiro/rota-livre-dividas.ts, nunca
// recalcula por conta própria. IA só formata; fallback determinístico se
// falhar.

import { calcularRotaLivreDividas } from "@/lib/financeiro/rota-livre-dividas";
import { chatCompletion } from "@/lib/ai/openai-client";

const REGEX_ROTA_DIVIDAS =
  /\b(?:qual\s+d[ií]vida\s+(?:eu\s+|devo\s+)?(?:pag[oaer]*|quit[oaer]*)\s+primeiro|por\s+onde\s+(?:eu\s+)?come[cç]o\s+a\s+pagar|como\s+(?:eu\s+)?fic(?:o|ar)\s+livre\s+d(?:e|as)\s+(?:minhas\s+)?d[ií]vidas|como\s+(?:eu\s+)?sa(?:io|ir)\s+(?:livre\s+)?d(?:e|as)\s+(?:minhas\s+)?d[ií]vidas|rota\s+(?:pra|para)\s+(?:ficar\s+livre|sair)\s+d(?:e|as)\s+d[ií]vidas)\b/i;

export function detectarRotaDividas(mensagem: string): boolean {
  return REGEX_ROTA_DIVIDAS.test(mensagem);
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
            "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente do que já vem pronto. Explique as duas estratégias (menor saldo primeiro vs maior juros primeiro) de forma simples, cite os nomes reais das dívidas do JSON, e se prioridadeJuros não for null, destaque quanto de juros dá pra economizar quitando ela à vista. Se prioridadeJuros for null, diga que não há juros identificável nos dados. Responda em português do Brasil, tom direto e amigável, no máximo 6 linhas, emoji com moderação.",
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

export async function responderRotaDividas(clienteId: string, gratuito: boolean): Promise<string> {
  const fatos = await fatosRotaDividas(clienteId);
  const resposta = await frasearComIA(fatos, clienteId, gratuito, () => fallbackRotaDividas(fatos));
  return `${resposta}\n\n_Análise baseada nas informações registradas no QuitaZap._`;
}
