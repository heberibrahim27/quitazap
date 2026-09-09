export function parseMoneyBR(input: string | number | null | undefined): number | undefined {
  if (typeof input === "number") {
    return Number.isFinite(input) && input > 0 ? arredondarCentavos(input) : undefined;
  }

  if (!input) return undefined;

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
