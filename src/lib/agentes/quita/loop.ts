// ─────────────────────────────────────────
// Agente Quita — loop de function calling (dependências injetáveis, testável)
// ─────────────────────────────────────────
// Objetivo: responder pergunta aberta do cliente escolhendo, entre
// ferramentas de LEITURA, as que precisa (até 4 por mensagem). Nunca altera
// dado financeiro e nunca calcula: os números vêm das ferramentas e a guarda
// numérica confere a resposta final (guarda-numerica.ts).

import { validarResposta } from "./guarda-numerica";

export const MAX_FERRAMENTAS_POR_MENSAGEM = 4;
const MAX_RODADAS = 6;

export interface MensagemHistorico {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCallLLM {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface RespostaLLM {
  conteudo: string;
  toolCalls?: ToolCallLLM[];
}

export interface DependenciasLoop {
  /** Chama o modelo com o histórico atual e as definições de ferramenta. */
  chat: (mensagens: Array<Record<string, unknown>>) => Promise<RespostaLLM>;
  /** Executa UMA ferramenta de leitura e devolve o texto determinístico. */
  executarFerramenta: (nome: string, argumentos: Record<string, unknown>) => Promise<string>;
  /** Nomes aceitos (allowlist); qualquer outra é recusada. */
  ferramentasPermitidas: string[];
}

export interface ResultadoLoop {
  /** null = o agente não tem o que responder; o fluxo antigo segue. */
  resposta: string | null;
  ferramentasUsadas: string[];
  chamadasLLM: number;
  validouNumeros: boolean | null;
  usouFallbackDeterministico: boolean;
  violacoes: string[];
}

/**
 * Histórico do WhatsApp: o webhook guarda a conversa em BotSessao.dividasTemp
 * (JSON de {role, content}). Aproveita só as últimas 4 falas de texto
 * (cliente/assistente) — contexto de referência, nunca fonte de valor.
 */
export function historicoDeSessaoWhatsApp(dividasTemp: string | null | undefined, mensagemAtual: string): MensagemHistorico[] {
  let bruto: unknown;
  try {
    bruto = JSON.parse(dividasTemp || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(bruto)) return [];
  const falas = bruto
    .filter((m): m is { role: string; content: string } => Boolean(m) && typeof m === "object" && typeof (m as { content?: unknown }).content === "string")
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  // a mensagem atual pode já ter sido anexada ao histórico: tira a duplicata
  const ultima = falas[falas.length - 1];
  if (ultima && ultima.role === "user" && ultima.content.trim() === mensagemAtual.trim()) falas.pop();
  return falas.slice(-4);
}

export const PROMPT_SISTEMA_QUITA = `Você é o Quita, assistente financeiro do QuitaZAP (WhatsApp/app). Responda em português do Brasil, curto, claro e amigável, sem sermão.

REGRAS INEGOCIÁVEIS
1. Você NUNCA calcula nada. Todo número (R$, %, datas, quantidade de dias) deve ser copiado literalmente das ferramentas. Não some, não subtraia, não calcule média, diferença, sobra por dia nem percentual novo. Se faltar um número, diga que não tem essa informação ou chame outra ferramenta.
2. Pergunta do tipo "posso/consigo gastar X?" → use SEMPRE a ferramenta posso_gastar e repita a conclusão dela; não monte a conclusão você mesmo juntando outras ferramentas.
3. Você só lê dados. Se o cliente pedir pra registrar, apagar, criar lembrete, depositar ou qualquer mudança, não faça: diga que ele pode mandar o comando direto (ex.: "gastei 50 no mercado").
4. Use no máximo 4 ferramentas. Não repita a mesma ferramenta com os mesmos argumentos.
5. O histórico da conversa serve só pra entender referências ("e aquele cartão?"). Valores do histórico NÃO são fonte da verdade: consulte as ferramentas de novo.
6. Os números refletem só o que está registrado no QuitaZAP, não o saldo bancário real. Não dê consultoria de investimento.
7. Se a mensagem não tiver relação com as finanças do cliente (saudação, assunto fora do app), não chame ferramenta e responda apenas: NAO_E_CONSULTA. Pedido de ajuda ou desabafo sobre dívida, aperto ou "preciso sair dessa" TEM relação: trate como pergunta e aconselhe.
8. O QuitaZAP existe pra ajudar a QUITAR DÍVIDAS e ter respiro no mês. Perguntas sobre dívida, sobra ou "como saio disso" → use orientar_quitacao e mantenha a ordem AGORA / DEPOIS / PRÓXIMO ALVO. Tom acolhedor, sem julgamento.
9. 10. Quando o cliente pedir ajuda ou conselho ("tô apertado", "o que você me aconselha?", "preciso me livrar das dívidas"), chame SEMPRE orientar_quitacao primeiro — dica_de_economia só entra como complemento, nunca sozinha — e aja como consultor: comece reconhecendo a situação em uma frase curta, traga o plano com os números das ferramentas e termine com UM próximo passo concreto (o que fazer hoje ou esta semana). Se faltar informação para aconselhar melhor (qual dívida pesa mais, se há atraso), faça UMA pergunta curta no final. Nada de lista longa de dicas genéricas.
9. NUNCA sugira novo empréstimo, novo cartão, cheque especial, antecipação de limite ou pegar dinheiro em um lugar pra pagar outro. NUNCA sugira investimento nem cite produto financeiro. Não prometa desconto nem economia em R$ que as ferramentas não informaram.`;

function chaveChamada(nome: string, args: Record<string, unknown>): string {
  return `${nome}:${JSON.stringify(args, Object.keys(args).sort())}`;
}

export async function conversarComFerramentas(
  deps: DependenciasLoop,
  entrada: { mensagem: string; historico?: MensagemHistorico[] }
): Promise<ResultadoLoop> {
  const resultado: ResultadoLoop = {
    resposta: null,
    ferramentasUsadas: [],
    chamadasLLM: 0,
    validouNumeros: null,
    usouFallbackDeterministico: false,
    violacoes: [],
  };

  const mensagens: Array<Record<string, unknown>> = [
    { role: "system", content: PROMPT_SISTEMA_QUITA },
    ...(entrada.historico ?? []).slice(-4).map((m) => ({ role: m.role, content: m.content.slice(0, 400) })),
    { role: "user", content: entrada.mensagem },
  ];

  const cache = new Map<string, string>();
  const saidas: string[] = [];
  let executadas = 0;

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const resp = await deps.chat(mensagens);
    resultado.chamadasLLM++;

    if (resp.toolCalls && resp.toolCalls.length > 0) {
      mensagens.push({ role: "assistant", content: resp.conteudo || null, tool_calls: resp.toolCalls });
      for (const tc of resp.toolCalls) {
        const nome = tc.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        let saida: string;
        const chave = chaveChamada(nome, args);
        if (!deps.ferramentasPermitidas.includes(nome)) {
          saida = "Ferramenta indisponível.";
        } else if (cache.has(chave)) {
          saida = cache.get(chave) as string; // repetida: não conta como nova consulta
        } else if (executadas >= MAX_FERRAMENTAS_POR_MENSAGEM) {
          saida = "Limite de consultas desta mensagem atingido. Responda com o que já foi retornado.";
        } else {
          try {
            saida = await deps.executarFerramenta(nome, args);
          } catch (err) {
            saida = "Não consegui consultar isso agora.";
            console.error("[QUITA] Ferramenta falhou:", nome, err);
          }
          executadas++;
          cache.set(chave, saida);
          resultado.ferramentasUsadas.push(nome);
          saidas.push(saida);
        }
        mensagens.push({ role: "tool", tool_call_id: tc.id, content: saida });
      }
      continue;
    }

    // Resposta final do modelo.
    const texto = (resp.conteudo ?? "").trim();
    if (saidas.length === 0 || !texto || texto.includes("NAO_E_CONSULTA")) {
      // Sem ferramenta o Quita não responde número nenhum: devolve o controle
      // pro fluxo antigo (que já sabe lidar com saudação, registro etc.).
      return resultado;
    }

    const guarda = validarResposta(texto, [...saidas, entrada.mensagem]);
    resultado.validouNumeros = guarda.ok;
    resultado.violacoes = guarda.violacoes;
    if (guarda.ok) {
      resultado.resposta = texto;
    } else {
      resultado.usouFallbackDeterministico = true;
      resultado.resposta = saidas.join("\n\n");
    }
    return resultado;
  }

  // Estourou as rodadas sem resposta final: devolve o que as ferramentas deram.
  if (saidas.length > 0) {
    resultado.usouFallbackDeterministico = true;
    resultado.resposta = saidas.join("\n\n");
  }
  return resultado;
}
