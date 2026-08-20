// ─────────────────────────────────────────
// Classificador leve de "isso é um pedido de lembrete?" por IA.
//
// Só entra em jogo como último recurso, depois que toda a cascata de
// fluxos determinísticos do webhook (gasto, confirmação, fatura, comandos
// de menu...) já não reconheceu a mensagem — detectarComandoTarefa exige
// prefixo explícito ("tarefa:"/"lembrete:"/"pagamento:"), então um pedido
// em português natural ("me lembra de pagar a luz dia 10") nunca bate lá.
// Aqui só classifica LEMBRETE/PAGAMENTO/nenhum — quem extrai data, valor
// e recorrência continua sendo o parser determinístico já testado em
// tarefa-flow.ts (a mensagem original, sem reescrever, é só prefixada e
// devolvida pro mesmo pipeline).
// ─────────────────────────────────────────

// Chamada de IA custa (tempo + $) e esse gate roda como último recurso, ou
// seja, em toda mensagem que nenhum outro fluxo reconheceu — sem esse
// filtro barato antes, quase todo "bom dia"/papo comum acionaria a IA à
// toa. Só vale a pena chamar se a mensagem já tem alguma pista de
// lembrete: verbo de lembrar/avisar/agendar, ou referência a tempo
// futuro (dia N, dia da semana, "amanhã", "toda semana"/"todo mês").
const PISTA_LEMBRETE =
  /\b(?:lembr|avis|agend|nao\s+esque|marca(?:r)?\s+pra)\w*\b|\bdia\s+\d|\b(?:amanha|semana\s+que\s+vem|toda\s+semana|todo\s+mes)\b|\b(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/;

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Guard de ordenação: esse fallback só deve tentar interceptar a mensagem
// se NENHUM fluxo de tarefa/pagamento anterior já mexeu nela de propósito.
// Se detectarComandoTarefa(mensagem) já tinha achado algo (CONCLUIR/
// CANCELAR que não encontrou a tarefa, por exemplo) ou se o comando de
// menu era PAGUEI (que deliberadamente cai pra IA processar a atualização
// da dívida, não pra virar um Tarefa novo), essa mensagem já tem um
// destino — não é o classificador de lembrete que deve decidir por ela.
export function devePularFallbackLembreteIA(
  comandoTarefaJaDetectado: unknown,
  comandoDeMenu: string | null
): boolean {
  return Boolean(comandoTarefaJaDetectado) || comandoDeMenu === "PAGUEI";
}

export async function classificarLembreteLivreIA(
  mensagem: string
): Promise<"LEMBRETE" | "PAGAMENTO" | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-proj-SUA")) return null;
  if (!mensagem || mensagem.length > 400) return null;
  if (!PISTA_LEMBRETE.test(normalizarTexto(mensagem))) return null;

  const body = {
    model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Você identifica se uma mensagem de WhatsApp é um PEDIDO CLARO para criar um lembrete ou " +
          "lembrete de pagamento futuro — tem uma ação a fazer depois, de preferência com data/dia/" +
          'recorrência (ex: "me lembra de pagar a luz dia 10", "não esquece que preciso pagar o boleto ' +
          'do carro amanhã", "lembra eu de ligar pro banco toda segunda"). NÃO é pedido de lembrete: ' +
          "perguntas, desabafos, descrição de um gasto que já aconteceu, cumprimento, assunto qualquer " +
          'sem ação futura. Responda APENAS com JSON: {"tipo":"LEMBRETE"} (lembrete genérico) ou ' +
          '{"tipo":"PAGAMENTO"} (especificamente sobre pagar uma conta/dívida) ou {"tipo":"NENHUM"} se ' +
          "não tiver certeza.",
      },
      { role: "user", content: mensagem },
    ],
    temperature: 0,
    max_tokens: 40,
    response_format: { type: "json_object" },
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;

    const parsed = JSON.parse(content);
    if (parsed.tipo === "LEMBRETE" || parsed.tipo === "PAGAMENTO") return parsed.tipo;
    return null;
  } catch {
    return null;
  }
}
