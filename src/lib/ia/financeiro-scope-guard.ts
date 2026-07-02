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
  "itau",
  "itaú",
  "c6",
];

function pareceGastoEmCartao(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  if (!/\b\d[\d.,]*\b/.test(texto)) return false;

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
    /\br\$\s*\d/.test(texto);

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
