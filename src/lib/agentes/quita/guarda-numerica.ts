// ─────────────────────────────────────────
// Guarda anti-alucinação numérica do agente Quita (parte pura)
// ─────────────────────────────────────────
// Regra (acordada com o ChatGPT, 04/10/2026): o LLM interpreta, escolhe
// ferramentas e redige — NUNCA calcula. Todo valor em R$, percentual, data
// e quantidade de dias que aparecer na resposta final precisa existir nas
// saídas das ferramentas (ou na mensagem do próprio cliente). Se não existir,
// a resposta do LLM é descartada e o texto determinístico das ferramentas
// vai no lugar. Soma/diferença/média feita pelo modelo não bate com nada
// que o backend devolveu, então é pega aqui.

export interface FatosNumericos {
  dinheiro: number[]; // em reais
  percentuais: number[];
  datas: string[]; // "dd/mm"
  dias: number[]; // "8 dias" e "dia 12"
}

function paraNumeroBR(texto: string): number {
  // "1.234,56" -> 1234.56 ; "1234,5" -> 1234.5 ; "1234" -> 1234
  const limpo = texto.replace(/\./g, "").replace(",", ".");
  return Number(limpo);
}

export function extrairFatos(texto: string): FatosNumericos {
  const fatos: FatosNumericos = { dinheiro: [], percentuais: [], datas: [], dias: [] };

  for (const m of texto.matchAll(/R\$\s*(-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|-?\d+(?:,\d{1,2})?)/g)) {
    const n = paraNumeroBR(m[1]);
    if (Number.isFinite(n)) fatos.dinheiro.push(Math.abs(n));
  }
  for (const m of texto.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)) {
    const n = Number(m[1].replace(",", "."));
    if (Number.isFinite(n)) fatos.percentuais.push(n);
  }
  for (const m of texto.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) {
    fatos.datas.push(`${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}`);
  }
  for (const m of texto.matchAll(/\b(\d{1,3})\s+dias?\b/gi)) fatos.dias.push(Number(m[1]));
  for (const m of texto.matchAll(/\bdia\s+(\d{1,2})\b/gi)) fatos.dias.push(Number(m[1]));
  return fatos;
}

export interface ResultadoGuarda {
  ok: boolean;
  violacoes: string[];
}

const mesmoValor = (a: number, b: number) => Math.abs(a - b) <= 0.011;

/**
 * `fontes`: textos em que o número PODE aparecer (saídas das ferramentas e a
 * mensagem atual do cliente). `resposta`: o texto redigido pelo LLM.
 */
export function validarResposta(resposta: string, fontes: string[]): ResultadoGuarda {
  const permitido: FatosNumericos = { dinheiro: [], percentuais: [], datas: [], dias: [] };
  for (const f of fontes) {
    const x = extrairFatos(f);
    permitido.dinheiro.push(...x.dinheiro);
    permitido.percentuais.push(...x.percentuais);
    permitido.datas.push(...x.datas);
    permitido.dias.push(...x.dias);
    // "12/10" também autoriza "dia 12" e vice-versa no sentido data -> dia
    for (const d of x.datas) permitido.dias.push(Number(d.slice(0, 2)));
  }

  const usado = extrairFatos(resposta);
  const violacoes: string[] = [];

  for (const v of usado.dinheiro) {
    if (!permitido.dinheiro.some((p) => mesmoValor(p, v))) violacoes.push(`valor R$ ${v}`);
  }
  for (const p of usado.percentuais) {
    // arredondamento do texto ("82%") contra o fato ("81,7%") é aceito
    if (!permitido.percentuais.some((q) => Math.round(q) === Math.round(p))) violacoes.push(`percentual ${p}%`);
  }
  for (const d of usado.datas) {
    if (!permitido.datas.includes(d)) violacoes.push(`data ${d}`);
  }
  for (const n of usado.dias) {
    // 0 e 1 ("hoje", "1 dia") são triviais demais pra exigir fonte
    if (n > 1 && !permitido.dias.includes(n)) violacoes.push(`${n} dias/dia ${n}`);
  }
  return { ok: violacoes.length === 0, violacoes };
}
