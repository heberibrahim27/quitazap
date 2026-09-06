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

// Achado do Ibrahim: "acho que consigo fazer isso de graça no bloco de
// notas do celular mesmo" (uma objeção de "faço sozinho/DIY", não um
// aceite) disparava "enviar_link" e marcava conversão — porque "isso" (um
// pronome genérico que aparece em qualquer frase) tava na lista de
// palavras de aceite. Mesmo problema existiria com "tenho"/"pode" (ex:
// "tenho uma dúvida", "pode ser que eu não use direito" — nem aceite nem
// objeção reconhecida, mas dispara aceite do mesmo jeito). A causa raiz é
// tratar palavra solta como sinal forte em frase livre qualquer, igual os
// outros bugs desta rodada. Fix: só um pequeno grupo de palavras
// inequívocas ("sim", "quero", "claro"...) conta como aceite em QUALQUER
// frase; o resto (mais genérico/ambíguo: "isso", "tenho", "pode"...) só
// conta quando a mensagem inteira é uma resposta curta e direta — nunca
// dentro de uma frase mais longa e substantiva, onde essas palavras
// aparecem à toa sem relação nenhuma com aceitar a oferta.
const RE_CONFIRMACAO_FORTE = /\b(sim|quero|claro|bora|show|perfeito|exato|to dentro|partiu|confirmado)\b/;
const RE_CONFIRMACAO_FRACA = /\b(s|tenho|pode|vamos|to|tô|ok|oba|isso|queria|preciso|ajuda|vai|top|legal|gostei|verdade|1)\b/;

export function detectaPositivo(msg: string): boolean {
  const m = normalizarTexto(msg).trim();
  if (RE_CONFIRMACAO_FORTE.test(m)) return true;

  const palavras = m.replace(/[.,!?]/g, "").split(/\s+/).filter(Boolean);
  return palavras.length <= 4 && RE_CONFIRMACAO_FRACA.test(m);
}

export function detectaNegativo(msg: string): boolean {
  const m = normalizarTexto(msg);
  return /\b(nao|n|nope|agora nao|depois|nao quero|obrigad[ao]|tchau|ate logo|flw|bye|2|nope|nn|nein)\b/.test(m);
}

// Recusa clara de CONTINUAR a conversa — usado só na pergunta de abertura
// (Dor) e na reação à demonstração, pra decidir se encerra o funil ali.
// Achado do Ibrahim: usar detectaNegativo() (acima) pra isso é armadilha —
// aquele detector casa com QUALQUER "não" na frase, então uma resposta
// substantiva de verdade como "não sei pra onde meu dinheiro vai" (que
// contém a palavra "não" mas está RESPONDENDO à pergunta, não recusando
// continuar) batia como recusa e encerrava o funil na 1ª mensagem, antes
// de mostrar qualquer coisa. Esse detector só reconhece recusa quando a
// mensagem é claramente uma negativa/dispensa — uma frase de dispensa
// explícita, ou uma resposta bem curta que é só negação/despedida — nunca
// uma frase substantiva que só contém a palavra "não" no meio.
const RE_RECUSA_ABERTURA = /\b(nao tenho (nenhum )?problema (com dinheiro)?|nao me interessa|nao quero (continuar|conversar|saber disso)|ta tudo (certo|bem|em ordem)|nada me (atrapalha|incomoda)|nao preciso disso|sem interesse)\b/;

export function ehRecusaClara(mensagem: string): boolean {
  const norm = normalizarTexto(mensagem).trim();
  if (RE_RECUSA_ABERTURA.test(norm)) return true;

  const palavras = norm.replace(/[.,!?]/g, "").split(/\s+/).filter(Boolean);
  return palavras.length <= 3 && /\b(nao|n|nada|nunca|obrigad[ao])\b/.test(norm);
}

// Pedido explícito pra parar de falar — respeitado na hora, sem mais
// nenhuma tentativa de reverter (WhatsApp Business API pode banir o número
// por padrão de mensagem insistente, e insistir contra um "pare" explícito
// seria pressionar a pessoa contra a vontade dela).
//
// Achado do Ibrahim (testando com frase livre): a versão anterior exigia
// substring EXATA "para de mandar" — "para de ME mandar mensagem" (com "me"
// no meio, forma naturalíssima de falar) não batia e o pedido de parar era
// ignorado. Frases naturais variam muito mais que um botão de atalho, então
// cada sinal abaixo é tolerante a palavras extras no meio ("de", "me",
// pronomes) em vez de exigir uma frase fixa.
export const RE_PARAR = /\b(pare\b|chega\b|cansei\b|desist[oa]\b|me deixa(?:m)? em paz\b|nao insist[ae]\b|descadastr\w*|sair da lista\b|cancela isso\b)|\bpara\s+(?:de\s+)?(?:me\s+)?(?:mandar|enviar|chamar|escrever|ligar)\w*\b|\bnao\s+(?:me\s+)?(?:manda|mande|chama|chame|liga|ligue|escreve|escreva)\w*\s+mais\b|\bnao\s+quero\s+mais\s+(?:falar|receber|mensage\w*|contato)\b|\bremov\w*\s+(?:meu\s+)?(?:contato|numero|telefone)\b/;

export const RE_PERGUNTA_PRECO = /\b(quanto custa|qual (o )?(valor|preco)|quanto (e|eh|fica|sai)|quanto que (e|eh|fica|custa)|qual o preco)\b/;

export type AnguloObjecao = "PRECO" | "CONFIANCA" | "CANCELAMENTO" | "CONCORRENTE" | "ADIAR";
const ORDEM_ANGULOS: AnguloObjecao[] = ["PRECO", "CONFIANCA", "CANCELAMENTO", "CONCORRENTE", "ADIAR"];

const RE_OBJ_PRECO = /\b(caro|cara|nao tenho dinheiro|sem grana|ta apertado|nao posso pagar|nao da pra pagar|muito dinheiro)\b/;
const RE_OBJ_CONFIANCA = /\b(confio|desconfio|sera que funciona|isso e golpe|e seguro|e confiavel|meus dados|vender meus dados|e verdade isso|parece scam|fraude)\b/;
// Achado do Ibrahim (registrado pra depois, sem urgência): pergunta sobre
// cancelamento/multa/fidelidade caía no rebate genérico de preço
// (cafezinho) em vez de responder direto sobre a política real, que já
// existe em outro lugar do texto ("Cancele quando quiser — sem
// burocracia"). Categoria própria pra reafirmar isso sem inventar nada novo.
const RE_OBJ_CANCELAMENTO = /\b(multa|fidelidade|pegadinha|letra miuda|taxa escondida|dificil (de )?cancelar|complicado (pra |para )?cancelar|preso (no|com o|na) (plano|contrato|assinatura))\b/;
// Achado do Ibrahim: "planilha" (o concorrente mais comum de verdade —
// Excel/Google Sheets/caderno) não estava na lista, só nomes de app
// (Mobills, GuiaBolso...). Sem esse sinal, uma objeção de "já resolvo do
// meu jeito" caía no fallback de ordem fixa e podia sair como CONFIANCA
// (próximo ângulo não usado) em vez de CONCORRENTE — parecia estar
// "classificando errado por causa do 'não sei'", mas na real é essa
// lacuna de vocabulário.
const RE_OBJ_CONCORRENTE = /\b(ja uso|ja tenho (um |outro )?app|mobills|guiabolso|organizze|minhas economias|uso outro aplicativo|planilha|excel|google sheets|no papel|no caderno|bloco de notas|no notion|anoto (tudo )?(na mao|no papel|no caderno)|resolvo (isso )?sozinho|meu jeito (ja )?resolve)\b/;
const RE_OBJ_ADIAR = /\b(vou pensar|depois eu vejo|depois eu falo|mais tarde|agora nao|nao agora|preciso pensar|deixa eu ver|vou ver)\b/;

// Retorna TODOS os ângulos presentes na mensagem, não só o primeiro —
// achado do Ibrahim: uma objeção composta ("caro d+, minha planilha já
// resolve") tem preço E concorrente na mesma frase, e a versão anterior
// (só o primeiro match) respondia preço e simplesmente descartava a parte
// da planilha, deixando a objeção real sem resposta nenhuma.
function detectarAngulos(mensagemNormalizada: string): AnguloObjecao[] {
  const angulos: AnguloObjecao[] = [];
  if (RE_OBJ_PRECO.test(mensagemNormalizada)) angulos.push("PRECO");
  if (RE_OBJ_CONFIANCA.test(mensagemNormalizada)) angulos.push("CONFIANCA");
  if (RE_OBJ_CANCELAMENTO.test(mensagemNormalizada)) angulos.push("CANCELAMENTO");
  if (RE_OBJ_CONCORRENTE.test(mensagemNormalizada)) angulos.push("CONCORRENTE");
  if (RE_OBJ_ADIAR.test(mensagemNormalizada)) angulos.push("ADIAR");
  return angulos;
}

// Rebatidas variam por ângulo pra nunca repetir o mesmo argumento — cada
// uma reconhece a objeção e responde por um ângulo diferente (preço→valor,
// desconfiança→como funciona de verdade, "já uso outro app"/planilha→
// diferencial, "vou pensar"→sem pressionar). Nenhuma promete resultado
// financeiro nem usa urgência inventada.
export const REBATIDAS: Record<AnguloObjecao, string> = {
  PRECO: `Entendo. Pensa assim: são ${PRECO_MENSAL} por mês — menos de R$ 0,50 por dia, bem menos que um cafezinho. Nesse valor você tem alguém de olho na sua vida financeira 24h, todo santo dia, direto no WhatsApp.`,
  CONFIANCA: `Faz todo sentido perguntar isso. O QuitaZAP não mexe no seu dinheiro nem faz nenhuma transação — você só me conta o que gastou ou recebeu, e eu organizo. A gente não vende dado pessoal nem financeiro de ninguém, e você pode cancelar quando quiser, sem burocracia.`,
  CANCELAMENTO: `Não tem multa, fidelidade nem pegadinha nenhuma. Você pode cancelar quando quiser, direto por aqui mesmo, sem burocracia — simples assim.`,
  CONCORRENTE: `Que bom que você já se preocupa com isso! A diferença é que aqui não tem app pra abrir nem planilha pra lembrar de preencher — você só manda uma mensagem no WhatsApp, do jeito que fala no dia a dia, e eu registro. Costuma ser mais fácil de manter no automático.`,
  ADIAR: `Sem problema, decisão que envolve dinheiro merece calma mesmo. O link fica disponível pra quando você decidir, sem pressa nenhuma. Posso te tirar mais alguma dúvida antes?`,
};

function proximoAnguloGenerico(usados: string[]): AnguloObjecao | null {
  return ORDEM_ANGULOS.find((angulo) => !usados.includes(angulo)) ?? null;
}

export type EstadoObjecaoLead = { tentativasObjecao: number; angulosUsados: string };

export type DecisaoPosOferta =
  | { acao: "parar" }
  | { acao: "responder_preco" }
  | { acao: "enviar_link" }
  | { acao: "rebater"; angulos: AnguloObjecao[]; novoEstado: EstadoObjecaoLead }
  | { acao: "desistir" };

// Nunca desiste na 1ª objeção: sempre escolhe ângulo(s) ainda não usado(s)
// (nunca repete o mesmo argumento), até 3 rodadas reais — depois disso, ou
// se todos os ângulos já foram usados, desiste. Se a mensagem trouxer
// mais de uma objeção ao mesmo tempo (ex: preço + concorrente), rebate
// AMBAS na mesma resposta em vez de responder só uma e descartar o resto.
// Um pedido explícito pra parar interrompe na hora, em qualquer momento.
export function decidirRespostaPosOferta(estado: EstadoObjecaoLead, mensagem: string): DecisaoPosOferta {
  const norm = normalizarTexto(mensagem);

  if (RE_PARAR.test(norm)) return { acao: "parar" };
  if (RE_PERGUNTA_PRECO.test(norm)) return { acao: "responder_preco" };

  const usados = estado.angulosUsados ? estado.angulosUsados.split(",").filter(Boolean) : [];
  const angulosDetectados = detectarAngulos(norm).filter((a) => !usados.includes(a));

  // "Sim"/interesse claro sem nenhuma objeção junto → manda o link, não
  // insiste à toa.
  if (detectaPositivo(mensagem) && !detectaNegativo(mensagem) && angulosDetectados.length === 0) {
    return { acao: "enviar_link" };
  }

  // Nenhum ângulo específico detectado (objeção vaga, "não sei", resposta
  // que não reconhecemos) → cai no próximo ângulo genérico ainda não usado,
  // na ordem fixa PRECO→CONFIANCA→CONCORRENTE→ADIAR.
  const anguloGenerico = proximoAnguloGenerico(usados);
  const angulosDaRodada = angulosDetectados.length > 0 ? angulosDetectados : (anguloGenerico ? [anguloGenerico] : []);

  if (estado.tentativasObjecao >= 3 || angulosDaRodada.length === 0) return { acao: "desistir" };

  return {
    acao: "rebater",
    angulos: angulosDaRodada,
    novoEstado: {
      tentativasObjecao: estado.tentativasObjecao + 1,
      angulosUsados: [...usados, ...angulosDaRodada].join(","),
    },
  };
}
