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
    "```\n" +
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
    "```\n" +
    "minha renda é 3800\n" +
    "```"
  );
}

export function formatarValorControle(valor: number): string {
  if (!Number.isFinite(valor)) return "R$ 0,00";
  return valor
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/\u00a0|\u202f/g, " ");
}

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseValor(valorTexto: string): number | undefined {
  const limpo = valorTexto.replace(/[R$\s]/gi, "");
  const temCentavos = /,\d{1,2}$|\.\d{1,2}$/.test(limpo);
  const normalizado = temCentavos
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo.replace(",", ".");
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

export function extrairRendaControle(mensagem: string, aceitarValorSolto = false): number | undefined {
  const texto = normalizarTexto(mensagem);
  const mencionaRenda = /\b(renda|salario|salario liquido|ganho|recebo|entra por mes|entra no mes)\b/.test(texto);
  if (!mencionaRenda && !aceitarValorSolto) return undefined;

  const candidatos = [
    /r\$\s*\d{1,3}(?:\.\d{3})*,\d{1,2}/i,
    /\d{1,3}(?:\.\d{3})*,\d{1,2}/i,
    /r\$\s*\d+(?:[.,]\d{1,2})?/i,
    /\b\d{3,6}(?:[.,]\d{1,2})?\b/i,
  ];

  for (const regex of candidatos) {
    const match = texto.match(regex);
    if (match) return parseValor(match[0]);
  }

  return undefined;
}

export function mensagemRendaRegistradaControle(valor: number): string {
  return (
    "✅ *Renda registrada.*\n\n" +
    "```\n" +
    "Renda mensal\n" +
    `${formatarValorControle(valor)}\n` +
    "```"
  );
}

export function mensagemPedidoDespesasFixasControle(): string {
  return "Agora me diga suas despesas fixas.";
}

export function mensagemExplicarDespesasFixasControle(): string {
  return (
    "📌 *Despesas fixas*\n\n" +
    "São gastos que você paga todo mês ou quase todo mês.\n\n" +
    "```\n" +
    "Aluguel\n" +
    "Energia\n" +
    "Água\n" +
    "Internet\n" +
    "Escola\n" +
    "Pensão\n" +
    "Assinaturas\n" +
    "Academia\n" +
    "Financiamento\n" +
    "Empréstimo\n" +
    "Consignado\n" +
    "Parcelamento\n" +
    "```\n\n" +
    "Pode mandar assim:\n\n" +
    "```\n" +
    "Energia 120\n" +
    "Internet 90\n" +
    "Pensão 900\n" +
    "Empréstimo Banco do Brasil 300 12/120\n" +
    "Financiamento moto 450 8/36\n" +
    "```"
  );
}
