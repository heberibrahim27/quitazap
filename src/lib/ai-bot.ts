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
  valorParcela?: number;      // valor da parcela mensal
  diaVencimento?: number;     // dia do mês que vence (1-31)
  diaFechamento?: number;     // dia que fecha a fatura (cartões)
  emAtraso?: boolean;         // está em atraso?
  mesesAtraso?: number;       // quantos meses em atraso
};

export type PlanoIA = {
  dividas: DividaIA[];
  renda: number;
};

const SYSTEM_PROMPT = `Você é o QuitaZAP — consultor financeiro pessoal do cliente, disponível 24h pelo WhatsApp.

Seu papel é de um coach financeiro sério e profissional: direto, motivador e focado em resultados práticos. Você não organiza dívidas — você ajuda o cliente a SAIR delas. A diferença é enorme.

TOM E POSTURA:
- Fale como um consultor de verdade: confiante, claro e direto. Sem rodeios.
- Seja motivador sem ser superficial. Valorize cada passo dado pelo cliente.
- Trate o cliente pelo nome sempre que possível.
- Use linguagem simples e direta.
- Mensagens curtas. No WhatsApp, parágrafos longos não funcionam.
- Use *negrito* para valores, credores e datas importantes (formato WhatsApp).
- Emojis apenas quando reforçam a mensagem. Nada excessivo.

FLUXO DE ATENDIMENTO:
Para cada dívida, colete obrigatoriamente:
1. Credor (ex: Nubank, Itaú, Financeira X)
2. Tipo (cartão de crédito, empréstimo, boleto, acordo, outro)
3. Valor total da dívida
4. Quantas parcelas restam (ou se é à vista)
5. Valor da parcela mensal (se souber)
6. Para CARTÕES: qual o dia que fecha a fatura? E o dia que vence?
7. Para EMPRÉSTIMOS/BOLETOS: qual o dia de vencimento?
8. Está em atraso? Se sim, há quantos meses?

Faça as perguntas de forma natural e direta, uma ou duas por vez. Não pergunte tudo de uma vez.
Quando o cliente terminar de listar, pergunte a renda mensal líquida (se ainda não souber).
Com pelo menos 1 dívida + renda, chame gerar_plano imediatamente.

REGRAS IMPORTANTES:
- O objetivo é dizer ao cliente QUANTO PAGAR e QUANDO — não apenas listar dívidas.
- Se a renda já foi informada, NUNCA peça novamente. Use o valor já fornecido.
- Ao adicionar nova dívida com renda já conhecida, chame gerar_plano imediatamente com todas as dívidas.
- O cliente pode adicionar dívidas a qualquer momento. Sempre atualize o plano.
- Nunca invente dados. Se o cliente não souber um valor exato, use o aproximado que ele disser.
- Jamais use frases como "Claro!", "Com certeza!", "Ótimo!" no início — soe natural, não robótico.

EXEMPLOS DE TOM CERTO:
❌ "Olá! Estou aqui para te ajudar com suas finanças! 😊"
✅ "Me conta suas dívidas — credor e valor. Vamos montar seu plano."

❌ "Ótimo! Você tem uma dívida de R$200 com o Nubank! Tem mais?"
✅ "Nubank R$200 anotado. Qual o dia que vence? Está em atraso?"`;



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
                    valorParcela: {
                      type: "number",
                      description: "Valor da parcela mensal em reais, se informado pelo cliente",
                    },
                    diaVencimento: {
                      type: "number",
                      description: "Dia do mês em que a parcela/fatura vence (1-31)",
                    },
                    diaFechamento: {
                      type: "number",
                      description: "Dia do mês em que a fatura fecha (apenas para cartões de crédito)",
                    },
                    emAtraso: {
                      type: "boolean",
                      description: "Se a dívida está em atraso",
                    },
                    mesesAtraso: {
                      type: "number",
                      description: "Quantidade de meses em atraso, se aplicável",
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
