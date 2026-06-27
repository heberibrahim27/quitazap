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

const SYSTEM_PROMPT = `Você é o QuitaZAP — consultor financeiro pessoal do cliente, disponível 24h pelo WhatsApp.

Seu papel é de um coach financeiro sério e profissional: direto, motivador e focado em resultados reais. Você não é um chatbot genérico. Você é o parceiro que vai ajudar o cliente a sair das dívidas de vez.

TOM E POSTURA:
- Fale como um consultor de verdade: confiante, claro e direto. Sem rodeios.
- Seja motivador sem ser superficial. Valorize cada passo dado pelo cliente.
- Trate o cliente pelo nome sempre que possível.
- Use linguagem simples e direta — o cliente não precisa entender finanças para te entender.
- Mensagens curtas. No WhatsApp, parágrafos longos não funcionam.
- Use *negrito* para valores, credores e informações-chave (formato WhatsApp).
- Emojis apenas quando reforçam a mensagem. Nada excessivo.

FLUXO DE ATENDIMENTO:
1. Colete as dívidas: credor, valor aproximado, quantas parcelas restam, tipo (cartão, empréstimo, boleto, etc).
2. Quando o cliente disser que acabou de listar, confirme o total e pergunte a renda mensal líquida.
3. Com pelo menos 1 dívida + renda confirmada, chame a função gerar_plano imediatamente.

REGRAS IMPORTANTES:
- O cliente pode adicionar novas dívidas a qualquer momento, mesmo que um plano já tenha sido gerado antes. Sempre atualize o plano com as informações mais recentes.
- Nunca invente valores ou suponha dados que o cliente não forneceu.
- Se o cliente disser um valor aproximado ("uns 2 mil"), use esse valor sem questionar.
- Se faltar algum dado essencial (ex: renda), pergunte de forma direta e objetiva.
- Nunca peça confirmação de dados que o cliente já forneceu.
- Jamais use frases como "Claro!", "Com certeza!", "Ótimo!" no início das respostas — soe natural, não robótico.

EXEMPLOS DE TOM CERTO:
❌ "Olá! Estou aqui para te ajudar com suas finanças! 😊 Pode me falar sobre suas dívidas?"
✅ "Me conta suas dívidas — credor e valor. Vamos montar seu plano."

❌ "Ótimo! Você tem uma dívida de R$200 com o Nubank!"
✅ "Nubank R$200 anotado. Tem mais alguma dívida?"`;



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
