const PALAVRAS_MULTIPLICADOR: Record<string, number> = {
  mil: 1_000,
  milhao: 1_000_000,
  milhoes: 1_000_000,
};

// Regex do valor-base (dígito, com ou sem 1-2 casas decimais depois de
// vírgula) que precede a palavra "mil"/"milhão"/"milhões" — ex.: "8 mil",
// "15mil", "2,5 mil", "1 milhao". Não cobre ponto como decimal aqui de
// propósito (nesse contexto BR o ponto é sempre separador de milhar, nunca
// decimal, então "1.000 mil" não faz sentido e não precisa ser tratado).
const REGEX_VALOR_COM_MULTIPLICADOR =
  /(\d+)(?:,(\d{1,2}))?\s*(mil|milhoes|milhao)\b(?:\s+e\s+(\d[\d.,]*))?/;

// Achado em teste ao vivo (09/09/2026): "quero juntar uns 8 mil pra viagem",
// "meu carro custou 15 mil", "financiamento de 8 mil, pago 500 por mes" — é
// um jeito coloquial BR extremamente comum de escrever valor redondo,
// diferente do "totalmente por extenso" que numero-por-extenso.ts já lida
// ("oito mil"). Sem essa checagem, extrairCandidatoMonetario pegava só o
// dígito solto antes de "mil" (ex.: "8" de "8 mil") e devolvia 8 em vez de
// 8000 — SEM erro, sem aviso, silenciosamente 1000x menor. Isso alimentava
// renda declarada, valor de meta, consulta de "posso gastar", horas
// trabalhadas e valor de dívida, todos usando parseMoneyBR na mensagem
// crua. Roda ANTES do parser normal (nunca depois) porque o parser normal
// combinado com extrairCandidatoMonetario SEMPRE acha um jeito de casar só
// o dígito, então nunca "sobra" pra esse caminho se ele rodasse por último.
// Não cobre "8 mil e quinhentos" (complemento por extenso) de propósito —
// só complemento em dígito ("8 mil e 500"); combinar com numero-por-extenso
// fica pra outra rodada.
function extrairValorComMultiplicadorEscrito(input: string): number | undefined {
  const normalizado = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  const match = normalizado.match(REGEX_VALOR_COM_MULTIPLICADOR);
  if (!match) return undefined;

  const inteiro = Number(match[1]);
  const decimal = match[2] ? Number(`0.${match[2]}`) : 0;
  const multiplicador = PALAVRAS_MULTIPLICADOR[match[3]] ?? 1;
  if (!Number.isFinite(inteiro)) return undefined;

  let valor = (inteiro + decimal) * multiplicador;

  if (match[4]) {
    const complemento = parseMoneyBRSemMultiplicador(match[4]);
    if (complemento != null) valor += complemento;
  }

  return Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

// Exportado à parte pra quem (ex.: gasto-flow.ts) já faz sua PRÓPRIA
// extração de candidato via regex antes de chamar parseMoneyBR — nesses
// casos o candidato isolado já chega sem o "mil"/"milhão" (foi cortado pela
// regex de quem chamou), então parseMoneyBR sozinho nunca veria o padrão.
// Quem tem acesso à mensagem crua deve tentar isso PRIMEIRO, antes da sua
// própria extração de candidato.
export function valorComMultiplicadorEscrito(input: string): number | undefined {
  const valor = extrairValorComMultiplicadorEscrito(input);
  return valor !== undefined ? arredondarCentavos(valor) : undefined;
}

export function parseMoneyBR(input: string | number | null | undefined): number | undefined {
  if (typeof input === "number") {
    return Number.isFinite(input) && input > 0 ? arredondarCentavos(input) : undefined;
  }

  if (!input) return undefined;

  const comMultiplicador = extrairValorComMultiplicadorEscrito(input);
  if (comMultiplicador !== undefined) return arredondarCentavos(comMultiplicador);

  return parseMoneyBRSemMultiplicador(input);
}

function parseMoneyBRSemMultiplicador(input: string): number | undefined {
  const candidato = extrairCandidatoMonetario(input);
  if (!candidato) return undefined;

  const texto = candidato
    .toLowerCase()
    .replace(/r\$/gi, "")
    .replace(/\b(reais|real)\b/gi, "")
    .replace(/\s+/g, "")
    .trim();

  if (!/\d/.test(texto)) return undefined;

  const ultimoPonto = texto.lastIndexOf(".");
  const ultimaVirgula = texto.lastIndexOf(",");
  const separadorDecimal = definirSeparadorDecimal(texto, ultimoPonto, ultimaVirgula);
  const normalizado = separadorDecimal
    ? normalizarComDecimal(texto, separadorDecimal)
    : texto.replace(/[.,]/g, "");
  const valor = Number(normalizado);

  return Number.isFinite(valor) && valor > 0 ? arredondarCentavos(valor) : undefined;
}

// Marcadores que indicam com confiança "isso aqui é um valor em dinheiro", não
// uma quantidade solta na frase (idade, nº de filhos/parcelas/pessoas etc.):
// R$, "reais"/"real", ou separador decimal com 1-2 dígitos depois.
const TEM_FORMATO_FINANCEIRO = /r\$|reais?\b|[.,]\d{1,2}\b/i;

function extrairCandidatoMonetario(input: string): string | undefined {
  const candidatos = input.match(/(?:r\$\s*)?\d[\d.,]*(?:\s*(?:reais|real))?/gi) ?? [];
  if (candidatos.length === 0) return undefined;
  if (candidatos.length === 1) return candidatos[0];

  // Bug achado em teste ao vivo (09/09/2026): frases como "corrija minha
  // renda, tenho 2 filhos e ganho 3200" sempre pegavam o PRIMEIRO número da
  // frase (o "2" de "2 filhos"), nunca o valor de verdade — isso corrompia
  // renda mensal, valor de hora trabalhada e outras leituras de texto livre.
  // Prioriza primeiro qualquer candidato com cara de dinheiro (R$, "reais"/
  // "real", ou decimal tipo ",50"); só na ausência de qualquer um desses,
  // cai pro MAIOR número solto da frase — um valor monetário real
  // dificilmente é a menor quantidade mencionada (idade, nº de
  // filhos/parcelas/pessoas em geral é bem menor que o valor em reais que a
  // pessoa está informando).
  const comFormatoFinanceiro = candidatos.find((c) => TEM_FORMATO_FINANCEIRO.test(c));
  if (comFormatoFinanceiro) return comFormatoFinanceiro;

  return candidatos.reduce((maior, atual) => {
    const valorAtual = Number(atual.replace(/[.,]/g, ""));
    const valorMaior = Number(maior.replace(/[.,]/g, ""));
    return valorAtual > valorMaior ? atual : maior;
  });
}

function definirSeparadorDecimal(
  texto: string,
  ultimoPonto: number,
  ultimaVirgula: number
): "." | "," | null {
  const ultimoSeparador = Math.max(ultimoPonto, ultimaVirgula);
  if (ultimoSeparador < 0) return null;

  const digitosDepois = texto.length - ultimoSeparador - 1;
  if (digitosDepois === 1 || digitosDepois === 2) {
    return ultimoPonto > ultimaVirgula ? "." : ",";
  }

  return null;
}

function normalizarComDecimal(texto: string, separadorDecimal: "." | ","): string {
  const ultimoSeparador = texto.lastIndexOf(separadorDecimal);
  const inteiros = texto.slice(0, ultimoSeparador).replace(/[.,]/g, "");
  const centavos = texto.slice(ultimoSeparador + 1).replace(/[.,]/g, "");
  return `${inteiros}.${centavos}`;
}

function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}
