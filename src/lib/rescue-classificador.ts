// ─────────────────────────────────────────
// QuitaZAP — Rescue parser: decisão da escada (lógica pura)
// ─────────────────────────────────────────
// Pedido do Ibrahim (2026-09-06): a fila de revisão manual não escala —
// "pensa em 10 mil clientes tendo que olhar manualmente". Até aqui, quando
// nem o fluxo determinístico nem o interpretador financeiro entendiam uma
// mensagem, o rescue parser (ai-bot.ts) desistia na 3ª tentativa e deixava
// o cliente com "vou deixar pendente pra revisão" — sem prazo, sem ação,
// esperando um humano olhar. Isso não escala.
//
// Novo desenho: o bot SEMPRE dá uma resposta definitiva e acionável na
// hora — nunca deixa o cliente esperando alguém. A fila de admin
// (MensagemPendenteRevisao) vira duas coisas bem diferentes:
//   - CRÍTICA: mensagem que genuinamente precisa de um humano depois
//     (cancelamento, reclamação grave, erro de cobrança, pedido explícito
//     de falar com alguém) — aqui SIM alguém da equipe deve agir, mas o
//     cliente já recebeu uma resposta real na mesma hora, nunca silêncio.
//   - MONITORAMENTO: mensagem que o parser não entendeu e não é crítica —
//     vira só dado pra melhorar o parser depois (mesmo padrão dos bugs
//     "planilha"/composição de objeção achados no sales-bot: vocabulário
//     que falta). Ninguém precisa agir por cliente — é um painel de
//     padrões, não uma fila de tarefas.
//
// Extraído puro de propósito (sem Prisma/rede), mesmo padrão de
// sales-bot-objecao.ts — dá pra testar toda a escada em massa sem banco.

function normalizarTexto(msg: string): string {
  return msg
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ── Criticidade ───────────────────────────
// Só estas 4 categorias tiram uma mensagem do "painel de monitoramento"
// e colocam na fila que exige ação humana de verdade — deliberadamente
// estreito, pra não voltar a virar uma fila gigante de "tudo que não
// entendi". Ordem de checagem importa: mais específico/acionável primeiro.
export type CategoriaCritica = "CANCELAMENTO" | "ERRO_COBRANCA" | "RECLAMACAO_GRAVE" | "PEDIR_HUMANO";

const RE_CANCELAMENTO =
  /\b(cancelar|cancelamento)\b|\bcancela(r)?\s+(a\s+|minha\s+)?(assinatura|conta|o\s+quitazap)\b|\bnao\s+quero\s+mais\s+(usar|pagar|o\s+quitazap|a\s+assinatura)\b|\bencerrar\s+(a\s+)?assinatura\b|\bquero\s+sair\s+do\s+quitazap\b/;

const RE_ERRO_COBRANCA =
  /\bcobra(ram|do)\s+(errado|duas\s+vezes|de\s+novo|indevidamente|a\s+mais)\b|\bcobranca\b(?:\s+\w+){0,2}\s+(errada|duplicada|indevida)\b|\bnao\s+reconhe[cç]o\s+essa\s+cobranca\b|\bme\s+debitaram\b|\bquero\s+(?:um\s+|o\s+)?estorno\b|\bquero\s+(?:um\s+|o\s+)?reembolso\b/;

const RE_RECLAMACAO_GRAVE =
  /\b(golpe|fraude|absurdo|descaso|pessimo\s+atendimento|vou\s+processar|reclame\s+aqui|procon|horrivel|decepcionad[ao]|nunca\s+mais\s+uso)\b/;

const RE_PEDIR_HUMANO =
  /\bfalar\s+com\s+(um\s+)?(atendente|humano|pessoa|alguem)\b|\b(quero|preciso)\s+(de\s+)?(um\s+)?atendente\b|\btem\s+alguem\s+(ai|disponivel)\b/;

export function classificarCriticidade(mensagem: string): CategoriaCritica | null {
  const norm = normalizarTexto(mensagem);
  if (RE_CANCELAMENTO.test(norm)) return "CANCELAMENTO";
  if (RE_ERRO_COBRANCA.test(norm)) return "ERRO_COBRANCA";
  if (RE_RECLAMACAO_GRAVE.test(norm)) return "RECLAMACAO_GRAVE";
  if (RE_PEDIR_HUMANO.test(norm)) return "PEDIR_HUMANO";
  return null;
}

// ── Menu da 1ª tentativa ───────────────────
// Baixo risco por natureza (só escolhe qual EXEMPLO mostrar na 2ª
// tentativa, nunca decide um lançamento de verdade) — pode ser mais
// permissivo que os classificadores do sales-bot sem risco real.
export type OpcaoMenuRescue = "GASTO" | "RENDA" | "DIVIDA" | "OUTRO";

const RE_OPCAO_OUTRO = /^\s*4\b|\boutro\s+assunto\b|\bcancel|\bcobranca\b|\breclama|\batendente\b|\bhumano\b/;
const RE_OPCAO_GASTO = /^\s*1\b|\bgasto\b|\bgastei\b|\bcomprei\b|\bpaguei\b/;
const RE_OPCAO_RENDA = /^\s*2\b|\brenda\b|\brecebi\b|\bsalario\b|\bpix\b/;
const RE_OPCAO_DIVIDA = /^\s*3\b|\bdivida\b|\bconta\s+pra\s+pagar\b|\bemprestimo\b|\bparcela\b/;

export function classificarOpcaoMenu(mensagem: string): OpcaoMenuRescue | null {
  const norm = normalizarTexto(mensagem).trim();
  // "outro assunto" checado primeiro: suas palavras-chave (cancelamento,
  // cobrança, reclamação, atendente) são mais específicas que as de
  // gasto/renda/dívida e não devem ser ofuscadas por elas.
  if (RE_OPCAO_OUTRO.test(norm)) return "OUTRO";
  if (RE_OPCAO_GASTO.test(norm)) return "GASTO";
  if (RE_OPCAO_RENDA.test(norm)) return "RENDA";
  if (RE_OPCAO_DIVIDA.test(norm)) return "DIVIDA";
  return null;
}

// ── Mensagens ──────────────────────────────

export const MENSAGEM_RESCUE_TENTATIVA_1 = `Não consegui entender exatamente o que você quer registrar. Do que se trata?

1️⃣ Um gasto que fiz
2️⃣ Uma renda que recebi
3️⃣ Uma dívida ou conta pra pagar
4️⃣ Outro assunto (cancelamento, cobrança, reclamação, falar com alguém)`;

// Prefixo fixo (nunca muda) pra identificar "estamos na 2ª tentativa" no
// próximo turno, mesmo com o exemplo variando por opção do menu — ver
// ultimaRespostaEhTentativa2() abaixo.
const PREFIXO_TENTATIVA_2 = "Ainda não consegui interpretar com segurança.";

const EXEMPLO_POR_OPCAO: Record<OpcaoMenuRescue, string> = {
  GASTO: 'Pode me mandar assim: "gastei R$45 no mercado" ou "paguei 30 de uber".',
  RENDA: 'Pode me mandar assim: "recebi R$3.000 de salário" ou "caiu um pix de 200".',
  DIVIDA: 'Pode me mandar assim: "peguei um empréstimo de 500 no banco" ou "paguei a parcela do cartão".',
  OUTRO: "Me conta com mais detalhes o que você precisa (cancelamento, cobrança, reclamação ou outra coisa) que eu vejo como te ajudar.",
};
const EXEMPLO_GENERICO = 'Pode me mandar de forma simples, por exemplo: "gastei R$80 no mercado" ou "recebi R$3.000 de salário".';

function mensagemTentativa2(opcao: OpcaoMenuRescue | null): string {
  const exemplo = opcao ? EXEMPLO_POR_OPCAO[opcao] : EXEMPLO_GENERICO;
  return `${PREFIXO_TENTATIVA_2} ${exemplo}`;
}

function ultimaRespostaEhTentativa2(ultimaResposta: string | null): boolean {
  return ultimaResposta != null && ultimaResposta.startsWith(PREFIXO_TENTATIVA_2);
}

const RESPOSTA_CRITICA: Record<CategoriaCritica, string> = {
  CANCELAMENTO:
    "Entendi. O cancelamento é feito direto pela Cakto (a plataforma que processou seu pagamento) — você recebeu um link de gerenciar assinatura no e-mail de confirmação da compra. Se não encontrar, me avisa que a equipe QuitaZAP te ajuda a resolver.",
  ERRO_COBRANCA:
    "Entendi, isso é importante resolver rápido. Já registrei aqui pra nossa equipe verificar sua cobrança. Se puder, me manda o valor e a data que apareceram errados — ajuda a resolver mais rápido.",
  RECLAMACAO_GRAVE:
    "Sinto muito por essa experiência. Registrei sua mensagem pra nossa equipe analisar com atenção. Se quiser, me conta mais detalhes que fica tudo registrado.",
  PEDIR_HUMANO:
    "Claro! Registrei sua mensagem pra alguém da equipe te responder pessoalmente. Enquanto isso, se for algo rápido sobre gasto, renda ou dívida, posso tentar ajudar aqui mesmo — é só me contar.",
};

// Encerramento definitivo — nunca promete resposta humana nem pede pra
// esperar. Sempre dá um próximo passo que o cliente resolve sozinho.
export const MENSAGEM_RESCUE_FINAL_NAO_CRITICA = `Não consegui entender ainda, mas não vou insistir mais por aqui 😊

Você pode:
• Tentar de um jeito bem simples, tipo "gastei 50 no mercado"
• Registrar direto no seu painel: https://quitazap.com.br/minha-conta

É só me chamar de novo quando quiser tentar!`;

// ── Decisão da escada (pura) ───────────────

export type DecisaoRescue =
  | { tipo: "critica"; categoria: CategoriaCritica; resposta: string }
  | { tipo: "final_nao_critica"; resposta: string }
  | { tipo: "tentativa_2"; resposta: string }
  | { tipo: "tentativa_1"; resposta: string };

export function decidirRespostaRescue(
  ultimaRespostaDoAssistente: string | null,
  novaMensagem: string
): DecisaoRescue {
  // Mensagem crítica resolve na hora, em qualquer ponto da escada — não
  // faz sentido oferecer "gasto/renda/dívida" pra quem já disse
  // claramente que quer cancelar ou está reclamando de uma cobrança.
  const categoriaCritica = classificarCriticidade(novaMensagem);
  if (categoriaCritica) {
    return { tipo: "critica", categoria: categoriaCritica, resposta: RESPOSTA_CRITICA[categoriaCritica] };
  }

  if (ultimaRespostaEhTentativa2(ultimaRespostaDoAssistente)) {
    return { tipo: "final_nao_critica", resposta: MENSAGEM_RESCUE_FINAL_NAO_CRITICA };
  }

  if (ultimaRespostaDoAssistente === MENSAGEM_RESCUE_TENTATIVA_1) {
    const opcao = classificarOpcaoMenu(novaMensagem);
    return { tipo: "tentativa_2", resposta: mensagemTentativa2(opcao) };
  }

  return { tipo: "tentativa_1", resposta: MENSAGEM_RESCUE_TENTATIVA_1 };
}
