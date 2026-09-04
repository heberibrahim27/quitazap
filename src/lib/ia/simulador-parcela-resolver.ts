// ─────────────────────────────────────────
// QuitaZAP — Simulador "essa parcela cabe?" por WhatsApp (Skill Analista)
// ─────────────────────────────────────────
// "Se eu comprar R$1.800 em 10x, como ficam meus próximos salários?" —
// sempre lê do motor central (src/lib/financeiro/simulador-parcela.ts,
// que por sua vez só consome motor.ts/plano-pagamento-service.ts), nunca
// recalcula por conta própria. A IA só formata a resposta em cima dos
// números que o motor já devolveu; se falhar, cai num texto determinístico
// equivalente.
//
// Escopo desta primeira versão: só entende a frase quando ela já traz o
// valor e a quantidade de parcelas explícitos ("em 10x", "em 10x de
// R$180", "em 10 vezes de 180"). Uma frase vaga tipo "essa parcela cabe?"
// sem nenhum valor no histórico não é resolvida aqui — pede pro cliente
// repetir com o valor.
//
// Regex exige, além do "em Nx"/"N vezes", uma pista de que é uma pergunta
// hipotética (interrogação, "se eu", "cabe", "consigo", "dá pra", "como
// fica") — evita disparar em cima de uma frase que só registra uma compra
// já feita ("comprei X em 10x", sem interrogação nem "se eu").

import { simularParcela } from "@/lib/financeiro/simulador-parcela";
import { chatCompletion } from "@/lib/ai/openai-client";
import { parseMoneyBR } from "@/lib/money";

export interface SimulacaoParcelaDetectada {
  valorParcela: number;
  quantidadeParcelas: number;
}

const REGEX_EM_NX = /\bem\s+(\d{1,3})\s*(?:x|vezes)\b(?:\s+de\s+(?:r\$\s*)?([\d.,]+))?/i;
const REGEX_PISTA_HIPOTETICA = /\?|(\bse\s+eu\b)|(\bcabe\b)|(\bconsigo\b)|(\bd[aá]\s+pra\b)|(\bcomo\s+fica)/i;

function extrairValorAntes(mensagem: string, ateIndice: number): number | undefined {
  const trecho = mensagem.slice(0, ateIndice);
  const candidatos = trecho.match(/(?:r\$\s*)?\d[\d.,]*/gi) ?? [];
  const ultimo = candidatos[candidatos.length - 1];
  return ultimo ? parseMoneyBR(ultimo) : undefined;
}

export function detectarSimulacaoParcela(mensagem: string): SimulacaoParcelaDetectada | null {
  const match = REGEX_EM_NX.exec(mensagem);
  if (!match || !REGEX_PISTA_HIPOTETICA.test(mensagem)) return null;

  const quantidadeParcelas = Number(match[1]);
  if (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas < 1 || quantidadeParcelas > 96) return null;

  let valorParcela: number | undefined;
  if (match[2]) {
    // "em 10x de R$180" — 180 já é o valor da parcela, direto.
    valorParcela = parseMoneyBR(match[2]);
  } else {
    // "R$1.800 em 10x" — 1.800 é o valor total, parcela = total / N.
    const valorTotal = extrairValorAntes(mensagem, match.index);
    if (valorTotal != null) valorParcela = Math.round((valorTotal / quantidadeParcelas) * 100) / 100;
  }
  if (valorParcela == null || valorParcela <= 0) return null;

  return { valorParcela, quantidadeParcelas };
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(v: number | null): string {
  return v == null ? "?" : `${Math.round(v * 100)}%`;
}

async function fatosSimulacaoParcela(clienteId: string, valorParcela: number, quantidadeParcelas: number) {
  const resultado = await simularParcela(clienteId, valorParcela, quantidadeParcelas);
  return {
    valorParcela,
    quantidadeParcelas,
    rendaBase: resultado.rendaBase,
    projecoes: resultado.projecoes,
    primeiroMesQueNaoFecha: resultado.primeiroMesQueNaoFecha,
    fechamTodos: resultado.primeiroMesQueNaoFecha == null,
  };
}

function fallbackSimulacaoParcela(f: Awaited<ReturnType<typeof fatosSimulacaoParcela>>): string {
  const primeira = f.projecoes[0];
  if (!primeira || !primeira.calculavel) {
    return "Ainda não consigo simular isso — cadastre sua renda no Perfil ou lance sua receita do mês pra eu conseguir calcular.";
  }
  const dePara = `${pct(primeira.percentualAtual)} pra ${pct(primeira.percentualComNova)}`;
  if (f.fechamTodos) {
    return `Cabe: seu comprometimento em ${primeira.nomeMes} sobe de ${dePara}, mas os próximos ${f.quantidadeParcelas} meses ainda fecham no positivo com essa parcela de ${fmt(f.valorParcela)}.`;
  }
  return `Atenção: seu comprometimento em ${primeira.nomeMes} sobe de ${dePara}, e ${f.primeiroMesQueNaoFecha} fecha no vermelho se você assumir essa parcela de ${fmt(f.valorParcela)}.`;
}

async function frasearComIA(
  pergunta: string,
  fatos: unknown,
  clienteId: string,
  gratuito: boolean,
  fallback: () => string,
): Promise<string> {
  try {
    const { conteudo } = await chatCompletion({
      model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      mensagens: [
        {
          role: "system",
          content:
            "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente do que já vem pronto. Cite o nome do mês em que o comprometimento sobe e, se existir primeiroMesQueNaoFecha, avise claramente qual mês fecharia no vermelho. Responda em português do Brasil, tom direto e amigável, no máximo 5 linhas, emoji com moderação.",
        },
        { role: "user", content: `Pergunta do cliente: "${pergunta}"\n\nDados reais (JSON, já calculados — só formate):\n${JSON.stringify(fatos)}` },
      ],
      maxTokens: 300,
      telemetria: { clienteId, gratuito, skill: "simulador-parcela" },
    });
    return conteudo?.trim() || fallback();
  } catch (e) {
    console.error("[SimuladorParcela] Erro ao formatar com IA, usando fallback determinístico:", e);
    return fallback();
  }
}

export async function responderSimulacaoParcela(
  clienteId: string,
  mensagemOriginal: string,
  gratuito: boolean,
  deteccao: SimulacaoParcelaDetectada,
): Promise<string> {
  const fatos = await fatosSimulacaoParcela(clienteId, deteccao.valorParcela, deteccao.quantidadeParcelas);
  const resposta = await frasearComIA(mensagemOriginal, fatos, clienteId, gratuito, () => fallbackSimulacaoParcela(fatos));
  return `${resposta}\n\n_Análise baseada nas informações registradas no QuitaZap._`;
}
