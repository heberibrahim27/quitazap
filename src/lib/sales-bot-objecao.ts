// ─────────────────────────────────────────
// QuitaZAP — Bot de Vendas: loop de objeção (lógica pura)
// ─────────────────────────────────────────
// Extraído de sales-bot.ts de propósito SEM nenhum import de Prisma/WhatsApp
// — mesmo padrão de controle-financeiro-flow.ts (flow puro + service com
// efeito colateral) — pra dar pra testar em massa combinações de objeção em
// sequência (preço → desconfiança → "vou pensar" etc.) sem precisar de
// banco nem mock de rede.

// Preço real vigente no checkout da Cakto (ver P0 "preço no checkout real"
// já resolvido) — uma única constante pra nunca ficar solto repetido em
// cada mensagem/rebatida.
export const PRECO_MENSAL = "R$ 14,90";

export function normalizarTexto(msg: string): string {
  return msg
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function detectaPositivo(msg: string): boolean {
  const m = normalizarTexto(msg);
  return /\b(sim|s|quero|tenho|claro|pode|vamos|bora|to dentro|to|tô|ok|oba|isso|queria|preciso|ajuda|show|vai|top|legal|gostei|perfeito|exato|verdade|1)\b/.test(m);
}

export function detectaNegativo(msg: string): boolean {
  const m = normalizarTexto(msg);
  return /\b(nao|n|nope|agora nao|depois|nao quero|obrigad[ao]|tchau|ate logo|flw|bye|2|nope|nn|nein)\b/.test(m);
}

// Pedido explícito pra parar de falar — respeitado na hora, sem mais
// nenhuma tentativa de reverter (WhatsApp Business API pode banir o número
// por padrão de mensagem insistente, e insistir contra um "pare" explícito
// seria pressionar a pessoa contra a vontade dela).
export const RE_PARAR = /\b(pare|para de mandar|nao me manda mais|descadastr\w*|remover meu contato|nao quero mais falar|nao me chame mais|sair da lista|cancela isso)\b/;

export const RE_PERGUNTA_PRECO = /\b(quanto custa|qual (o )?(valor|preco)|quanto (e|eh|fica|sai)|quanto que (e|eh|fica|custa)|qual o preco)\b/;

export type AnguloObjecao = "PRECO" | "CONFIANCA" | "CONCORRENTE" | "ADIAR";
const ORDEM_ANGULOS: AnguloObjecao[] = ["PRECO", "CONFIANCA", "CONCORRENTE", "ADIAR"];

const RE_OBJ_PRECO = /\b(caro|cara|nao tenho dinheiro|sem grana|ta apertado|nao posso pagar|nao da pra pagar|muito dinheiro)\b/;
const RE_OBJ_CONFIANCA = /\b(confio|desconfio|sera que funciona|isso e golpe|e seguro|e confiavel|meus dados|vender meus dados|e verdade isso|parece scam|fraude)\b/;
const RE_OBJ_CONCORRENTE = /\b(ja uso|ja tenho (um |outro )?app|mobills|guiabolso|organizze|minhas economias|uso outro aplicativo)\b/;
const RE_OBJ_ADIAR = /\b(vou pensar|depois eu vejo|depois eu falo|mais tarde|agora nao|nao agora|preciso pensar|deixa eu ver|vou ver)\b/;

export function detectarAngulo(mensagemNormalizada: string): AnguloObjecao | null {
  if (RE_OBJ_PRECO.test(mensagemNormalizada)) return "PRECO";
  if (RE_OBJ_CONFIANCA.test(mensagemNormalizada)) return "CONFIANCA";
  if (RE_OBJ_CONCORRENTE.test(mensagemNormalizada)) return "CONCORRENTE";
  if (RE_OBJ_ADIAR.test(mensagemNormalizada)) return "ADIAR";
  return null;
}

// Rebatidas variam por ângulo pra nunca repetir o mesmo argumento — cada
// uma reconhece a objeção e responde por um ângulo diferente (preço→valor,
// desconfiança→como funciona de verdade, "já uso outro app"→diferencial,
// "vou pensar"→sem pressionar). Nenhuma promete resultado financeiro nem
// usa urgência inventada.
export const REBATIDAS: Record<AnguloObjecao, string> = {
  PRECO: `Entendo. Pensa assim: são ${PRECO_MENSAL} por mês — menos de R$ 0,50 por dia, bem menos que um cafezinho. Nesse valor você tem alguém de olho na sua vida financeira 24h, todo santo dia, direto no WhatsApp.`,
  CONFIANCA: `Faz todo sentido perguntar isso. O QuitaZAP não mexe no seu dinheiro nem faz nenhuma transação — você só me conta o que gastou ou recebeu, e eu organizo. A gente não vende dado pessoal nem financeiro de ninguém, e você pode cancelar quando quiser, sem burocracia.`,
  CONCORRENTE: `Que bom que você já se preocupa com isso! A diferença é que aqui não tem app pra abrir nem planilha pra lembrar de preencher — você só manda uma mensagem no WhatsApp, do jeito que fala no dia a dia, e eu registro. Costuma ser mais fácil de manter no automático.`,
  ADIAR: `Sem problema, decisão que envolve dinheiro merece calma mesmo. O link fica disponível pra quando você decidir, sem pressa nenhuma. Posso te tirar mais alguma dúvida antes?`,
};

function escolherAngulo(detectado: AnguloObjecao | null, usados: string[]): AnguloObjecao | null {
  if (detectado && !usados.includes(detectado)) return detectado;
  return ORDEM_ANGULOS.find((angulo) => !usados.includes(angulo)) ?? null;
}

export type EstadoObjecaoLead = { tentativasObjecao: number; angulosUsados: string };

export type DecisaoPosOferta =
  | { acao: "parar" }
  | { acao: "responder_preco" }
  | { acao: "enviar_link" }
  | { acao: "rebater"; angulo: AnguloObjecao; novoEstado: EstadoObjecaoLead }
  | { acao: "desistir" };

// Nunca desiste na 1ª objeção: sempre escolhe um ângulo ainda não usado
// (nunca repete o mesmo argumento), até 3 rodadas reais — depois disso, ou
// se os 4 ângulos já foram usados, desiste. Um pedido explícito pra parar
// interrompe na hora, em qualquer momento.
export function decidirRespostaPosOferta(estado: EstadoObjecaoLead, mensagem: string): DecisaoPosOferta {
  const norm = normalizarTexto(mensagem);

  if (RE_PARAR.test(norm)) return { acao: "parar" };
  if (RE_PERGUNTA_PRECO.test(norm)) return { acao: "responder_preco" };

  // "Sim"/interesse claro sem nenhuma objeção junto → manda o link, não
  // insiste à toa.
  if (detectaPositivo(mensagem) && !detectaNegativo(mensagem) && !detectarAngulo(norm)) {
    return { acao: "enviar_link" };
  }

  // Qualquer outra coisa — objeção reconhecida (preço, desconfiança,
  // concorrente, "vou pensar"), um "não" solto, ou até uma resposta que a
  // gente não entendeu direito — conta como uma rodada de objeção.
  const usados = estado.angulosUsados ? estado.angulosUsados.split(",").filter(Boolean) : [];
  const anguloEscolhido = escolherAngulo(detectarAngulo(norm), usados);

  if (estado.tentativasObjecao >= 3 || !anguloEscolhido) return { acao: "desistir" };

  return {
    acao: "rebater",
    angulo: anguloEscolhido,
    novoEstado: {
      tentativasObjecao: estado.tentativasObjecao + 1,
      angulosUsados: [...usados, anguloEscolhido].join(","),
    },
  };
}
