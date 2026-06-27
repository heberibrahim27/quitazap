// ─────────────────────────────────────────
// QuitaZAP — IA Consultora Financeira v2
// Modelo: gpt-4o-mini (OpenAI)
// ─────────────────────────────────────────

export type Mensagem = {
  role: "user" | "assistant" | "system";
  content: string;
};

// ── Tipos expandidos ─────────────────────

export type DividaIA = {
  credor: string;
  tipo: "CARTAO" | "EMPRESTIMO" | "FINANCIAMENTO" | "CHEQUE_ESPECIAL" | "CREDIARIO" | "LOJA" | "IMPOSTO" | "ALUGUEL" | "OUTRO";
  valorOriginal: number;
  saldoAtual: number;
  juros?: number;
  multa?: number;
  valorParcela: number;
  totalParcelas?: number;
  parcelasRestantes: number;
  diaVencimento?: number;
  emAtraso: boolean;
  diasAtraso?: number;
  possuiProposta?: boolean;
  valorParaQuitar?: number;
  descontoAVista?: boolean;
};

export type CartaoIA = {
  banco: string;
  limite: number;
  limiteDisponivel?: number;
  faturaAtual: number;
  valorMinimo?: number;
  melhorDiaCompra?: number;
  parcelasFuturas?: number;
};

export type EmprestimoIA = {
  banco: string;
  valorContratado: number;
  saldoRestante: number;
  taxaJuros?: number;
  parcelasFaltam: number;
  valorParcela: number;
};

export type DadosPessoaisIA = {
  nome: string;
  idade?: number;
  cidade?: string;
  estadoCivil?: string;
  dependentes?: number;
  filhos?: number;
  profissao?: string;
  vinculo?: string;
};

export type RendaIA = {
  salarioLiquido: number;
  outrasRendas?: number;
  comissoes?: number;
  rendaConjuge?: number;
  rendaExtra?: number;
  beneficios?: number;
  totalFamiliar: number;
};

export type DespesaIA = {
  descricao: string;
  valor: number;
};

export type PatrimonioIA = {
  possuiCasa?: boolean;
  possuiCarro?: boolean;
  possuiMoto?: boolean;
  possuiInvestimentos?: boolean;
  reservaEmergencia?: number;
  valorBens?: number;
};

export type ObjetivosIA = {
  objetivoPrincipal?: string;
  prazoQuitacao?: number;
  valorDisponivel?: number;
  aceitaReduzirGastos?: boolean;
  aceitaRenegociar?: boolean;
  pretendeMaiRenda?: boolean;
};

export type AlertasIA = {
  acaoJudicial?: boolean;
  negativado?: boolean;
  bloqueioBancario?: boolean;
  financiamentoAtraso?: boolean;
  riscoPerdaPatrimonio?: boolean;
};

export type DiagnosticoIA = {
  dadosPessoais: DadosPessoaisIA;
  renda: RendaIA;
  despesasFixas: DespesaIA[];
  despesasVariaveis: DespesaIA[];
  dividas: DividaIA[];
  cartoes: CartaoIA[];
  emprestimos: EmprestimoIA[];
  patrimonio: PatrimonioIA;
  objetivos: ObjetivosIA;
  alertas: AlertasIA;
};

const SYSTEM_PROMPT = `Você é o QuitaZAP — consultor financeiro pessoal disponível 24h pelo WhatsApp.

Sua missão é entender a situação financeira do cliente e gerar um diagnóstico prático que mostre exatamente o que ele precisa pagar, quando, e como sair das dívidas. Você não é um formulário — é um consultor de verdade.

TOM E POSTURA:
- Profissional, direto e acolhedor. Nunca julgue.
- Linguagem simples. O cliente não precisa entender finanças.
- *Negrito* para valores e informações-chave (formato WhatsApp).
- Respostas curtas — máximo 2 perguntas por mensagem.
- Se o cliente não souber um valor exato, aceite o aproximado e siga em frente.
- Muitos clientes têm vergonha da situação. Normalize. Foque na solução.

ETAPAS DE COLETA (siga esta ordem natural):

1. RENDA
   Pergunte a renda líquida mensal (salário + outras fontes se houver).
   Se tiver cônjuge que contribui, some ao total.

2. DESPESAS FIXAS
   Pergunte quais são as contas fixas mensais: aluguel/financiamento, escola, plano de saúde, condomínio, energia, água, internet, transporte.
   Não precisa de todos — pegue o que o cliente souber.
   Calcule o total automaticamente.

3. DÍVIDAS (uma por vez)
   Para cada dívida colete:
   - Credor (banco, loja, etc.)
   - Tipo (cartão, empréstimo, boleto, financiamento, cheque especial)
   - Saldo atual (quanto ainda deve)
   - Valor da parcela mensal
   - Parcelas restantes
   - Dia de vencimento
   - Está em atraso? Se sim, há quantos dias?
   - Existe oferta de desconto para quitar à vista?

   Pergunte uma dívida por vez. Quando o cliente confirmar que acabou, passe para o próximo passo.

4. OBJETIVOS
   Pergunte apenas:
   - Quanto consegue separar por mês para pagar dívidas?
   - Qual o prazo que deseja para quitar tudo?

5. ALERTAS (só se relevante)
   Se o cliente mencionar ou parecer provável, pergunte:
   - Tem alguma dívida negativada no SPC/Serasa?
   - Existe financiamento de imóvel ou veículo em atraso?

QUANDO CHAMAR gerar_diagnostico:
- Após ter: renda, pelo menos 1 despesa fixa, pelo menos 1 dívida completa e o valor que consegue pagar por mês.
- Se o cliente pedir o diagnóstico antes, gere com o que tiver.
- Sempre que novas informações chegarem, atualize e gere novo diagnóstico completo.

REGRAS CRÍTICAS:
- Nunca repita perguntas já respondidas.
- Se a renda já foi informada, NUNCA peça de novo.
- Ao adicionar nova dívida com renda já conhecida, chame gerar_diagnostico imediatamente.
- Após o diagnóstico, continue disponível. O cliente pode mandar novas dívidas a qualquer momento.`;

export async function processarMensagemIA(
  historico: Mensagem[],
  novaMensagem: string,
  nomeCliente: string
): Promise<{ resposta: string; diagnostico?: DiagnosticoIA }> {
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
          name: "gerar_diagnostico",
          description:
            "Chame esta função quando tiver coletado dados suficientes para gerar o diagnóstico financeiro completo. Inclua todos os dados coletados até agora.",
          parameters: {
            type: "object",
            properties: {
              dadosPessoais: {
                type: "object",
                properties: {
                  nome: { type: "string" },
                  idade: { type: "number" },
                  cidade: { type: "string" },
                  estadoCivil: { type: "string" },
                  dependentes: { type: "number" },
                  filhos: { type: "number" },
                  profissao: { type: "string" },
                  vinculo: { type: "string" },
                },
                required: ["nome"],
              },
              renda: {
                type: "object",
                properties: {
                  salarioLiquido: { type: "number" },
                  outrasRendas: { type: "number" },
                  comissoes: { type: "number" },
                  rendaConjuge: { type: "number" },
                  rendaExtra: { type: "number" },
                  beneficios: { type: "number" },
                  totalFamiliar: { type: "number", description: "Soma de todas as fontes de renda" },
                },
                required: ["salarioLiquido", "totalFamiliar"],
              },
              despesasFixas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    descricao: { type: "string" },
                    valor: { type: "number" },
                  },
                  required: ["descricao", "valor"],
                },
              },
              despesasVariaveis: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    descricao: { type: "string" },
                    valor: { type: "number" },
                  },
                  required: ["descricao", "valor"],
                },
              },
              dividas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    credor: { type: "string" },
                    tipo: { type: "string", enum: ["CARTAO", "EMPRESTIMO", "FINANCIAMENTO", "CHEQUE_ESPECIAL", "CREDIARIO", "LOJA", "IMPOSTO", "ALUGUEL", "OUTRO"] },
                    valorOriginal: { type: "number" },
                    saldoAtual: { type: "number" },
                    juros: { type: "number" },
                    multa: { type: "number" },
                    valorParcela: { type: "number" },
                    totalParcelas: { type: "number" },
                    parcelasRestantes: { type: "number" },
                    diaVencimento: { type: "number" },
                    emAtraso: { type: "boolean" },
                    diasAtraso: { type: "number" },
                    possuiProposta: { type: "boolean" },
                    valorParaQuitar: { type: "number" },
                    descontoAVista: { type: "boolean" },
                  },
                  required: ["credor", "tipo", "saldoAtual", "valorParcela", "parcelasRestantes", "emAtraso"],
                },
              },
              cartoes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    banco: { type: "string" },
                    limite: { type: "number" },
                    limiteDisponivel: { type: "number" },
                    faturaAtual: { type: "number" },
                    valorMinimo: { type: "number" },
                    melhorDiaCompra: { type: "number" },
                    parcelasFuturas: { type: "number" },
                  },
                  required: ["banco", "faturaAtual"],
                },
              },
              emprestimos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    banco: { type: "string" },
                    valorContratado: { type: "number" },
                    saldoRestante: { type: "number" },
                    taxaJuros: { type: "number" },
                    parcelasFaltam: { type: "number" },
                    valorParcela: { type: "number" },
                  },
                  required: ["banco", "saldoRestante", "parcelasFaltam", "valorParcela"],
                },
              },
              patrimonio: {
                type: "object",
                properties: {
                  possuiCasa: { type: "boolean" },
                  possuiCarro: { type: "boolean" },
                  possuiMoto: { type: "boolean" },
                  possuiInvestimentos: { type: "boolean" },
                  reservaEmergencia: { type: "number" },
                  valorBens: { type: "number" },
                },
              },
              objetivos: {
                type: "object",
                properties: {
                  objetivoPrincipal: { type: "string" },
                  prazoQuitacao: { type: "number", description: "Em meses" },
                  valorDisponivel: { type: "number", description: "Quanto pode pagar por mês" },
                  aceitaReduzirGastos: { type: "boolean" },
                  aceitaRenegociar: { type: "boolean" },
                  pretendeMaiRenda: { type: "boolean" },
                },
              },
              alertas: {
                type: "object",
                properties: {
                  acaoJudicial: { type: "boolean" },
                  negativado: { type: "boolean" },
                  bloqueioBancario: { type: "boolean" },
                  financiamentoAtraso: { type: "boolean" },
                  riscoPerdaPatrimonio: { type: "boolean" },
                },
              },
            },
            required: ["dadosPessoais", "renda", "dividas"],
          },
        },
      },
    ],
    tool_choice: "auto",
    temperature: 0.5,
    max_tokens: 2000,
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

  // IA decidiu gerar o diagnóstico
  if (choice?.finish_reason === "tool_calls" && choice?.message?.tool_calls?.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    const diagnostico = JSON.parse(toolCall.function.arguments) as DiagnosticoIA;
    return { resposta: "", diagnostico };
  }

  const resposta = choice?.message?.content ?? "Pode continuar me enviando suas informações.";
  return { resposta };
}
