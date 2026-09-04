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
  // "Livre até lá" já desconta compromissosRestantes — por isso ele
  // aparece como explicação do valor livre, nunca como um segundo
  // desconto ainda pendente (evita dar a entender dupla contagem).
  const notaCompromissos = f.compromissosRestantes > 0
    ? ` (já descontando ${fmt(f.compromissosRestantes)} em dívidas que ainda vencem este mês)`
    : "";
  const base =
    f.diasRestantes > 0
      ? `Faltam ${f.diasRestantes} dia${f.diasRestantes !== 1 ? "s" : ""} pro fim do mês. Você tem ${fmt(Math.max(f.saldoLivre, 0))} livres${notaCompromissos} — limite seguro por dia: ${fmt(Math.max(f.limiteSeguroDiario, 0))}.`
      : `O mês está no último dia. Sobra livre: ${fmt(Math.max(f.saldoLivre, 0))}${notaCompromissos}.`;
  if (f.saldoLivre < 0) {
    return `Atenção: sua sobra prevista até o fim do mês já está negativa (${fmt(f.saldoLivre)}) — esse valor já inclui os ${fmt(f.compromissosRestantes)} de dívidas que ainda vencem este mês.`;
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
            "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente do que já vem pronto. \"Próximo salário\" aqui é uma aproximação pro fim do mês corrente (o app não sabe a data exata do salário) — não afirme uma data de salário que não está nos dados. saldoLivre JÁ desconta compromissosRestantes — nunca apresente os dois como se fossem descontos separados ou como se compromissosRestantes ainda fosse subtrair de saldoLivre; mencione compromissosRestantes só como explicação do que já está refletido em saldoLivre (ex: \"já descontando X em dívidas que ainda vencem\"). Se diaApertado não for null, avise claramente a data e quantas contas coincidem nela. Responda em português do Brasil, tom direto e amigável, no máximo 5 linhas, emoji com moderação.",
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
