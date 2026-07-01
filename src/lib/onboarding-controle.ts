export const RESET_CONTROLE_MENSAGEM_1 =
  "✅ *Tudo zerado.*\n\n" +
  "Vamos recomeçar seu controle financeiro do zero.";

export function mensagemInicioControle(nome: string): string {
  const nomeSeguro = nome?.trim() || "cliente";

  return (
    `Olá, ${nomeSeguro}! 👋\n\n` +
    "Eu sou o *QuitaZAP Controle*, sua IA de organização financeira pelo WhatsApp.\n\n" +
    "Vou te ajudar a registrar renda, despesas, gastos, cartões, dívidas, vencimentos e limites por categoria.\n\n" +
    "Para começar, me diga quanto entra por mês.\n\n" +
    "Exemplo:\n" +
    "```text\n" +
    "minha renda é 3800\n" +
    "```"
  );
}

export function mensagensResetControle(nome: string): [string, string] {
  return [RESET_CONTROLE_MENSAGEM_1, mensagemInicioControle(nome)];
}

export function mensagemBoasVindasControle(nome: string, oferta: string): string {
  const nomeSeguro = nome?.trim() || "cliente";
  const ofertaSegura = oferta?.trim() || "Plano QuitaZAP";

  return (
    `Olá, ${nomeSeguro}! 👋\n` +
    "Seu acesso ao *QuitaZAP Controle* foi ativado.\n\n" +
    `Sua assinatura do *${ofertaSegura}* está confirmada ✅\n\n` +
    "Eu sou o *QuitaZAP Controle*, sua IA de organização financeira pelo WhatsApp.\n\n" +
    "Vou te ajudar a registrar renda, despesas, gastos, cartões, dívidas, vencimentos e limites por categoria.\n\n" +
    "Para começar, me diga quanto entra por mês.\n\n" +
    "Exemplo:\n" +
    "```text\n" +
    "minha renda é 3800\n" +
    "```"
  );
}
