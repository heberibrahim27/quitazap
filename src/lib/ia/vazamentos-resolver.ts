// ─────────────────────────────────────────
// QuitaZAP — "Vazamentos do salário" por WhatsApp (Skill Analista)
// ─────────────────────────────────────────
// "Quais assinaturas eu tenho?" / "vazamentos do salário" — sempre lê de
// src/lib/financeiro/vazamentos-salario.ts, nunca recalcula por conta
// própria. IA só formata; fallback determinístico se falhar.

import { detectarVazamentosSalario } from "@/lib/financeiro/vazamentos-salario";
import { chatCompletion } from "@/lib/ai/openai-client";

const REGEX_VAZAMENTOS =
  /\b(?:vazamentos?\s+(?:do\s+)?sal[aá]rio|gastos?\s+recorrentes?|assinaturas?\s+(?:que\s+)?(?:eu\s+)?(?:pago|tenho)|quanto\s+gasto\s+(?:por\s+ano|no\s+ano)\s+com\s+assinaturas?)\b/i;

export function detectarConsultaVazamentos(mensagem: string): boolean {
  return REGEX_VAZAMENTOS.test(mensagem);
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function fatosVazamentos(clienteId: string) {
  const vazamentos = await detectarVazamentosSalario(clienteId);
  const totalMensal = vazamentos.reduce((soma, v) => soma + v.valorMensal, 0);
  const totalAnualizado = vazamentos.reduce((soma, v) => soma + v.valorAnualizado, 0);
  return { vazamentos, totalMensal, totalAnualizado };
}

function fallbackVazamentos(f: Awaited<ReturnType<typeof fatosVazamentos>>): string {
  if (f.vazamentos.length === 0) {
    return "Não identifiquei nenhum gasto recorrente com valor estável nos últimos meses (tipo assinatura). Isso pode ser porque você ainda não tem histórico suficiente, ou porque nada se repetiu com o mesmo valor.";
  }
  const linhas = f.vazamentos
    .slice(0, 8)
    .map((v) => `• ${v.descricao}: ${fmt(v.valorMensal)}/mês (${fmt(v.valorAnualizado)}/ano)`);
  return (
    `Encontrei ${f.vazamentos.length} gasto${f.vazamentos.length !== 1 ? "s" : ""} recorrente${f.vazamentos.length !== 1 ? "s" : ""}:\n` +
    `${linhas.join("\n")}\n\n` +
    `Total: ${fmt(f.totalMensal)}/mês — ${fmt(f.totalAnualizado)} por ano.`
  );
}

async function frasearComIA(fatos: unknown, clienteId: string, gratuito: boolean, fallback: () => string): Promise<string> {
  try {
    const { conteudo } = await chatCompletion({
      model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      mensagens: [
        {
          role: "system",
          content:
            "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente do que já vem pronto. Sempre mostre o valor mensal E o valor anualizado de cada item (a virada pro valor anual costuma impactar mais a percepção). Responda em português do Brasil, tom direto e amigável, no máximo 6 linhas, emoji com moderação.",
        },
        { role: "user", content: `Dados reais (JSON, já calculados — só formate):\n${JSON.stringify(fatos)}` },
      ],
      maxTokens: 350,
      telemetria: { clienteId, gratuito, skill: "vazamentos-salario" },
    });
    return conteudo?.trim() || fallback();
  } catch (e) {
    console.error("[Vazamentos] Erro ao formatar com IA, usando fallback determinístico:", e);
    return fallback();
  }
}

export async function responderConsultaVazamentos(clienteId: string, gratuito: boolean): Promise<string> {
  const fatos = await fatosVazamentos(clienteId);
  return frasearComIA(fatos, clienteId, gratuito, () => fallbackVazamentos(fatos));
}
