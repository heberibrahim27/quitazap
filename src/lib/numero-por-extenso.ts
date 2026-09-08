// ─────────────────────────────────────────
// QuitaZAP — números por extenso (PT-BR) → valor numérico
// ─────────────────────────────────────────
// Achado em teste ao vivo (set/2026, bateria de diversidade de escolaridade):
// mensagens tipo "gastei cem reais no mercado" ou "recebi mil e duzentos de
// bico" não têm NENHUM dígito. Tanto o parser determinístico
// (extrairValorGasto, gasto-flow.ts) quanto o guardião de escopo da IA
// (financeiro-scope-guard.ts, que também exige \b\d) ignoravam a mensagem
// inteira mesmo com verbo financeiro claro ("gastei"/"recebi") — o cliente
// recebia "Qual foi o valor desse gasto?" (ignorando que ele já respondeu) ou
// caía direto no menu genérico de "não consegui entender".
//
// Este módulo só faz uma coisa: dado um texto já normalizado (minúsculo, sem
// acento — mesmo formato usado por normalizarTexto em gasto-flow.ts e
// financeiro-scope-guard.ts), tenta achar um número escrito por extenso e
// devolve o valor. Não decide sozinho se é dinheiro — quem chama continua
// responsável por exigir um verbo financeiro / palavra "reais" por perto,
// exatamente como já se exige hoje pro caso com dígito.

const UNIDADES: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
};

const DEZENAS_ESPECIAIS: Record<string, number> = {
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
};

const DEZENAS: Record<string, number> = {
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
};

const CENTENAS: Record<string, number> = {
  cem: 100,
  cento: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
};

const MIL = "mil";
const MILHAO = new Set(["milhao", "milhoes"]);

export const PALAVRAS_NUMERICAS_EXTENSO = new Set<string>([
  ...Object.keys(UNIDADES),
  ...Object.keys(DEZENAS_ESPECIAIS),
  ...Object.keys(DEZENAS),
  ...Object.keys(CENTENAS),
  MIL,
  ...MILHAO,
]);

// Lê um grupo de 0-999 a partir do índice i. consumidos=0 quando não achou
// nada reconhecível ali (não é erro, só "não tem número aqui").
function lerGrupoCentena(tokens: string[], i: number): { valor: number; consumidos: number } {
  let idx = i;
  let valor = 0;

  const centena = CENTENAS[tokens[idx]];
  if (centena !== undefined) {
    valor += centena;
    idx += 1;
    const proximo = tokens[idx + 1];
    const temContinuacao =
      tokens[idx] === "e" &&
      (DEZENAS[proximo] !== undefined || DEZENAS_ESPECIAIS[proximo] !== undefined || UNIDADES[proximo] !== undefined);
    if (!temContinuacao) return { valor, consumidos: idx - i };
    idx += 1; // consome "e"
  }

  if (DEZENAS_ESPECIAIS[tokens[idx]] !== undefined) {
    valor += DEZENAS_ESPECIAIS[tokens[idx]];
    idx += 1;
    return { valor, consumidos: idx - i };
  }

  if (DEZENAS[tokens[idx]] !== undefined) {
    valor += DEZENAS[tokens[idx]];
    idx += 1;
    if (tokens[idx] === "e" && UNIDADES[tokens[idx + 1]] !== undefined) {
      valor += UNIDADES[tokens[idx + 1]];
      idx += 2;
    }
    return { valor, consumidos: idx - i };
  }

  if (UNIDADES[tokens[idx]] !== undefined) {
    valor += UNIDADES[tokens[idx]];
    idx += 1;
    return { valor, consumidos: idx - i };
  }

  return { valor, consumidos: idx - i };
}

function lerNumeroApartir(tokens: string[], inicio: number): { valor: number; consumidos: number } | null {
  let idx = inicio;
  let total = 0;
  let houveAlgo = false;

  // Milhões ("dois milhões", "um milhão e duzentos mil")
  const grupoMilhao = lerGrupoCentena(tokens, idx);
  if (grupoMilhao.consumidos > 0 && MILHAO.has(tokens[idx + grupoMilhao.consumidos])) {
    total += grupoMilhao.valor * 1_000_000;
    idx += grupoMilhao.consumidos + 1;
    houveAlgo = true;
    if (tokens[idx] === "e") idx += 1;
  } else if (MILHAO.has(tokens[idx])) {
    total += 1_000_000;
    idx += 1;
    houveAlgo = true;
    if (tokens[idx] === "e") idx += 1;
  }

  // Milhares ("dois mil", "mil e duzentos", "mil duzentos")
  const grupoMil = lerGrupoCentena(tokens, idx);
  if (grupoMil.consumidos > 0 && tokens[idx + grupoMil.consumidos] === MIL) {
    total += grupoMil.valor * 1000;
    idx += grupoMil.consumidos + 1;
    houveAlgo = true;
    if (tokens[idx] === "e") idx += 1;
  } else if (tokens[idx] === MIL) {
    total += 1000;
    idx += 1;
    houveAlgo = true;
    if (tokens[idx] === "e") idx += 1;
  }

  // Resto (0-999)
  const grupoFinal = lerGrupoCentena(tokens, idx);
  if (grupoFinal.consumidos > 0) {
    total += grupoFinal.valor;
    idx += grupoFinal.consumidos;
    houveAlgo = true;
  }

  if (!houveAlgo || total <= 0) return null;
  return { valor: total, consumidos: idx - inicio };
}

/**
 * Procura um número escrito por extenso em `textoNormalizado` (minúsculo,
 * sem acento) e devolve o primeiro valor encontrado, ou undefined se não
 * achar nenhum. Não valida se é dinheiro — isso é responsabilidade de quem
 * chama (exigir "reais"/verbo financeiro por perto, como já se faz hoje pro
 * caso com dígito).
 */
const PALAVRAS_MOEDA = new Set(["reais", "real", "conto", "contos", "pila", "pilas"]);

// Acha o primeiro trecho de tokens que forma um número por extenso aceitável
// como valor (mesmo filtro anti-ambiguidade usado por valorPorExtenso — ver
// comentário lá). Compartilhado entre valorPorExtenso (só quer o valor) e
// removerValorPorExtenso (quer também tirar esse trecho da descrição).
function encontrarSpanValorPorExtenso(
  tokens: string[]
): { valor: number; inicio: number; fim: number } | null {
  for (let i = 0; i < tokens.length; i += 1) {
    if (!PALAVRAS_NUMERICAS_EXTENSO.has(tokens[i])) continue;
    // "um"/"uma" sozinho é ruído demais fora de contexto de milhar/milhão
    // (ex.: "comprei um pao" não é valor de R$1) — só aceita como valor
    // isolado quando for parte de "um mil"/"um milhão" (já tratado acima) ou
    // combinado com outro componente do número (nunca sozinho).
    if ((tokens[i] === "um" || tokens[i] === "uma") && tokens[i + 1] !== MIL && !MILHAO.has(tokens[i + 1])) {
      continue;
    }
    const resultado = lerNumeroApartir(tokens, i);
    if (!resultado) continue;

    // Número bare de um único dígito por extenso ("dois", "nove"...) é
    // ambíguo demais sozinho — bem mais chance de ser QUANTIDADE de item
    // ("comprei duas coca", "comprei tres paes") do que valor em dinheiro.
    // Só aceita esse caso específico (1 token, valor < 10) quando tiver uma
    // palavra de moeda colada antes ou depois ("dois reais", "nove conto").
    if (resultado.consumidos === 1 && resultado.valor < 10) {
      const antes = tokens[i - 1];
      const depois = tokens[i + 1];
      if (!PALAVRAS_MOEDA.has(antes) && !PALAVRAS_MOEDA.has(depois)) continue;
    }

    return { valor: resultado.valor, inicio: i, fim: i + resultado.consumidos };
  }
  return null;
}

export function valorPorExtenso(textoNormalizado: string): number | undefined {
  const tokens = textoNormalizado.split(/\s+/).filter(Boolean);
  return encontrarSpanValorPorExtenso(tokens)?.valor;
}

/**
 * Remove da descrição o mesmo trecho que valorPorExtenso usaria como valor
 * (ex.: "cem reais no mercado" → "no mercado", pra não sobrar "Cem Reais
 * Mercado" como descrição do lançamento). Se não achar nenhum valor por
 * extenso, devolve o texto original sem alteração. Também remove uma
 * eventual palavra de moeda ("reais"/"real"/"conto"...) colada logo depois.
 */
export function removerValorPorExtenso(textoNormalizado: string): string {
  const tokens = textoNormalizado.split(/\s+/).filter(Boolean);
  const span = encontrarSpanValorPorExtenso(tokens);
  if (!span) return textoNormalizado;

  let fim = span.fim;
  if (PALAVRAS_MOEDA.has(tokens[fim])) fim += 1;

  return [...tokens.slice(0, span.inicio), ...tokens.slice(fim)].join(" ");
}
