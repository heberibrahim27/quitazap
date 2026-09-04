// ─────────────────────────────────────────
// QuitaZAP — "Compra em horas de trabalho" por WhatsApp (Skill Analista)
// ─────────────────────────────────────────
// "Quantas horas de trabalho custa uma TV de R$1.500?" — sempre lê de
// src/lib/financeiro/horas-trabalho.ts, nunca recalcula por conta própria.
// IA só formata; fallback determinístico se falhar.

import { calcularHorasTrabalho } from "@/lib/financeiro/horas-trabalho";
import { chatCompletion } from "@/lib/ai/openai-client";
import { parseMoneyBR } from "@/lib/money";

const REGEX_HORAS_TRABALHO =
  /\b(?:quantas?\s+horas?(?:\s+de\s+trabalho)?|quantos?\s+dias?\s+(?:de\s+trabalho|[uú]teis)|quanto\s+tempo\s+(?:de\s+trabalho)?)\b[\s\S]{0,40}\b(?:pra|para|custa|equivale|trabalhar|comprar|pagar)\b/i;

export function detectarHorasTrabalho(mensagem: string): boolean {
  return REGEX_HORAS_TRABALHO.test(mensagem);
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtHoras(horas: number): string {
  return horas.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtDias(dias: number): string {
  return dias.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fallbackHorasTrabalho(f: Awaited<ReturnType<typeof calcularHorasTrabalho>>): string {
  if (!f.calculavel || f.horas == null || f.diasUteis == null) {
    return "Ainda não consigo calcular isso — cadastre sua renda no Perfil ou lance sua receita do mês pra eu conseguir converter em horas de trabalho.";
  }
  return (
    `${fmt(f.valor)} equivale a ${fmtHoras(f.horas)}h de trabalho (~${fmtDias(f.diasUteis)} dias úteis), ` +
    `considerando sua renda de ${fmt(f.rendaLiquidaMensal ?? 0)}/mês e uma jornada padrão de ${f.horasTrabalhoMensalAssumidas}h/mês ` +
    `(44h semanais, CLT) — não temos sua jornada real cadastrada ainda.`
  );
}

async function frasearComIA(pergunta: string, fatos: unknown, clienteId: string, gratuito: boolean, fallback: () => string): Promise<string> {
  try {
    const { conteudo } = await chatCompletion({
      model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      mensagens: [
        {
          role: "system",
          content:
            "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente do que já vem pronto. horasTrabalhoMensalAssumidas é um PADRÃO da CLT (44h semanais), não um dado real da pessoa — sempre deixe isso claro na resposta. Responda em português do Brasil, tom direto e amigável, no máximo 4 linhas, emoji com moderação.",
        },
        { role: "user", content: `Pergunta do cliente: "${pergunta}"\n\nDados reais (JSON, já calculados — só formate):\n${JSON.stringify(fatos)}` },
      ],
      maxTokens: 250,
      telemetria: { clienteId, gratuito, skill: "horas-trabalho" },
    });
    return conteudo?.trim() || fallback();
  } catch (e) {
    console.error("[HorasTrabalho] Erro ao formatar com IA, usando fallback determinístico:", e);
    return fallback();
  }
}

export async function responderHorasTrabalho(clienteId: string, mensagemOriginal: string, gratuito: boolean): Promise<string> {
  const valor = parseMoneyBR(mensagemOriginal);
  if (valor == null) return "Me diga o valor — ex: \"quantas horas de trabalho custa uma TV de R$1.500?\"";

  const fatos = await calcularHorasTrabalho(clienteId, valor);
  return frasearComIA(mensagemOriginal, fatos, clienteId, gratuito, () => fallbackHorasTrabalho(fatos));
}
