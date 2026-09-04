// ─────────────────────────────────────────
// QuitaZAP — Consulta financeira por WhatsApp (Skill Analista, prioridade 2)
// ─────────────────────────────────────────
// Três perguntas em linguagem natural, sempre respondidas consultando o
// motor central (src/lib/financeiro/motor.ts) — nunca recalculando por
// conta própria. A IA só formata a resposta em cima dos números que o
// motor já devolveu; se a chamada de IA falhar por qualquer motivo, cai
// num texto determinístico equivalente (nunca fica sem responder).
//
// Regex de detecção deliberadamente ancorada em frases bem específicas
// ("posso gastar", "onde... gastando mais", "como... economizar") pra não
// colidir com o resto da cascata do webhook (registrar gasto, "saldo",
// etc — ver ehConsultaSaldoControle em controle-financeiro-flow.ts, que já
// cobre "resumo do mês"/"meu saldo" com outro motor de cálculo, legado).

import { calcularResumoFinanceiro, calcularMediaMensal, limitesDoMes, anoMesAtualBrasil } from "@/lib/financeiro/motor";
import type { PorCategoria } from "@/lib/financeiro/motor-contrato";
import { chatCompletion } from "@/lib/ai/openai-client";
import { parseMoneyBR } from "@/lib/money";

export type TipoConsultaFinanceira = "posso_gastar" | "onde_gasto_mais" | "como_economizar";

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function detectarConsultaFinanceira(mensagem: string): TipoConsultaFinanceira | null {
  const t = normalizar(mensagem);
  if (/\bposso\s+gastar\b/.test(t)) return "posso_gastar";
  if (/\bonde\b[\s\S]{0,25}\bgast(?:ando|o)\s+mais\b/.test(t) || /\bonde\s+(?:eu\s+)?(?:estou\s+)?gastando\b/.test(t)) return "onde_gasto_mais";
  if (/\bcomo\b[\s\S]{0,25}\beconomiz/.test(t)) return "como_economizar";
  return null;
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function periodoAtual() {
  const { ano, mes } = anoMesAtualBrasil(new Date());
  return limitesDoMes(ano, mes);
}

async function fatosPossoGastar(clienteId: string, valorPretendido: number) {
  const resumo = await calcularResumoFinanceiro({ clienteId, periodo: periodoAtual() });
  const sobraDoMes = resumo.comprometimento.calculavel ? resumo.comprometimento.saldoProjetado : resumo.totais.resultadoSemPlano;
  const diasRestantes = resumo.previsao?.diasRestantes ?? null;
  const limiteDiarioSeguro = diasRestantes && diasRestantes > 0 ? sobraDoMes / diasRestantes : null;
  return {
    valorPretendido,
    sobraDoMes,
    diasRestantesNoMes: diasRestantes,
    limiteDiarioSeguro,
    cabeNaSobraDoMes: sobraDoMes - valorPretendido >= 0,
  };
}

async function fatosOndeGastoMais(clienteId: string) {
  const resumo = await calcularResumoFinanceiro({ clienteId, periodo: periodoAtual() });
  const ranking = [...resumo.porCategoria].sort((a, b) => b.total - a.total).slice(0, 5);
  return { ranking, totalDespesasOperacionais: resumo.totais.totalSaidasOperacionais };
}

async function fatosComoEconomizar(clienteId: string, valorAlvo: number | null) {
  const periodo = periodoAtual();
  const [resumo, media] = await Promise.all([
    calcularResumoFinanceiro({ clienteId, periodo }),
    calcularMediaMensal(clienteId, periodo, 3),
  ]);
  const mediaPorCategoria = new Map(media.porCategoria.map((m: PorCategoria) => [m.categoria, m.total]));
  const candidatos = resumo.porCategoria
    .filter((c) => c.total > 0)
    .map((c) => ({ categoria: c.categoria, totalEsteMes: c.total, mediaUltimos3Meses: mediaPorCategoria.get(c.categoria) ?? 0 }))
    .sort((a, b) => b.totalEsteMes - a.totalEsteMes)
    .slice(0, 3);
  const sobraAtual = resumo.comprometimento.calculavel ? resumo.comprometimento.saldoProjetado : resumo.totais.resultadoSemPlano;
  return { valorAlvo, candidatos, sobraAtual };
}

function fallbackPossoGastar(f: Awaited<ReturnType<typeof fatosPossoGastar>>): string {
  if (f.cabeNaSobraDoMes) {
    return `Sim, cabe. Sua sobra prevista este mês é de ${fmt(f.sobraDoMes)} — gastando ${fmt(f.valorPretendido)}, ainda sobra ${fmt(f.sobraDoMes - f.valorPretendido)}.`;
  }
  return `Melhor segurar essa: sua sobra prevista este mês é de ${fmt(f.sobraDoMes)}, menor que os ${fmt(f.valorPretendido)} que você quer gastar.`;
}

function fallbackOndeGastoMais(f: Awaited<ReturnType<typeof fatosOndeGastoMais>>): string {
  const linhas = f.ranking.map((c, i) => `${i + 1}. ${c.categoria}: ${fmt(c.total)}`);
  return `Suas maiores categorias de gasto este mês:\n${linhas.join("\n")}`;
}

function fallbackComoEconomizar(f: Awaited<ReturnType<typeof fatosComoEconomizar>>): string {
  const linhas = f.candidatos.map((c) => `• ${c.categoria}: ${fmt(c.totalEsteMes)} este mês`);
  const alvo = f.valorAlvo ? ` para tentar chegar perto de ${fmt(f.valorAlvo)}` : "";
  return `Suas maiores categorias de gasto variável este mês${alvo}:\n${linhas.join("\n")}\n\nVale olhar essas primeiro pra cortar.`;
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
            "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente do que já vem pronto. Responda em português do Brasil, tom direto e amigável, no máximo 4-5 linhas, emoji com moderação.",
        },
        { role: "user", content: `Pergunta do cliente: "${pergunta}"\n\nDados reais (JSON, já calculados — só formate):\n${JSON.stringify(fatos)}` },
      ],
      maxTokens: 300,
      telemetria: { clienteId, gratuito, skill: "consulta-financeira" },
    });
    return conteudo?.trim() || fallback();
  } catch (e) {
    console.error("[ConsultaFinanceira] Erro ao formatar com IA, usando fallback determinístico:", e);
    return fallback();
  }
}

export async function responderConsultaFinanceira(
  tipo: TipoConsultaFinanceira,
  clienteId: string,
  mensagemOriginal: string,
  gratuito: boolean,
): Promise<string> {
  if (tipo === "posso_gastar") {
    const valor = parseMoneyBR(mensagemOriginal);
    if (valor == null) return "Me diz o valor — ex: \"posso gastar 50 hoje?\"";
    const fatos = await fatosPossoGastar(clienteId, valor);
    return frasearComIA(mensagemOriginal, fatos, clienteId, gratuito, () => fallbackPossoGastar(fatos));
  }

  if (tipo === "onde_gasto_mais") {
    const fatos = await fatosOndeGastoMais(clienteId);
    if (fatos.ranking.length === 0) return "Ainda não tenho gastos categorizados este mês pra te mostrar onde você mais gasta.";
    return frasearComIA(mensagemOriginal, fatos, clienteId, gratuito, () => fallbackOndeGastoMais(fatos));
  }

  // como_economizar
  const valorAlvo = parseMoneyBR(mensagemOriginal) ?? null;
  const fatos = await fatosComoEconomizar(clienteId, valorAlvo);
  if (fatos.candidatos.length === 0) return "Ainda não tenho gastos suficientes este mês pra sugerir onde cortar.";
  return frasearComIA(mensagemOriginal, fatos, clienteId, gratuito, () => fallbackComoEconomizar(fatos));
}
