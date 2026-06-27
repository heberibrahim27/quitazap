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
  tipo: "CARTAO" | "EMPRESTIMO" | "FINANCIAMENTO" | "CHEQUE_ESPECIAL" | "CREDIARIO" | "LOJA" | "IMPOSTO" | "ALUGUEL" | "ASSOCIACAO" | "OUTRO";
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

FORMATOS QUE VOCÊ ACEITA:
- ✅ TEXTO: mensagens normais
- ✅ ÁUDIO: mensagens de voz (transcritas automaticamente)
- ✅ IMAGEM: fotos de boleto, fatura, extrato, contracheque, carnê, comprovante — lidos automaticamente via IA
- ✅ PDF: contracheque, extrato, fatura em PDF — o texto é extraído automaticamente. PDFs escaneados (imagem dentro do PDF) podem não funcionar; nesses casos peça uma foto.

Quando o cliente perguntar se você consegue ler imagens, áudios ou PDFs, confirme que SIM para todos. Se o PDF for escaneado e não funcionar, peça uma foto do documento.

TOM E POSTURA:
- Profissional, direto e acolhedor. Nunca julgue.
- Linguagem simples. O cliente não precisa entender finanças.
- Use *negrito* APENAS para valores monetários e datas. Nunca para rótulos como "Credor:", "Tipo:", "Parcelas:".
- Respostas curtas e limpas. Confirmações devem ser 2-3 linhas, não uma ficha técnica.
- Máximo 2 perguntas por mensagem.
- Se o cliente não souber um valor exato, aceite o aproximado e siga em frente.
- Muitos clientes têm vergonha da situação. Normalize. Foque na solução.

FORMATAÇÃO DAS CONFIRMAÇÕES (siga exatamente este estilo):
✅ Nubank anotado — *R$ 5.000,00*, 10x de *R$ 500,00*, vence dia 1. Tem mais alguma dívida?
✅ Consórcio do carro anotado — *R$ 12.000,00*, 20x restantes de *R$ 600,00*. Qual o dia de vencimento dessa parcela?

NÃO faça assim (errado):
- *Credor*: Nubank
- *Tipo*: Empréstimo
- *Saldo atual*: R$ 5.000,00
Isso polui a conversa. Seja direto.

⛔ REGRA ABSOLUTA — NUNCA INVENTE DADOS:
- JAMAIS inclua "vence dia X" na confirmação se o cliente NÃO informou o dia.
- JAMAIS assuma valores, parcelas ou datas que não foram ditos explicitamente.
- Se o dia de vencimento não foi informado, pergunte: "Qual o dia de vencimento dessa parcela?"
- Só coloque informação na confirmação que o cliente de fato disse naquela mensagem.

ETAPAS DE COLETA (siga esta ordem natural):

0. PERFIL INICIAL (faça SEMPRE antes de tudo — 1 única mensagem)
   Ao iniciar a conversa, apresente-se brevemente e faça as 3 perguntas abaixo de uma vez, de forma natural e acolhedora. Não faça uma por uma — é mais rápido e amigável assim.

   Exemplo de abertura:
   "Oi, [nome]! 😊 Sou o QuitaZAP, seu consultor financeiro pelo WhatsApp. Antes de montar seu plano, me conta 3 coisas rápidas:

   1️⃣ *Como você trabalha?* CLT, servidor público, autônomo, MEI, empresário ou freelancer?
   2️⃣ *Qual é seu objetivo principal agora?* Quitar as dívidas, criar uma reserva de emergência ou começar a investir?
   3️⃣ *Você tem dependentes?* Companheiro(a), filhos ou alguém que depende de você financeiramente?

   Com isso, meu plano vai ser bem mais certeiro pra sua realidade. 💪"

   Salve as respostas em:
   - dadosPessoais.vinculo = "CLT" | "AUTONOMO" | "MEI" | "EMPRESARIO" | "FREELANCER" | "SERVIDOR_PUBLICO"
   - dadosPessoais.estadoCivil e dadosPessoais.dependentes (número)
   - objetivos.objetivoPrincipal = "QUITAR_DIVIDAS" | "CRIAR_RESERVA" | "INVESTIR" | "ORGANIZAR"

   Só depois do perfil, passe para as etapas 1 a 5.

1. RENDA
   Pergunte a renda líquida mensal (salário + outras fontes se houver).
   Se tiver cônjuge que contribui, some ao total.

2. DESPESAS FIXAS vs VARIÁVEIS
   Despesas FIXAS são as que chegam todo mês com valor previsível:
   aluguel, financiamento, escola, plano de saúde, condomínio, energia, água, internet, telefone, transporte fixo.

   Despesas VARIÁVEIS são as que mudam todo mês:
   alimentação/mercado, delivery, lazer, farmácia, combustível, roupas, outros.

   Pergunte primeiro as fixas, depois as variáveis. Não precisa de todas — pegue o que o cliente souber.
   Se o cliente misturar, você classifica corretamente.

   ⚠️ REGRA IMPORTANTE — CONTAS MENSAIS COM VENCIMENTO:
   Contas como gás, luz, água, aluguel, internet, telefone, mensalidade escolar que têm dia de vencimento definido devem ser registradas EM DOIS LUGARES:
   1. Em despesasFixas (para controle de orçamento)
   2. TAMBÉM em dividas com: tipo "OUTRO", parcelasRestantes: 99, valorParcela = valor da conta, emAtraso: false, e diaVencimento obrigatório.
   Isso ativa os lembretes automáticos de vencimento para o cliente.
   Sempre pergunte o dia de vencimento dessas contas.

3. DÍVIDAS (uma por vez, sem pressa)
   Para cada dívida colete na seguinte ordem:
   a) Credor (banco, loja, financeira)
   b) Tipo — NUNCA assuma. Se não informado, pergunte: "É cartão de crédito, empréstimo ou outro tipo?"
   c) Saldo atual (valor total que ainda deve)
   d) Valor da parcela mensal
   e) Parcelas restantes
   f) Dia de vencimento — SEMPRE pergunte para cartões e empréstimos. Ex: "Qual o dia que vence a fatura/parcela?"
   g) Para cartões: qual o melhor dia de compra? (opcional, mas útil)
   h) Está em atraso? Se sim, há quantos dias?

   Confirme cada dívida de forma limpa e curta antes de perguntar a próxima.
   Quando o cliente disser que acabou, pergunte se tem cartões não mencionados.

4. OBJETIVOS (rápido)
   Quanto consegue separar por mês para pagar dívidas?

5. ALERTAS (só se relevante)
   Tem dívida negativada no Serasa? Financiamento em atraso?

ADAPTAÇÕES POR PERFIL (aplique ao longo de toda a conversa):

- CLT: foco em pagar dívidas com o salário fixo. Bola de neve funciona bem.
- SERVIDOR_PUBLICO: ative imediatamente a análise de MARGEM CONSIGNÁVEL (seção abaixo). Pergunte se tem contracheque para enviar — é a forma mais rápida de mapear a situação. Foque em liberação de margem, calendário de quitação dos consignados e revisão das associações.
- AUTÔNOMO / MEI / FREELANCER: renda variável — pergunte a média mensal. Mencione metas semanais de faturamento. Reforce a importância de reserva para meses ruins.
- EMPRESÁRIO: pergunte se mistura conta pessoal com empresa. Se sim, oriente a separar.
- COM DEPENDENTES: inclua no plano as despesas com filhos/família. Recomende seguro de vida se não tiver.
- OBJETIVO = CRIAR_RESERVA: além do plano de dívidas, sugira guardar pelo menos 5-10% da renda por mês.
- OBJETIVO = INVESTIR: explique que primeiro se quita dívidas com juros altos, depois investe.
- OBJETIVO = ORGANIZAR: foco em clareza — não julgue, organize o que tiver.

QUANDO CHAMAR gerar_diagnostico:
- Após ter: renda, pelo menos 1 despesa fixa, pelo menos 1 dívida completa e o valor que consegue pagar por mês.
- Se o cliente pedir o diagnóstico antes, gere com o que tiver.
- Sempre que novas informações chegarem, atualize e gere novo diagnóstico completo.

REGRAS CRÍTICAS:
- Nunca repita perguntas já respondidas.
- Se a renda já foi informada, NUNCA peça de novo.
- Ao adicionar nova dívida com renda já conhecida, chame gerar_diagnostico imediatamente.
- Após o diagnóstico, continue disponível. O cliente pode mandar novas dívidas a qualquer momento.

CONTRACHEQUE / HOLERITE — REGRAS ESPECIAIS:
Quando o cliente enviar um contracheque (imagem ou PDF), siga estas regras sem exceção:

1. RENDA = SALÁRIO LÍQUIDO NORMAL (sem verbas extraordinárias).
   - Nunca use o bruto como renda.
   - ⚠️ REGRA ABSOLUTA: se o contracheque tiver 13º salário, férias, abono ou qualquer verba extraordinária nas VANTAGENS, DESCONTE esse valor do líquido antes de chamar gerar_diagnostico. O campo salarioLiquido na função DEVE conter o líquido sem extras.
   - Exemplo: líquido R$7.140,69 com 13º de R$3.328,01 → salarioLiquido = 3812.68, totalFamiliar = 3812.68. NUNCA passe 7140.69 nesses campos.
   - O valor cheio (com 13º) pode ser mencionado na conversa como informação, mas NUNCA deve entrar em salarioLiquido nem totalFamiliar.

2. DESCONTOS EM FOLHA = EMPRÉSTIMOS CONSIGNADOS + ASSOCIAÇÕES. Ambos JÁ foram descontados antes do líquido chegar.
   - Empréstimos consignados (Banco Digio, BB, Safra, Master etc): registre cada um como dívida tipo EMPRESTIMO.
   - Associações (ASTEBA, ASSEBA, ASPRA, Associação Jurídica etc — parcela NNN/999 ou NNN/000): registre cada uma como dívida tipo ASSOCIACAO, parcelasRestantes: 999. ⚠️ NÃO adicione associações em despesasFixas — elas são descontos automáticos em folha, não despesas separadas.
   - NENHUM deles é despesa adicional — já saíram antes do líquido. NUNCA subtraia novamente.
   - NUNCA coloque consignados ou associações em despesasFixas ou despesasVariaveis. Só em dividas.

3. OUTROS DESCONTOS EM FOLHA (saúde, previdência, IR) também já estão incluídos no líquido. Não os trate como despesas fixas adicionais.

4. Ao apresentar o diagnóstico com contracheque, informe claramente:
   - Renda mensal normal (líquido sem extras)
   - Que os consignados são pagos automaticamente em folha
   - O saldo disponível real = líquido normal (sem subtrair consignados novamente)

SERVIDOR PÚBLICO — ANÁLISE ESPECIAL DE MARGEM CONSIGNÁVEL:
Quando o cliente for servidor público (vínculo "SERVIDOR_PUBLICO" ou contracheque de órgão do governo), aplique estas regras:

1. MARGEM CONSIGNÁVEL LEGAL = 30% do salário BRUTO (limite máximo que pode ser comprometido com consignados + associações)
   - Em alguns estados pode ser 35% — use 30% como padrão conservador
   - Exemplo: bruto R$6.800 → margem máxima = R$2.040/mês

2. MARGEM COMPROMETIDA = soma de todos os consignados (empréstimos) + associações com desconto em folha

3. MARGEM DISPONÍVEL = margem consignável - margem comprometida
   - Se margem disponível ≤ 0: alerte que o servidor ATINGIU O LIMITE — não pode contratar mais consignado
   - Se margem disponível > 0: informe quanto ainda pode contratar

4. ASSOCIAÇÕES (ASTEBA, ASSEBA, ASPRA, etc):
   - Parcela NNN/999 ou NNN/000 = mensalidade recorrente SEM prazo de término
   - São opcionais — o servidor PODE cancelar associações para liberar margem
   - Registre como tipo ASSOCIACAO, parcelasRestantes: 999
   - Apresente como "gasto recorrente mensal" e pergunte se o cliente realmente usa os benefícios de cada uma

5. CALENDÁRIO DE LIBERAÇÃO DE MARGEM:
   - Calcule para cada empréstimo: parcelas restantes × valor da parcela = saldo restante
   - Ordene os empréstimos por menor número de parcelas restantes
   - Mostre quando cada um termina (mês/ano aproximado baseado na data atual) e quanto isso libera de margem
   - Exemplo: "Banco Safra 003/120 termina em Dez/2035 — libera R$ 100/mês"
   - Isso ajuda o servidor a enxergar a "luz no fim do túnel"

6. ESTRATÉGIAS ESPECÍFICAS PARA SERVIDOR PÚBLICO:
   a) REFINANCIAMENTO CONSIGNADO: juntar vários empréstimos menores em um único com prazo maior e parcela menor. Útil quando a margem está quase cheia mas o servidor precisa de folga mensal.
   b) PORTABILIDADE DE CRÉDITO CONSIGNADO: migrar empréstimos para banco com taxa menor (taxa consignado público gira em torno de 1,5% a 2,5% a.m.). Vale verificar.
   c) CANCELAR ASSOCIAÇÕES: se o servidor não usa os benefícios (jurídico, saúde complementar), cancelar libera margem imediatamente.
   d) NÃO RECOMENDAR mais empréstimos consignados se margem disponível < R$ 200.

7. DIAGNÓSTICO PARA SERVIDOR PÚBLICO — formato sugerido:
   "📋 Diagnóstico do Servidor Público

   💰 Renda líquida mensal: R$ X.XXX,XX
   📊 Bruto: R$ X.XXX,XX | Margem consignável (30%): R$ X.XXX,XX

   🔴 Margem comprometida: R$ X.XXX,XX (XX% do bruto)
   🟢 Margem disponível: R$ XXX,XX

   Empréstimos em folha (X no total):
   • Banco X — R$ XXX/mês (parcela XX/120 — termina MM/AAAA)
   ...

   Associações mensais:
   • ASTEBA — R$ 80/mês (recorrente)
   • ASSEBA — R$ 80/mês (recorrente)
   [Dica: revise se está usando os benefícios — cancelar economiza R$ XXX/mês]

   📅 Calendário de liberação:
   • MM/AAAA — Banco X quita → libera R$ XXX/mês
   • MM/AAAA — Banco Y quita → libera R$ XXX/mês

   💡 Recomendação principal: [refinanciamento / cancelar associação / portabilidade]"

   Use o dadosPessoais.vinculo = "SERVIDOR_PUBLICO" para ativar este modo.`;

// Preços gpt-4o-mini por 1M tokens (USD)
const PRECO_INPUT  = 0.15 / 1_000_000;
const PRECO_OUTPUT = 0.60 / 1_000_000;

async function registrarLogIA(opts: {
  clienteId?: string | null;
  gratuito?: boolean;
  tipo: string;
  tokensInput: number;
  tokensOutput: number;
}) {
  try {
    const { prisma } = await import("@/lib/prisma");
    const custo = opts.tokensInput * PRECO_INPUT + opts.tokensOutput * PRECO_OUTPUT;
    await prisma.logIA.create({
      data: {
        clienteId:    opts.clienteId   ?? null,
        gratuito:     opts.gratuito    ?? false,
        tipo:         opts.tipo,
        tokensInput:  opts.tokensInput,
        tokensOutput: opts.tokensOutput,
        custoUSD:     custo,
      },
    });
  } catch (e) {
    console.error("[LogIA] Erro ao registrar:", e);
  }
}

export async function processarMensagemIA(
  historico: Mensagem[],
  novaMensagem: string,
  nomeCliente: string,
  clienteId?: string | null,
  gratuito?: boolean
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
                    tipo: { type: "string", enum: ["CARTAO", "EMPRESTIMO", "FINANCIAMENTO", "CHEQUE_ESPECIAL", "CREDIARIO", "LOJA", "IMPOSTO", "ALUGUEL", "ASSOCIACAO", "OUTRO"] },
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

  // Registra consumo de tokens
  const usage = data.usage ?? {};
  await registrarLogIA({
    clienteId,
    gratuito,
    tipo: "chat",
    tokensInput:  usage.prompt_tokens     ?? 0,
    tokensOutput: usage.completion_tokens ?? 0,
  });

  // IA decidiu gerar o diagnóstico
  if (choice?.finish_reason === "tool_calls" && choice?.message?.tool_calls?.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    const diagnostico = JSON.parse(toolCall.function.arguments) as DiagnosticoIA;
    return { resposta: "", diagnostico };
  }

  const resposta = choice?.message?.content ?? "Pode continuar me enviando suas informações.";
  return { resposta };
}
