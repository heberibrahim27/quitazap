// ─────────────────────────────────────────
// QuitaZAP — "Até o próximo salário" por WhatsApp (Skill Analista)
// ─────────────────────────────────────────
// "Quanto tenho até o próximo salário?" / "limite seguro por dia?" —
// sempre lê de src/lib/financeiro/limite-seguro.ts (que só consome o
// motor central), nunca recalcula por conta própria. IA só formata; se
// falhar, cai num texto determinístico equivalente.
//
// Regex deliberadamente sem a palavra "gastar" — evita colidir com
// "posso gastar" (detectarConsultaFinanceira, tipo posso_gastar), que já
// cobre pergunta de valor específico ("posso gastar 50 hoje?").

import { calcularLimiteSeguro } from "@/lib/financeiro/limite-seguro";
import { chatCompletion } from "@/lib/ai/openai-client";

const REGEX_LIMITE_SEGURO =
  /\b(?:limite\s+(?:seguro\s+)?(?:por\s+dia|di[aá]rio)|quanto\s+(?:tenho|sobra)\s+(?:por\s+dia|at[eé]\s+o\s+(?:pr[oó]ximo\s+)?sal[aá]rio)|at[eé]\s+o\s+(?:pr[oó]ximo\s+)?sal[aá]rio|quanto\s+falta\s+(?:pro|para\s+o)\s+(?:pr[oó]ximo\s+)?sal[aá]rio)\b/i;

export function detectarLimiteSeguro(mensagem: string): boolean {
  return REGEX_LIMITE_SEGURO.test(mensagem);
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDataDia(diaISO: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${diaISO}T12:00:00`));
}

async function fatosLimiteSeguro(clienteId: string) {
  return calcularLimiteSeguro(clienteId);
}

function fallbackLimiteSeguro(f: Awaited<ReturnType<typeof fatosLimiteSeguro>>): string {
  const base =
    f.diasRestantes > 0
      ? `Faltam ${f.diasRestantes} dia${f.diasRestantes !== 1 ? "s" : ""} pro fim do mês. Você tem ${fmt(Math.max(f.saldoLivre, 0))} livres, com ${fmt(f.compromissosRestantes)} ainda em compromissos — limite seguro por dia: ${fmt(Math.max(f.limiteSeguroDiario, 0))}.`
      : `O mês está no último dia. Sobra livre: ${fmt(Math.max(f.saldoLivre, 0))}, com ${fmt(f.compromissosRestantes)} ainda em compromissos.`;
  if (f.saldoLivre < 0) {
    return `Atenção: sua sobra prevista até o fim do mês já está negativa (${fmt(f.saldoLivre)}), considerando os ${fmt(f.compromissosRestantes)} que ainda faltam vencer.`;
  }
  if (f.diaApertado) {
    return `${base} Fique de olho no dia ${fmtDataDia(f.diaApertado.data)}: ${f.diaApertado.itens.length} contas vencem juntas nesse dia, somando ${fmt(f.diaApertado.totalNoDia)}.`;
  }
  return base;
}

async function frasearComIA(fatos: unknown, clienteId: string, gratuito: boolean, fallback: () => string): Promise<string> {
  try {
    const { conteudo } = await chatCompletion({
      model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      mensagens: [
        {
          role: "system",
          content:
            "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente do que já vem pronto. \"Próximo salário\" aqui é uma aproximação pro fim do mês corrente (o app não sabe a data exata do salário) — não afirme uma data de salário que não está nos dados. Se diaApertado não for null, avise claramente a data e quantas contas coincidem nela. Responda em português do Brasil, tom direto e amigável, no máximo 5 linhas, emoji com moderação.",
        },
        { role: "user", content: `Dados reais (JSON, já calculados — só formate):\n${JSON.stringify(fatos)}` },
      ],
      maxTokens: 300,
      telemetria: { clienteId, gratuito, skill: "limite-seguro" },
    });
    return conteudo?.trim() || fallback();
  } catch (e) {
    console.error("[LimiteSeguro] Erro ao formatar com IA, usando fallback determinístico:", e);
    return fallback();
  }
}

export async function responderLimiteSeguro(clienteId: string, gratuito: boolean): Promise<string> {
  const fatos = await fatosLimiteSeguro(clienteId);
  return frasearComIA(fatos, clienteId, gratuito, () => fallbackLimiteSeguro(fatos));
}
