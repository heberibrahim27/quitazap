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
//
// Guarda-corpos de segurança/qualidade (revisão pré-lançamento, 2026-09):
// 1) "posso gastar" NUNCA é apresentado como saldo bancário real — sempre
//    leva um aviso fixo de que é só o que está cadastrado no QuitaZap (sem
//    Open Finance ainda). O aviso é anexado em código, não depende da IA
//    obedecer o prompt.
// 2) "onde gasto mais" é sempre um recorte do mês corrente — nunca uma
//    conclusão permanente sobre o padrão de vida da pessoa.
// 3) "como economizar" só aponta categorias com excesso real sobre o
//    próprio histórico da pessoa (não a maior categoria só por ser maior);
//    se o valor pedido for maior que a margem real identificada, a
//    resposta deixa isso explícito em vez de inventar um corte impossível.

import { calcularResumoFinanceiro, calcularMediaMensal, limitesDoMes, anoMesAtualBrasil } from "@/lib/financeiro/motor";
import type { PorCategoria } from "@/lib/financeiro/motor-contrato";
import { chatCompletion } from "@/lib/ai/openai-client";
import { parseMoneyBR } from "@/lib/money";

export type TipoConsultaFinanceira = "posso_gastar" | "onde_gasto_mais" | "como_economizar";

const DISCLAIMER_POSSO_GASTAR =
  "\n\n_Baseado só no que está cadastrado no QuitaZap — ainda não é seu saldo bancário real (sem integração com o banco ainda)._";

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
    fonte: "dados cadastrados no QuitaZap, não é saldo bancário real",
  };
}

async function fatosOndeGastoMais(clienteId: string) {
  const resumo = await calcularResumoFinanceiro({ clienteId, periodo: periodoAtual() });
  const ranking = [...resumo.porCategoria].sort((a, b) => b.total - a.total).slice(0, 5);
  return { periodo: "mes_atual", ranking, totalDespesasOperacionais: resumo.totais.totalSaidasOperacionais };
}

async function fatosComoEconomizar(clienteId: string, valorAlvo: number | null) {
  const periodo = periodoAtual();
  const [resumo, media] = await Promise.all([
    calcularResumoFinanceiro({ clienteId, periodo }),
    calcularMediaMensal(clienteId, periodo, 3),
  ]);
  const mediaPorCategoria = new Map(media.porCategoria.map((m: PorCategoria) => [m.categoria, m.total]));
  // Só entra como "candidato a corte" quem já tem histórico (média > 0) E
  // está gastando ACIMA do próprio histórico este mês — é a única margem
  // que dá pra chamar de real (voltar ao que já é normal pra essa pessoa),
  // nunca simplesmente a maior categoria do mês.
  const candidatos = resumo.porCategoria
    .map((c) => ({
      categoria: c.categoria,
      totalEsteMes: c.total,
      mediaUltimos3Meses: mediaPorCategoria.get(c.categoria) ?? 0,
    }))
    .filter((c) => c.mediaUltimos3Meses > 0 && c.totalEsteMes > c.mediaUltimos3Meses)
    .map((c) => ({ ...c, excesso: c.totalEsteMes - c.mediaUltimos3Meses }))
    .sort((a, b) => b.excesso - a.excesso)
    .slice(0, 3);
  const margemRealizavel = candidatos.reduce((acc, c) => acc + c.excesso, 0);
  const sobraAtual = resumo.comprometimento.calculavel ? resumo.comprometimento.saldoProjetado : resumo.totais.resultadoSemPlano;
  return {
    valorAlvo,
    candidatos,
    margemRealizavel,
    sobraAtual,
    alvoRealista: valorAlvo == null ? null : valorAlvo <= margemRealizavel,
  };
}

function fallbackPossoGastar(f: Awaited<ReturnType<typeof fatosPossoGastar>>): string {
  if (f.cabeNaSobraDoMes) {
    return `Sim, cabe. Sua sobra prevista este mês é de ${fmt(f.sobraDoMes)} — gastando ${fmt(f.valorPretendido)}, ainda sobra ${fmt(f.sobraDoMes - f.valorPretendido)}.`;
  }
  return `Melhor segurar essa: sua sobra prevista este mês é de ${fmt(f.sobraDoMes)}, menor que os ${fmt(f.valorPretendido)} que você quer gastar.`;
}

function fallbackOndeGastoMais(f: Awaited<ReturnType<typeof fatosOndeGastoMais>>): string {
  const linhas = f.ranking.map((c, i) => `${i + 1}. ${c.categoria}: ${fmt(c.total)}`);
  return `Este mês, suas maiores categorias de gasto são:\n${linhas.join("\n")}`;
}

function fallbackComoEconomizar(f: Awaited<ReturnType<typeof fatosComoEconomizar>>): string {
  const linhas = f.candidatos.map((c) => `• ${c.categoria}: ${fmt(c.totalEsteMes)} este mês (média: ${fmt(c.mediaUltimos3Meses)})`);
  let alvoTexto = "";
  if (f.valorAlvo != null) {
    alvoTexto = f.alvoRealista
      ? ` Isso já cobre o objetivo de ${fmt(f.valorAlvo)}.`
      : ` Isso dá até ${fmt(f.margemRealizavel)} de corte realista este mês — abaixo dos ${fmt(f.valorAlvo)} que você pediu, então não dá pra chegar lá só voltando ao seu padrão normal nessas categorias.`;
  }
  return `Categorias com gasto acima do seu próprio histórico este mês:\n${linhas.join("\n")}\n\nVoltando ao ritmo normal nessas, dá pra economizar até ${fmt(f.margemRealizavel)}.${alvoTexto}`;
}

async function frasearComIA(
  pergunta: string,
  fatos: unknown,
  clienteId: string,
  gratuito: boolean,
  fallback: () => string,
  instrucoesExtras?: string,
): Promise<string> {
  try {
    const { conteudo } = await chatCompletion({
      model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      mensagens: [
        {
          role: "system",
          content:
            "Você é o assistente financeiro do QuitaZAP, respondendo pelo WhatsApp. Use SOMENTE os números do JSON fornecido — nunca invente, recalcule ou arredonde de forma diferente do que já vem pronto. Responda em português do Brasil, tom direto e amigável, no máximo 4-5 linhas, emoji com moderação." +
            (instrucoesExtras ? ` ${instrucoesExtras}` : ""),
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
    const resposta = await frasearComIA(
      mensagemOriginal, fatos, clienteId, gratuito,
      () => fallbackPossoGastar(fatos),
      "Nunca chame esses números de saldo bancário real — são só o que já está cadastrado no QuitaZap.",
    );
    // Aviso fixo, anexado em código (não depende da IA obedecer o prompt) —
    // ver guarda-corpo 1 no cabeçalho do arquivo.
    return `${resposta}${DISCLAIMER_POSSO_GASTAR}`;
  }

  if (tipo === "onde_gasto_mais") {
    const fatos = await fatosOndeGastoMais(clienteId);
    if (fatos.ranking.length === 0) return "Ainda não tenho gastos categorizados este mês pra te mostrar onde você mais gasta.";
    return frasearComIA(
      mensagemOriginal, fatos, clienteId, gratuito,
      () => fallbackOndeGastoMais(fatos),
      "Sempre deixe claro que é o recorte deste mês (período atual) — nunca fale como se fosse um traço permanente da vida financeira da pessoa.",
    );
  }

  // como_economizar
  const valorAlvo = parseMoneyBR(mensagemOriginal) ?? null;
  const fatos = await fatosComoEconomizar(clienteId, valorAlvo);
  if (fatos.candidatos.length === 0) {
    return "Suas despesas este mês estão dentro do seu próprio padrão normal — não encontrei uma categoria específica acima da média pra sugerir corte.";
  }
  return frasearComIA(
    mensagemOriginal, fatos, clienteId, gratuito,
    () => fallbackComoEconomizar(fatos),
    "Se o campo alvoRealista for false, deixe claro que cortando só o que está acima do normal não dá pra chegar no valor pedido — sugira margemRealizavel como meta alcançável em vez disso. Nunca sugira um corte que os números não sustentam.",
  );
}
