// ─────────────────────────────────────────
// Texto de resposta adaptado ao chat do app
// ─────────────────────────────────────────
// O núcleo (controle-orquestrador) é canal-agnóstico e vários textos/prompts
// foram escritos pro WhatsApp ("organizar sua vida financeira pelo WhatsApp",
// "*negrito*"). Quem já está no chat do app não deve ouvir falar de WhatsApp —
// a resolução é ali mesmo (pedido do Ibrahim, 05/10/2026). Função pura: só o
// chat nativo aplica; o WhatsApp continua recebendo o texto original.

const TROCAS: Array<[RegExp, string]> = [
  [/\b(?:direto\s+)?pelo\s+WhatsApp\b/gi, "por aqui"],
  [/\b(?:direto\s+)?via\s+WhatsApp\b/gi, "por aqui"],
  [/\b(?:direto\s+)?(?:no|em)\s+(?:seu\s+|o\s+)?WhatsApp\b/gi, "aqui no chat"],
  [/\bd[oa]\s+(?:seu\s+)?WhatsApp\b/gi, "do chat"],
  [/\bpara\s+o\s+WhatsApp\b/gi, "para o chat"],
  [/\bWhatsApp\b/gi, "chat"],
];

export function adaptarRespostaParaChat(texto: string): string {
  let t = texto;
  for (const [re, por] of TROCAS) t = t.replace(re, por);
  // Markdown duplo (**assim**) que o modelo às vezes escreve: aparece cru no chat, vira texto simples.
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  // Negrito do WhatsApp (*assim*) aparece cru no chat: vira aspas.
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, (_m, antes: string, miolo: string) => `${antes}“${miolo}”`);
  return t;
}
