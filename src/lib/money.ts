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

function extrairCandidatoMonetario(input: string): string | undefined {
  const candidatos = input.match(/(?:r\$\s*)?\d[\d.,]*(?:\s*(?:reais|real))?/gi) ?? [];
  return candidatos.find((candidato) => /\d/.test(candidato));
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
