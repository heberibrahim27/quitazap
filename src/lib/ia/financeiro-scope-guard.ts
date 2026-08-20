import {
  criarIntentForaEscopo,
  type FinanceiroIntent,
} from "./financeiro-intent-schema";

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PADROES_FORA_ESCOPO = [
  /\bpiada\b/,
  /\bquem descobriu o brasil\b/,
  /\btexto de namoro\b/,
  /\bprograma(?:cao|r)\b/,
  /\breceita de (?:comida|bolo|pudim|brigadeiro)\b/,
  /\bpolitica\b/,
  /\breligiao\b/,
  /\bfofoca\b/,
  /\bnoticias?\b/,
];

const PADROES_PROMPT_INJECTION = [
  /\bignore (?:suas|as) instrucoes\b/,
  /\baja como chatgpt\b/,
  /\bchatgpt livre\b/,
  /\bme diga seu prompt\b/,
  /\bmostre seu prompt\b/,
  /\bdesconsidere (?:suas|as) regras\b/,
];

const PADROES_ESCOPO = [
  /\bcartao\b/,
  /\bcartoes\b/,
  /\bmeus\s+cartoes\b/,
  /\bsaldo\b/,
  /\bmeu\s+saldo\b/,
  /\bcomo\s+esta\s+meu\s+saldo\b/,
  /\bquanto\s+sobrou\b/,
  /\bquanto\s+tenho\b/,
  /\bresumo\b/,
  /\bresumo\s+do\s+mes\b/,
  /\bapostei\b/,
  /\baposta\b/,
  /\bapostas\b/,
  /\bbet\b/,
  /\bbetano\b/,
  /\bblaze\b/,
  /\btigrinho\b/,
  /\bcassino\b/,
  /\broleta\b/,
  /\bfoguetinho\b/,
  /\bpix\s+bet\b/,
  /\bbanca\b/,
  /\bjogo\s+de\s+aposta\b/,
  /\bcasa\s+de\s+aposta\b/,
  /\brenda\b/,
  /\bsalario\b/,
  /\brecebi\b/,
  /\bcliente pagou\b/,
  /\bcaiu pix\b/,
  /\bpagaram\b/,
  /\bentrou\b/,
  /\bvendi\b/,
  /\bpix\b/,
  /\bgastei\b/,
  /\bgasto\b/,
  /\bcomprei\b/,
  /\bpaguei\b/,
  /\bdespesas?\b/,
  /\bfixas?\b/,
  /\bmercado\b/,
  /\bcart[aã]o\b/,
  /\bfatura\b/,
  /\bboleto\b/,
  /\bdivida\b/,
  /\bmeta\b/,
  /\btransferencia\b/,
  /\bconsulta\b/,
  /\bqual minha\b/,
  /\blistar\b/,
  /\bresumo financeiro\b/,
  /\benergia\b/,
  /\baluguel\b/,
  /\bpensao\b/,
  /\binternet\b/,
  /\bwaifai\b/,
  /\bwifi\b/,
  /\bchat ?gpt\b/,
];

const ALIASES_CARTAO_ESCOPO = [
  "nubank",
  "bb",
  "banco do brasil",
  "mercado pago",
  "inter",
  "pagbank",
  "bradesco",
  "santander",
  "caixa",
  "itau",
  "itaú",
  "c6",
  "picpay",
  "neon",
];

// Sinal forte de valor em reais — não é "qualquer número solto" (que pode
// ser hora, endereço, quantidade), é especificamente um número no formato
// de dinheiro (com centavos) ou seguido da palavra "reais"/"real". Mesmo
// critério já usado em gasto-flow.ts pra filtrar candidato a valor de
// gasto — reaproveitado aqui pra ampliar o que conta como "mensagem
// financeira" sem abrir mão de exigir que pareça mesmo um valor.
//
// O caso de horário escrito com vírgula ("cheguei umas 22,30 hoje", "sai as
// 18,30h") não pode ser confundido com dinheiro — mas a 1ª versão dessa
// checagem (regex única, achado do item 7) excluía QUALQUER "X,XX hoje"/
// "X,XX da manhã" mesmo sem nenhuma pista de horário antes do número,
// derrubando de volta pra fora de escopo frases comuns de gasto sem
// palavra-gatilho como "torrei 30,00 hoje" ou "queimei 45,00 hoje de
// gasolina" — exatamente a classe de mensagem que essa checagem existe pra
// cobrir. Uma 2ª versão (ainda no item 7) passou a exigir também uma pista
// de horário ANTES do número ("as"/"umas"/"pelas"...) — mas "umas"/"uns"/"a"
// sozinhos também são jeito comum de escrever quantia aproximada ("peguei
// uns 30,00 hoje", "ganhei umas 45,00"), então continuavam derrubando
// mensagem de dinheiro de verdade. O critério decisivo de verdade é se o
// número TEM CARA de horário: hora entre 0-23 e minuto entre 0-59 ("22,30"
// é plausível, "30,00" não existe como hora). Só trata como horário quando
// o número é hora-plausível E: (a) vem colado num sufixo de hora ("18,30h"
// — inequívoco em qualquer contexto), ou (b) tem uma pista de horário antes
// *e* um marcador de período do dia depois ("hoje"/"da manhã"...).
const PISTA_HORARIO_ANTES = /\b(?:as|umas|uns|pelas|pelos|la pelas|por volta d[ae]s?)\s*$/;
const PISTA_HORARIO_DEPOIS_FORTE = /^\s*(?:h|hs|hrs|horas)\b/;
const PISTA_HORARIO_DEPOIS_FRACA = /^\s*(?:hoje|da manha|da tarde|da noite)\b/;

function pareceHorarioPlausivel(horaTexto: string, minutoTexto: string): boolean {
  const hora = Number(horaTexto.replace(/\./g, ""));
  const minuto = Number(minutoTexto);
  return Number.isInteger(hora) && hora >= 0 && hora <= 23 && Number.isInteger(minuto) && minuto >= 0 && minuto <= 59;
}

function pareceValorMonetarioForte(texto: string): boolean {
  if (/\br\$\s*\d/.test(texto)) return true;
  if (/\b\d[\d.,]*\s*(?:reais|real)\b/.test(texto)) return true;

  const regexDecimal = /\b(\d[\d.]*),(\d{2})\b/g;
  let match: RegExpExecArray | null;
  while ((match = regexDecimal.exec(texto))) {
    const antes = texto.slice(0, match.index);
    const depois = texto.slice(match.index + match[0].length);
    const horaPlausivel = pareceHorarioPlausivel(match[1], match[2]);

    if (horaPlausivel && PISTA_HORARIO_DEPOIS_FORTE.test(depois)) continue;
    if (horaPlausivel && PISTA_HORARIO_ANTES.test(antes) && PISTA_HORARIO_DEPOIS_FRACA.test(depois)) continue;
    return true;
  }

  return false;
}

function pareceGastoEmCartao(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  if (!/\b\d[\d.,]*\b/.test(texto)) return false;

  if (/\b(?:no|na|pelo|pela)\s+(?:cart\S*|banco)\s+\S+/.test(texto)) return true;

  return ALIASES_CARTAO_ESCOPO.some((alias) => {
    const aliasNormalizado = normalizarTexto(alias).replace(/\s+/g, "\\s+");
    return new RegExp(`\\b(?:no|na|pelo|pela)\\s+(?:cartao|cartão|banco)?\\s*${aliasNormalizado}\\b`).test(texto);
  });
}

export function avaliarEscopoFinanceiro(mensagem: string): FinanceiroIntent {
  const texto = normalizarTexto(mensagem);
  if (!texto) return criarIntentForaEscopo();

  if (PADROES_PROMPT_INJECTION.some((regex) => regex.test(texto))) {
    return criarIntentForaEscopo();
  }

  if (PADROES_FORA_ESCOPO.some((regex) => regex.test(texto))) {
    return criarIntentForaEscopo();
  }

  const emEscopo =
    PADROES_ESCOPO.some((regex) => regex.test(texto)) ||
    pareceGastoEmCartao(mensagem) ||
    pareceValorMonetarioForte(texto);

  return emEscopo
    ? {
        emEscopo: true,
        intencao: "financeiro",
        confianca: 0.85,
        precisaConfirmacao: false,
        itens: [],
      }
    : criarIntentForaEscopo();
}

export function devePularInterpretadorFinanceiroIA(mensagem: string, temConfirmacaoPendente = false): boolean {
  const texto = normalizarTexto(mensagem);
  if (temConfirmacaoPendente) return true;
  if (!texto || texto.length <= 1) return true;
  if (/^(1|2|sim|nao|não|confirmar|cadastrar|corrigir|manter)$/.test(texto)) return true;
  if (/^(resetar|comecar de novo|zerar conversa|reiniciar)$/.test(texto)) return true;
  if (/^(listar despesas fixas|mostrar minhas despesas fixas|quais sao minhas despesas fixas\??)$/.test(texto)) {
    return true;
  }
  return false;
}

export function deveChamarInterpretadorFinanceiroIA(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  if (mensagem.length > 1000) return false;
  if ((texto.match(/\b\d[\d.,]*\b/g) ?? []).length >= 2) return true;
  if (/[.?!].+\b\d[\d.,]*\b/.test(texto)) return true;
  if (/\b(?:anota pra mim|cliente pagou|recebi pix|caiu pix|entrou|entrou dinheiro|me pagaram|vendi)\b/.test(texto)) return true;
  if (/\b(?:akuguel|waifai|conto|mes|tambem|umas coisa)\b/.test(texto)) return true;
  // Mensagem de um único gasto, sem nenhuma das palavras acima — ainda
  // assim vale chamar a IA se tiver um valor com cara de dinheiro de
  // verdade. Isso só é alcançado depois que resolverLocal() já tentou e
  // não achou nada (ver resolverIntencaoFinanceiraIA), então não substitui
  // os resolvedores locais — só evita que a mensagem pule direto pro
  // fallback 100% regex de registrarGastoControle sem passar pela IA.
  if (pareceValorMonetarioForte(texto)) return true;
  return false;
}

export function deveUsarInterpretadorFinanceiroIA(
  mensagem: string,
  temConfirmacaoPendente = false
): boolean {
  if (devePularInterpretadorFinanceiroIA(mensagem, temConfirmacaoPendente)) return false;

  const escopo = avaliarEscopoFinanceiro(mensagem);
  if (!escopo.emEscopo) return true;

  return deveChamarInterpretadorFinanceiroIA(mensagem);
}
