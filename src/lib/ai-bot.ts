// ─────────────────────────────────────────
// QuitaZAP — IA Consultora Financeira
// Modelo: gpt-4o-mini (OpenAI)
// ─────────────────────────────────────────

export type Mensagem = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type DividaIA = {
  credor: string;
  valor: number;
  parcelas: number;
  tipo: "CARTAO" | "EMPRESTIMO" | "BOLETO" | "ACORDO" | "OUTRO";
};

export type PlanoIA = {
  dividas: DividaIA[];
  renda: number;
};

const SYSTEM_PROMPT = `Você é o QuitaZAP, um consultor financeiro inteligente e empático que atende pelo WhatsApp.

Seu objetivo é ajudar pessoas endividadas a entenderem sua situação financeira e receberem um plano claro de quitação.

COMO VOCÊ DEVE AGIR:
- Seja acolhedor, humano e claro. Muitos clientes estão estressados com dívidas.
- Aceite qualquer formato de mensagem. Se o cliente disser "devo uns 3 mil no nubank", entenda e registre.
- Faça perguntas de follow-up quando necessário: "Isso é cartão de crédito ou empréstimo?" / "Está em atraso?"
- Use *negrito* para valores e informações importantes (formato WhatsApp).
- Use emojis com moderação. 💚
- Não use palavras difíceis ou jargão financeiro.
- Colete: nome de cada credor, valor aproximado, quantas parcelas restam (ou se é à vista).
- Depois de listar as dívidas, pergunte a renda mensal do cliente.
- Quando tiver pelo menos 1 dívida E a renda mensal confirmada, chame a função gerar_plano.

IMPORTANTE:
- Nunca invente dados.
- Se o cliente disser que não tem mais dívidas para listar, confirme e peça a renda.
- Seja breve. Respostas curtas funcionam melhor no WhatsApp.`;

export async function processarMensagemIA(
  historico: Mensagem[],
  novaMensagem: string,
  nomeCliente: string
): Promise<{ resposta: string; plano?: PlanoIA }> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey.startsWith("sk-proj-SUA")) {
    console.warn("[IA] OPENAI_API_KEY não configurada.");
    return { resposta: "Sistema de IA em configuração. Tente novamente em breve." };
  }

  const messages = [
    {
      role: "system",
      content: SYSTEM_PROMPT + `\n\nNome do cliente: ${nomeCliente}`,
    },
    ...historico,
    { role: "user", content: novaMensagem },
  ];

  const body = {
    model: "gpt-4o-mini",
    messages,
    tools: [
      {
        type: "function",
        function: {
          name: "gerar_plano",
          description:
            "Chame esta função SOMENTE quando tiver coletado todas as dívidas do cliente E a renda mensal confirmada. Mínimo necessário: 1 dívida + renda.",
          parameters: {
            type: "object",
            properties: {
              dividas: {
                type: "array",
                description: "Lista de todas as dívidas coletadas",
                items: {
                  type: "object",
                  properties: {
                    credor: {
                      type: "string",
                      description: "Nome do credor ou da dívida (ex: Nubank, Financeira, Luz)",
                    },
                    valor: {
                      type: "number",
                      description: "Valor total da dívida em reais",
                    },
                    parcelas: {
                      type: "number",
                      description: "Parcelas restantes. Use 1 para dívidas à vista ou boletos.",
                    },
                    tipo: {
                      type: "string",
                      enum: ["CARTAO", "EMPRESTIMO", "BOLETO", "ACORDO", "OUTRO"],
                      description: "Tipo da dívida",
                    },
                  },
                  required: ["credor", "valor", "parcelas", "tipo"],
                },
              },
              renda: {
                type: "number",
                description: "Renda mensal do cliente em reais",
              },
            },
            required: ["dividas", "renda"],
          },
        },
      },
    ],
    tool_choice: "auto",
    temperature: 0.7,
    max_tokens: 500,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API erro ${res.status}: ${err}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];

  // IA decidiu gerar o plano (function call)
  if (choice?.finish_reason === "tool_calls" && choice?.message?.tool_calls?.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    const plano = JSON.parse(toolCall.function.arguments) as PlanoIA;
    return { resposta: "", plano };
  }

  // Resposta conversacional normal
  const resposta = choice?.message?.content ?? "Pode continuar me enviando suas informações. 😊";
  return { resposta };
}
