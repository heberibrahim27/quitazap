// ─────────────────────────────────────────
// Agente Quita — ponto de entrada (chat nativo e WhatsApp)
// ─────────────────────────────────────────
// Chamado por tentarResponderConsultaLivre ANTES do classificador de intenção
// única: quando o fluxo determinístico não resolveu e a mensagem parece
// pergunta, o Quita escolhe as ferramentas de leitura que precisa. Qualquer
// falha, timeout, resposta sem ferramenta ou flag desligada devolve null e o
// fluxo antigo segue exatamente como antes.
//
// Desligar: QUITA_AGENTE_ATIVO=false (só o Quita) ou AGENTES_DESLIGADOS=quita,…

import { prisma } from "@/lib/prisma";
import { chatCompletion, type MensagemChat as MensagemOpenAI } from "@/lib/ai/openai-client";
import { registrarExecucaoAgente } from "@/lib/agentes/alertas-store";
import { conversarComFerramentas, historicoDeSessaoWhatsApp, type MensagemHistorico } from "./loop";

export { historicoDeSessaoWhatsApp };
import { DEFINICOES_FERRAMENTAS, NOMES_FERRAMENTAS, criarExecutorFerramentas } from "./ferramentas";

const TEMPO_MAXIMO_MS = 12_000;

export function agenteDesligado(nome: string): boolean {
  const lista = (process.env.AGENTES_DESLIGADOS ?? "").split(",").map((s) => s.trim().toLowerCase());
  return lista.includes(nome);
}

export function quitaAtivo(): boolean {
  if (process.env.QUITA_AGENTE_ATIVO === "false") return false;
  if (agenteDesligado("quita")) return false;
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && !key.startsWith("sk-proj-SUA"));
}

/** Últimas mensagens da conversa (contexto de referência, nunca fonte de valor). */
async function carregarHistorico(clienteId: string, mensagemAtual: string): Promise<MensagemHistorico[]> {
  try {
    const linhas = await prisma.mensagemChat.findMany({
      where: { clienteId },
      orderBy: { criadoEm: "desc" },
      take: 6,
      select: { direcao: true, texto: true, dadosEstruturados: true },
    });
    const ordenadas = linhas.reverse();
    // O chat nativo grava a mensagem do cliente ANTES de processar: tira a duplicata.
    if (ordenadas.length > 0) {
      const ultima = ordenadas[ordenadas.length - 1];
      if (ultima.direcao === "CLIENTE" && ultima.texto.replace(/^🎤\s*/, "").trim() === mensagemAtual.trim()) ordenadas.pop();
    }
    return ordenadas
      .filter((l) => {
        const tipo = (l.dadosEstruturados as { tipo?: string } | null)?.tipo;
        return tipo !== "alerta_proativo"; // alerta automático não é diálogo
      })
      .slice(-4)
      .map((l) => ({ role: l.direcao === "CLIENTE" ? ("user" as const) : ("assistant" as const), content: l.texto }));
  } catch {
    return [];
  }
}

/**
 * Conversa livre: último recurso antes da resposta fixa de "fora de escopo". Mesma lógica nos dois
 * canais (chat do app e WhatsApp). Devolve null se o agente estiver desligado, estourar o tempo, a
 * guarda numérica reprovar ou o modelo não tiver o que dizer — quem chama segue com a resposta fixa.
 */
export async function responderConversaLivre(
  mensagem: string,
  clienteId: string,
  gratuito: boolean,
  historicoCanal?: MensagemHistorico[]
): Promise<string | null> {
  return tentarResponderComQuita(mensagem, clienteId, gratuito, historicoCanal, true);
}

export async function tentarResponderComQuita(
  mensagem: string,
  clienteId: string,
  gratuito: boolean,
  historicoCanal?: MensagemHistorico[],
  modoConversa = false
): Promise<string | null> {
  if (!quitaAtivo()) return null;

  const iniciadoEm = new Date();
  const executar = criarExecutorFerramentas(clienteId, gratuito);
  const modelo = process.env.OPENAI_QUITA_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const historico = historicoCanal ?? (await carregarHistorico(clienteId, mensagem));
    const resultado = await Promise.race([
      conversarComFerramentas(
        {
          ferramentasPermitidas: NOMES_FERRAMENTAS,
          executarFerramenta: executar,
          chat: async (mensagens) => {
            const r = await chatCompletion({
              model: modelo,
              mensagens: mensagens as unknown as MensagemOpenAI[],
              tools: DEFINICOES_FERRAMENTAS,
              toolChoice: "auto",
              temperature: 0.2,
              maxTokens: 450,
              telemetria: { clienteId, gratuito, skill: "quita-agente" },
            });
            return { conteudo: r.conteudo, toolCalls: r.toolCalls };
          },
        },
        { mensagem, historico, modoConversa }
      ),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TEMPO_MAXIMO_MS)),
    ]);

    if (!resultado) {
      await registrarExecucaoAgente({
        agente: "quita", iniciadoEm, terminadoEm: new Date(), clientesAvaliados: 1, acoes: 0,
        erros: ["tempo máximo excedido (12s) — caiu no fluxo antigo"],
      });
      return null;
    }

    // Métrica da conversa livre SEM guardar o texto do cliente: só rota, uso de ferramenta e guarda.
    if (modoConversa) {
      await registrarExecucaoAgente({
        agente: "quita", iniciadoEm, terminadoEm: new Date(), clientesAvaliados: 1, acoes: resultado.resposta ? 1 : 0, erros: [],
        detalhes: {
          rota: "conversa_livre",
          respondeu: Boolean(resultado.resposta),
          ferramentas: resultado.ferramentasUsadas,
          chamadasLLM: resultado.chamadasLLM,
          validouNumeros: resultado.validouNumeros,
          violacoes: resultado.violacoes.slice(0, 5),
        },
      });
    } else if (resultado.ferramentasUsadas.length > 0) {
      await registrarExecucaoAgente({
        agente: "quita",
        iniciadoEm,
        terminadoEm: new Date(),
        clientesAvaliados: 1,
        acoes: resultado.ferramentasUsadas.length,
        erros: [],
        detalhes: {
          ferramentas: resultado.ferramentasUsadas,
          chamadasLLM: resultado.chamadasLLM,
          validouNumeros: resultado.validouNumeros,
          fallbackDeterministico: resultado.usouFallbackDeterministico,
          violacoes: resultado.violacoes.slice(0, 5),
        },
      });
    }
    // Coach: a dica de economia é trabalho do agente Coach (sob demanda).
    if (resultado.ferramentasUsadas.includes("dica_de_economia")) {
      await registrarExecucaoAgente({
        agente: "coach", iniciadoEm, terminadoEm: new Date(), clientesAvaliados: 1, acoes: 1, erros: [],
        detalhes: { origem: "pedido do cliente via Quita", versao: "1.0" },
      });
    }
    return resultado.resposta;
  } catch (err) {
    console.error("[QUITA] Erro no agente, caindo no fluxo antigo:", err);
    await registrarExecucaoAgente({
      agente: "quita", iniciadoEm, terminadoEm: new Date(), clientesAvaliados: 1, acoes: 0,
      erros: [err instanceof Error ? err.message : String(err)],
    });
    return null;
  }
}
