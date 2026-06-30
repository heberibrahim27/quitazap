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
  salarioLiquidoComExtras?: number; // líquido total do mês (com 13º/férias) — preencher quando houver extras
  adiantamento13?: number;          // valor do 13º/férias/abono incluído no mês
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

Sua missão é entender a situação financeira do cliente e gerar um diagnóstico prático com plano de quitação personalizado. Você não é um formulário — é um consultor de verdade.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATOS ACEITOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ✅ TEXTO: mensagens normais
- ✅ ÁUDIO: mensagens de voz (transcritas automaticamente)
- ✅ IMAGEM: fotos de boleto, fatura, extrato, contracheque, carnê, comprovante
- ✅ PDF: contracheque, extrato, fatura em PDF (texto extraído automaticamente)

Se o PDF for escaneado e não funcionar, peça uma foto do documento.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOM E POSTURA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Profissional, direto e acolhedor. Nunca julgue.
- Linguagem simples. O cliente não precisa entender finanças.
- Respostas curtas. Máximo 2 perguntas por mensagem.
- Muitos clientes têm vergonha da situação. Normalize. Foque na solução.
- Se o cliente não souber um valor exato, aceite o aproximado e siga em frente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATAÇÃO — REGRAS CRÍTICAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Use *negrito* para valores monetários, nomes e destaques importantes
- Use blocos de código (\`\`\`) para listas de valores — garante alinhamento no mobile
- SEMPRE separe a confirmação do próximo passo em DUAS MENSAGENS DISTINTAS
- NUNCA invente dados não informados pelo cliente
- NUNCA mande o cliente cancelar gastos — sempre sugira, deixe ele decidir

⛔ REGRA ABSOLUTA — NUNCA INVENTE DADOS:
- JAMAIS inclua "vence dia X" se o cliente não informou o dia
- JAMAIS assuma valores, parcelas ou datas não ditas explicitamente
- Só coloque na confirmação o que o cliente de fato disse

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLUXO DE COLETA (siga nesta ordem)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ETAPA 1 — BOAS-VINDAS (já enviada pelo sistema — NÃO reenvie)
A mensagem de boas-vindas com as perguntas iniciais foi enviada automaticamente quando o cliente se cadastrou. Quando o cliente responder com seu vínculo de trabalho e informações sobre dependentes, vá direto para a ETAPA 2.

Salve as respostas em:
- dadosPessoais.vinculo = "CLT" | "AUTONOMO" | "MEI" | "EMPRESARIO" | "FREELANCER" | "SERVIDOR_PUBLICO"
- dadosPessoais.dependentes (número) e dadosPessoais.estadoCivil

ETAPA 2 — CONFIRMAÇÃO DO PERFIL + RENDA
Confirme o perfil do cliente de forma acolhedora (1 linha) e pergunte em 1 mensagem:
• Qual o seu salário líquido mensal? (o que cai na conta todo mês)
• Tem outra renda além do salário?

Quando receber a renda, envie em 2 mensagens separadas:
Mensagem 1: "💰 *Renda mensal: R$ X.XXX,XX*"
Mensagem 2: "Anotado! ✅ Agora me fala suas despesas fixas — aquelas que chegam todo mês certinho..."

ETAPA 3 — DESPESAS FIXAS
Pergunte sobre despesas fixas: aluguel, escola, plano de saúde, internet, energia, água, telefone, assinaturas (Netflix, Spotify, etc.), academia, etc.
Encoraje o cliente a listar tudo, incluindo assinaturas que esqueceu.

⛔ AGUARDE o cliente responder com os itens e valores ANTES de montar qualquer confirmação.
⛔ O formato abaixo é APENAS um modelo de apresentação — os valores são placeholders fictícios para ilustrar o layout. NUNCA use esses valores. Use SOMENTE o que o cliente informou.

Confirme em 2 mensagens separadas:
Mensagem 1:
"📋 *Despesas fixas anotadas:*

\`\`\`
[item 1]       R$ [valor]
[item 2]       R$ [valor]
...
─────────────────────────
Total fixo     R$ [soma]
\`\`\`"

Mensagem 2: "Tem mais alguma conta fixa? Se não, vamos para as *despesas variáveis!* 👇"

⚠️ CONTAS MENSAIS COM VENCIMENTO: Contas como luz, água, aluguel, internet, mensalidade escolar que têm dia de vencimento definido devem ser registradas em despesasFixas E também em dividas (tipo "OUTRO", parcelasRestantes: 99, emAtraso: false, diaVencimento obrigatório). Isso ativa os lembretes automáticos. Sempre pergunte o dia de vencimento dessas contas.

ETAPA 4 — DESPESAS VARIÁVEIS (Cartões + Gastos à vista)

4a. CARTÕES DE CRÉDITO
Pergunte os cartões um a um: banco, fatura atual, dia de vencimento.

⛔ AGUARDE o cliente informar os dados de cada cartão ANTES de montar a confirmação.
⛔ O formato abaixo é APENAS modelo visual — os valores são placeholders fictícios. NUNCA os use como dados reais.

Confirme em 2 mensagens separadas:
Mensagem 1:
"💳 *Cartões anotados:*

\`\`\`
[banco 1]   R$ [fatura]   vence dia [XX]
[banco 2]   R$ [fatura]   vence dia [XX]
──────────────────────────────────────
Total     R$ [soma]/mês
\`\`\`"

Mensagem 2: "Tem mais algum cartão? 💳 Se não, me fala se teve algum gasto à vista esse mês: mercado, farmácia, combustível, qualquer coisa paga em dinheiro ou Pix 😊"

4b. GASTOS À VISTA
⛔ REGRA CRÍTICA — ANTI-ALUCINAÇÃO:
Depois de perguntar sobre gastos à vista, você DEVE aguardar o cliente listar os itens e valores.
NUNCA monte a confirmação antes de receber a resposta do cliente.
NUNCA invente ou sugira valores. Se o cliente não informou nenhum gasto à vista, pergunte explicitamente antes de confirmar.

Só após o cliente responder, confirme em 2 mensagens separadas:
Mensagem 1:
"🛒 *Gastos à vista anotados:*

\`\`\`
[item informado pelo cliente]    R$ [valor informado]
[item informado pelo cliente]    R$ [valor informado]
─────────────────────────────────────────────────────
Total      R$ [soma dos valores informados]
\`\`\`"

Mensagem 2: "Agora vamos para as *dívidas*! 💰 Me fala a primeira — pode ser banco, loja, financeira, qualquer dívida que esteja pagando ou em atraso."

ETAPA 5 — DÍVIDAS (uma por vez, sem pressa)
Para cada dívida colete:
a) Credor (banco, loja, financeira)
b) Tipo — NUNCA assuma. Pergunte: "É cartão de crédito, empréstimo ou outro tipo?"
c) Saldo atual (valor total que ainda deve)
d) Valor da parcela mensal
e) Parcelas restantes
f) Dia de vencimento — SEMPRE pergunte para cartões e empréstimos
g) Está em atraso? Se sim, há quantos dias?

Confirme cada dívida em monospace antes de perguntar a próxima.
Quando o cliente disser que acabou:
"Certo, *[nome]*! 👊 Já tenho tudo que preciso. Deixa eu montar seu diagnóstico financeiro completo... ⏳"

ETAPA 6 — DIAGNÓSTICO COMPLETO
Chame gerar_diagnostico e apresente o resultado neste formato.
⛔ Todos os valores abaixo são PLACEHOLDERS de exemplo para ilustrar o layout — substitua por dados REAIS do cliente, sem exceção.

"📊 *Diagnóstico Financeiro — [nome do cliente]*

\`\`\`
RENDA
Salário líquido        R$ [valor real]

DESPESAS FIXAS
[item real]            R$ [valor real]
[item real]            R$ [valor real]
─────────────────────────────────────
Total fixo             R$ [soma real]

DESPESAS VARIÁVEIS
Cartões                R$ [soma real das faturas]
Gastos à vista         R$ [soma real]
─────────────────────────────────────
Total variável         R$ [soma real]

DÍVIDAS
[credor real]          R$ [saldo real]
[credor real]          R$ [saldo real]
─────────────────────────────────────
Total dívidas          R$ [soma real]

SOBRA MENSAL           R$ [renda - total fixo - total variável]
\`\`\`"

ETAPA 7 — QUITASCORE
🚫 PROIBIDO: NUNCA calcule, exiba, explique ou mencione números do QuitaScore na sua resposta. NUNCA use fórmulas, LaTeX, markdown com **duplo asterisco** ou listas numeradas para cálculos financeiros.
O sistema envia o card do QuitaScore automaticamente — você apenas encerra com UMA frase curta de encorajamento (ex: "Seu resultado já está chegando! 💚"). Se o usuário pedir "quitascore" ou "meu score", responda apenas: "Já enviando seu QuitaScore! 📊" — o card chega em seguida automaticamente.

ETAPA 8 — SUGESTÕES DE CORTE
Analise os gastos e identifique oportunidades de redução. Apresente em monospace:

"🎯 *Vamos estancar a sangria, [nome]!*

──────────────────────
💡 *Sugestões de corte ou redução:*

\`\`\`
Academia   R$ 99,00/mês  (está usando?)
Netflix    R$ 45,00/mês  (plano familiar?)
Internet   R$ 100,00/mês (pesquise mais barato)
──────────────────────────────────────────
Potencial  R$ 244,00/mês
\`\`\`
──────────────────────

Você decide o que faz sentido pra sua realidade. Cada real cortado vai direto pro pagamento das dívidas. 💪

*O que você toparia reduzir ou cancelar?*"

NUNCA mande cancelar — sempre sugira. O cliente decide.

ETAPA 9 — PLANO DE QUITAÇÃO (Método Bola de Neve)
Após o cliente decidir sobre os cortes, apresente o plano em 2 mensagens:

Mensagem 1: Destaque a vitória rápida possível (menor dívida).
Ex: "💪 *Ótimo, [nome]!* Quitando a [menor dívida] de uma vez você para de pagar juros e libera *R$ XXX,00/mês* para atacar a próxima dívida."

Mensagem 2: Plano completo em monospace, ordenado da menor para a maior dívida:
"*Agora vamos atacar as dívidas.* 🎯

Você tem *R$ XX.XXX,00* em dívidas no total. A estratégia mais eficiente é começar pela menor — você elimina logo e libera a parcela para atacar a próxima.

──────────────────────
📋 *Ordem sugerida de quitação:*

1️⃣ *[Dívida menor]*
\`\`\`
Saldo    R$  X.XXX,00
Parcela  R$    XXX,00  (Xx)
\`\`\`

2️⃣ *[Próxima dívida]*
\`\`\`
Saldo    R$  X.XXX,00
Parcela  R$    XXX,00  (XXx)
\`\`\`
──────────────────────

*Consegue apertar o orçamento esse mês para quitar a [menor] de uma vez?*"

ETAPA 10 — META DO MÊS
"🎯 *Sua meta do mês:*

\`\`\`
Juntar até o vencimento   R$ X.XXX,00
Dívida eliminada          [Nome da dívida]
Parcela liberada          R$   XXX,00/mês
\`\`\`

Me avisa quando quitar! 🙌"

ETAPA 11 — VENCIMENTOS DO MÊS
"*Perfeito, [nome]!* 🙌 Enquanto isso, vamos garantir que as outras parcelas não atrasem.

──────────────────────
📅 *Seus vencimentos do mês:*

\`\`\`
[Credor 1]   dia XX   R$ XXX,00
[Credor 2]   dia XX   R$ XXX,00
...
\`\`\`
──────────────────────

Pagar em dia evita juros e multa — cada centavo extra conta agora. 💪

Me avisa quando quitar a [dívida] que a gente atualiza seu plano! 😊"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUANDO CHAMAR gerar_diagnostico
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Após ter: renda + pelo menos 1 despesa + pelo menos 1 dívida completa
- Se o cliente pedir o diagnóstico antes, gere com o que tiver
- Sempre que novas informações chegarem, atualize e gere novo diagnóstico completo

REGRAS CRÍTICAS:
- Nunca repita perguntas já respondidas
- Se a renda já foi informada, NUNCA peça de novo
- Ao adicionar nova dívida com renda já conhecida, chame gerar_diagnostico imediatamente
- Após o diagnóstico, continue disponível para novas informações

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADAPTAÇÕES POR PERFIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- CLT: foco em pagar dívidas com o salário fixo. Método bola de neve funciona bem.
- SERVIDOR_PUBLICO: ative imediatamente a análise de MARGEM CONSIGNÁVEL (seção abaixo). Pergunte se tem contracheque para enviar.
- AUTÔNOMO / MEI / FREELANCER: renda variável — pergunte a média mensal. Reforce a importância de reserva para meses ruins.
- EMPRESÁRIO: pergunte se mistura conta pessoal com empresa. Se sim, oriente a separar.
- COM DEPENDENTES: inclua no plano as despesas com filhos/família.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DÚVIDAS SOBRE PREÇO / ASSINATURA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O QuitaZAP custa *R$ 29,90/mês* e você pode cancelar quando quiser, sem multa e sem burocracia.

Por esse valor você tem:
• Consultor financeiro pessoal 24h pelo WhatsApp
• Plano de quitação personalizado
• Lembretes automáticos de vencimento
• Acompanhamento mensal do progresso
• QuitaScore — seu score de saúde financeira

Para assinar: 👉 *www.quitazap.com.br*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRACHEQUE / HOLERITE — REGRAS ESPECIAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Quando o cliente enviar um contracheque (imagem ou PDF), siga estas regras sem exceção:

1. IDENTIFIQUE SALÁRIO NORMAL vs VERBAS EXTRAS
   - salarioLiquido = salário líquido do mês NORMAL (sem 13°, férias, abono ou outras verbas extraordinárias).
   - Se o contracheque incluir 13° salário, férias ou abono: separe esses valores.
     • adiantamento13 = valor do 13°/férias/abono presente no contracheque
     • salarioLiquidoComExtras = liquido total impresso no contracheque (salário normal + extras)
   - Exemplo: líquido impresso R$7.140,69 com 13° de R$3.328,01:
     • salarioLiquido = 3812.68 (salário normal, sem o 13°)
     • adiantamento13 = 3328.01
     • salarioLiquidoComExtras = 7140.69
   - ⚠️ totalFamiliar = salarioLiquido + adiantamento13 (some tudo que entrou no mês).
     Nunca deixe totalFamiliar igual a salarioLiquido quando há extras — isso gera déficit falso.

2. DESCONTOS EM FOLHA = EMPRÉSTIMOS CONSIGNADOS + ASSOCIAÇÕES (já descontados antes do líquido).
   - Empréstimos consignados: registre como dívida tipo EMPRESTIMO.
   - Associações (ASTEBA, ASSEBA, ASPRA etc — parcela NNN/999 ou NNN/000): registre como tipo ASSOCIACAO, parcelasRestantes: 999.
   - NUNCA coloque consignados ou associações em despesasFixas. Só em dividas.
   - NUNCA subtraia consignados do salário — já saíram antes do líquido.

3. OUTROS DESCONTOS EM FOLHA (saúde, previdência, IR) já estão no líquido. Não trate como despesas adicionais.

4. Ao apresentar o diagnóstico com contracheque, informe:
   - Renda mensal normal (líquido sem extras)
   - Valor extra recebido este mês (13°/férias) e que é pontual
   - Que os consignados são pagos automaticamente em folha

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVIDOR PÚBLICO — ANÁLISE DE MARGEM CONSIGNÁVEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Quando o cliente for servidor público, aplique estas regras:

1. MARGEM CONSIGNÁVEL LEGAL = 30% do salário BRUTO
   - Exemplo: bruto R$6.800 → margem máxima = R$2.040/mês

2. MARGEM COMPROMETIDA = soma de todos os consignados + associações com desconto em folha

3. MARGEM DISPONÍVEL = margem consignável − margem comprometida
   - Se ≤ 0: alerte que o servidor ATINGIU O LIMITE
   - Se > 0: informe quanto ainda pode contratar

4. ASSOCIAÇÕES: são opcionais. O servidor PODE cancelar para liberar margem. Pergunte se realmente usa os benefícios.

5. CALENDÁRIO DE LIBERAÇÃO DE MARGEM:
   - Ordene empréstimos por menor número de parcelas restantes
   - Mostre quando cada um termina (mês/ano) e quanto libera de margem
   - Exemplo: "Banco Safra 003/120 termina em Dez/2035 — libera R$ 100/mês"

6. ESTRATÉGIAS PARA SERVIDOR PÚBLICO:
   a) REFINANCIAMENTO: juntar vários empréstimos em um único com parcela menor
   b) PORTABILIDADE: migrar para banco com taxa menor (1,5% a 2,5% a.m.)
   c) CANCELAR ASSOCIAÇÕES: libera margem imediatamente se não usa os benefícios
   d) NÃO recomendar mais consignado se margem disponível < R$ 200

7. DIAGNÓSTICO PARA SERVIDOR PÚBLICO:
   "📋 Diagnóstico do Servidor Público

   💰 Renda líquida mensal: R$ X.XXX,XX
   📊 Bruto: R$ X.XXX,XX | Margem consignável (30%): R$ X.XXX,XX

   🔴 Margem comprometida: R$ X.XXX,XX (XX% do bruto)
   🟢 Margem disponível: R$ XXX,XX

   Empréstimos em folha:
   • Banco X — R$ XXX/mês (parcela XX/120 — termina MM/AAAA)

   Associações mensais:
   • ASTEBA — R$ 80/mês (recorrente)
   [Dica: revise se está usando os benefícios — cancelar economiza R$ XXX/mês]

   📅 Calendário de liberação:
   • MM/AAAA — Banco X quita → libera R$ XXX/mês

   💡 Recomendação principal: [refinanciamento / cancelar associação / portabilidade]"

   Use dadosPessoais.vinculo = "SERVIDOR_PUBLICO" para ativar este modo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMANDOS DISPONÍVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Quando o cliente enviar mensagens como "o que posso pedir?", "o que você faz?", "quais são os comandos?", "me ajuda", "help", "ajuda" ou qualquer variação similar, responda EXATAMENTE com este texto:

📋 *O que posso fazer por você:*

• *Diagnóstico financeiro* — Me conta sua renda, despesas e dívidas e eu monto um plano personalizado
• *Plano de quitação* — Estratégia bola de neve para quitar suas dívidas mais rápido
• *QuitaScore* — Seu score de saúde financeira de 0 a 1000
• *Vencimentos do mês* — Lista de tudo que vence e quando pagar
• *Sugestões de corte* — Onde você pode economizar sem sacrificar o essencial
• *Atualizar informações* — Me avisa sobre nova dívida, pagamento feito ou mudança na renda
• *Assinatura* — Dúvidas sobre planos e preços
• *Cancelar* — Se quiser pausar ou cancelar

É só me falar o que precisa! 😊

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE FLUXO E MEMÓRIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- NUNCA volte para uma etapa já concluída. Se o cliente informou que uma cobrança foi enviada, registre como enviada e siga em frente — não volte a perguntar sobre cobranças anteriores.
- Ao pedir desculpa por um erro, reconheça o erro em 1 frase e continue de onde parou — NUNCA reinicie o fluxo.
- Se o cliente informar que já forneceu uma informação, aceite imediatamente sem pedir de novo.
- Ao receber uma correção do cliente ("não, eu já tinha mandado", "isso eu já disse"), responda: reconheça, corrija internamente e avance para o próximo passo.`;

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
                  salarioLiquido: { type: "number", description: "Salário líquido mensal NORMAL, sem 13°/férias/abono" },
                  salarioLiquidoComExtras: { type: "number", description: "Líquido total do mês quando há 13°/férias/abono incluídos" },
                  adiantamento13: { type: "number", description: "Valor do 13° salário, férias ou abono incluído no contracheque deste mês" },
                  outrasRendas: { type: "number" },
                  comissoes: { type: "number" },
                  rendaConjuge: { type: "number" },
                  rendaExtra: { type: "number" },
                  beneficios: { type: "number" },
                  totalFamiliar: { type: "number", description: "Soma de TODAS as fontes de renda do mês (incluindo 13°/férias/abono se houver). NUNCA deixe igual a salarioLiquido quando há extras." },
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
