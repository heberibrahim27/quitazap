// Leitura de ARQUIVO de fatura de cartão (OFX e CSV) — porta de entrada determinística,
// sem IA. Traduz para o mesmo formato interno do print e do PDF (FaturaCartaoDetectada),
// que segue pro mesmo fluxo: prévia → confirmação → gasto no cartão + parcelas futuras.
//
// Princípios:
// - OFX é padrão aberto (STMTTRN/DTPOSTED/TRNAMT/MEMO) e vale pra qualquer banco.
// - CSV varia entre bancos: colunas são achadas pelo NOME do cabeçalho (com sinônimos),
//   separador, formato de data e de valor são detectados — nada de coluna fixa.
// - Não usa FITID: no OFX do Nubank o mesmo FITID aparece em transações diferentes.
// - Estrutura irreconhecível → null (quem chama decide o fallback), nunca adivinha.

import type { CompraFatura, FaturaCartaoDetectada, ParceladaFatura } from "@/lib/fatura-cartao-flow";

// Dia assumido quando o arquivo não informa o vencimento (mesmo palpite do print).
const DIA_VENCIMENTO_ESTIMADO = 10;

interface LinhaBruta {
  data: string; // YYYY-MM-DD
  descricao: string;
  /** Valor absoluto. */
  valor: number;
  /** true = pagamento/estorno/crédito (não é gasto). */
  credito: boolean;
}

export type FormatoArquivoFatura = "OFX" | "CSV";

// ── Decodificação ────────────────────────────────────────────────────────

/** UTF-8 quando válido; senão Windows-1252 (OFX antigo de banco brasileiro). */
export function decodificarTexto(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder("windows-1252").decode(bytes);
  }
  return texto.replace(/^﻿/, "");
}

export function detectarFormato(texto: string): FormatoArquivoFatura | null {
  const inicio = texto.slice(0, 2000);
  if (/OFXHEADER|<OFX>/i.test(inicio)) return "OFX";
  if (/<STMTTRN>/i.test(texto)) return "OFX";
  // CSV/TSV: precisa de pelo menos cabeçalho + 1 linha e algum separador.
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length >= 2 && /[,;\t]/.test(linhas[0])) return "CSV";
  return null;
}

// ── Utilidades ───────────────────────────────────────────────────────────

function dataIso(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const iso = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return Number.isNaN(new Date(`${iso}T12:00:00`).getTime()) ? null : iso;
}

function parseData(bruto: string): string | null {
  const t = bruto.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return dataIso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{4})(\d{2})(\d{2})/); // OFX: 20261006000000[-3:BRT]
  if (m) return dataIso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return dataIso(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) return dataIso(2000 + +m[3], +m[2], +m[1]);
  return null;
}

/** "12,50" · "- 2.815,88" · "R$ 1.234,56" · "-12.50" · "(30,00)" → número com sinal. */
export function parseValor(bruto: string): number | null {
  let t = bruto.trim().replace(/R\$|\s/g, "");
  if (!t) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (/^[-−–]/.test(t)) {
    negativo = true;
    t = t.slice(1);
  }
  if (!/^[\d.,]+$/.test(t)) return null;
  const ultimaVirgula = t.lastIndexOf(",");
  const ultimoPonto = t.lastIndexOf(".");
  let num: string;
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    num = ultimaVirgula > ultimoPonto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (ultimaVirgula >= 0) {
    num = t.replace(/\./g, "").replace(",", ".");
  } else {
    num = t;
  }
  const n = parseFloat(num);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

const DESCRICAO_NAO_E_GASTO = /^\s*(pagamento (recebido|efetuado|de fatura|da fatura|on[- ]?line)|estorno|reembolso|cr[eé]dito (de|em) )/i;

function decodificarEntidades(s: string): string {
  return s.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
}

// ── OFX ──────────────────────────────────────────────────────────────────

function campoOfx(bloco: string, tag: string): string | null {
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? decodificarEntidades(m[1].trim()) : null;
}

function lerLinhasOfx(texto: string): { linhas: LinhaBruta[]; org: string | null } {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) ?? [];
  const linhas: LinhaBruta[] = [];
  for (const b of blocos) {
    const data = parseData(campoOfx(b, "DTPOSTED") ?? "");
    const bruto = campoOfx(b, "TRNAMT");
    const valor = bruto == null ? null : parseValor(bruto.replace(/^\+/, ""));
    const descricao = (campoOfx(b, "MEMO") ?? campoOfx(b, "NAME") ?? "").trim();
    if (!data || valor == null || !descricao) continue;
    const tipo = (campoOfx(b, "TRNTYPE") ?? "").toUpperCase();
    // Cartão de crédito no padrão OFX: cobrança é DEBIT / valor negativo.
    const credito = tipo === "CREDIT" || tipo === "DEP" ? true : tipo === "DEBIT" ? false : valor > 0;
    linhas.push({ data, descricao, valor: Math.abs(valor), credito });
  }
  return { linhas, org: campoOfx(texto, "ORG") };
}

// ── CSV ──────────────────────────────────────────────────────────────────

function detectarSeparador(cabecalho: string): string {
  const cont = (c: string) => cabecalho.split(c).length - 1;
  const opcoes = [",", ";", "\t"].map((c) => [c, cont(c)] as const).sort((a, b) => b[1] - a[1]);
  return opcoes[0][0];
}

function parseCsv(texto: string, sep: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      campo = "";
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SINONIMOS = {
  data: ["date", "data", "data da compra", "data compra", "data lancamento", "data do lancamento", "dt", "data transacao"],
  descricao: ["title", "descricao", "estabelecimento", "lancamento", "historico", "memo", "name", "detalhes", "description", "local"],
  valor: ["amount", "valor", "valor r", "value", "valor brl", "valor da compra"],
};

function acharColuna(cabecalho: string[], sinonimos: string[]): number {
  const alvo = cabecalho.map(norm);
  for (const s of sinonimos) {
    const i = alvo.indexOf(s);
    if (i >= 0) return i;
  }
  // Prefixo ("valor (r$)" → "valor r"), nunca substring solta.
  for (const s of sinonimos) {
    const i = alvo.findIndex((c) => c.startsWith(s + " "));
    if (i >= 0) return i;
  }
  return -1;
}

function lerLinhasCsv(texto: string): LinhaBruta[] | null {
  const primeira = texto.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const tabela = parseCsv(texto, detectarSeparador(primeira));
  if (tabela.length < 2) return null;
  const [cab, ...corpo] = tabela;
  const iData = acharColuna(cab, SINONIMOS.data);
  const iDesc = acharColuna(cab, SINONIMOS.descricao);
  const iValor = acharColuna(cab, SINONIMOS.valor);
  if (iData < 0 || iDesc < 0 || iValor < 0) return null;

  const brutas: { data: string; descricao: string; valor: number }[] = [];
  for (const l of corpo) {
    const data = parseData(l[iData] ?? "");
    const valor = parseValor(l[iValor] ?? "");
    const descricao = (l[iDesc] ?? "").trim();
    if (!data || valor == null || !descricao) continue;
    brutas.push({ data, descricao, valor });
  }
  if (brutas.length === 0) return null;

  // Convenção de sinal muda entre bancos (Nubank: cobrança positiva, pagamento
  // negativo; outros, o inverso): o sinal da MAIORIA das linhas é cobrança.
  const positivas = brutas.filter((b) => b.valor > 0).length;
  const cobrancaPositiva = positivas >= brutas.length - positivas;
  return brutas.map((b) => ({
    data: b.data,
    descricao: b.descricao,
    valor: Math.abs(b.valor),
    credito: cobrancaPositiva ? b.valor < 0 : b.valor > 0,
  }));
}

// ── Parcelas, emissor, mês da fatura ─────────────────────────────────────

function separarParcela(descricao: string): { limpa: string; atual: number | null; total: number | null } {
  const explicita = descricao.match(/^(.*?)[\s-]*parcela\s+(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i);
  const solta = descricao.match(/^(.*?\S)\s+(\d{1,2})\/(\d{1,2})$/);
  const m = explicita ?? solta;
  if (m) {
    const atual = +m[2];
    const total = +m[3];
    if (atual >= 1 && total >= 2 && atual <= total && total <= 60) {
      return { limpa: m[1].replace(/[\s-]+$/, "").trim() || descricao, atual, total };
    }
  }
  return { limpa: descricao.trim(), atual: null, total: null };
}

const EMISSORES_POR_ORG: [RegExp, string][] = [
  [/nu pagamentos|nubank/i, "Nubank"],
  [/ita[uú]/i, "Itaú"],
  [/bradesco/i, "Bradesco"],
  [/santander/i, "Santander"],
  [/banco inter|\binter\b/i, "Inter"],
  [/c6/i, "C6 Bank"],
  [/caixa/i, "Caixa"],
  [/mercado pago/i, "Mercado Pago"],
];

function emissorDoArquivo(nomeArquivo: string, org: string | null): string | null {
  const prefixo = nomeArquivo.replace(/\.[^.]+$/, "").match(/^([A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,25}?)[_\- ]+\d{4}[-_]\d{2}/);
  if (prefixo) {
    const p = prefixo[1].trim();
    const conhecido = EMISSORES_POR_ORG.find(([re]) => re.test(p));
    return conhecido ? conhecido[1] : p;
  }
  if (org) {
    const conhecido = EMISSORES_POR_ORG.find(([re]) => re.test(org));
    if (conhecido) return conhecido[1];
  }
  return null;
}

/** "Nubank_2026-11-01.csv": o banco nomeia o arquivo pela data da fatura (vencimento). */
function vencimentoDoNome(nomeArquivo: string): { data: string | null; mes: string | null } {
  const m = nomeArquivo.match(/(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return { data: null, mes: null };
  const mes = `${m[1]}-${m[2]}`;
  const data = m[3] ? dataIso(+m[1], +m[2], +m[3]) : null;
  return { data, mes };
}

function proximoMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  const t = a * 12 + (m - 1) + 1;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

// ── API ──────────────────────────────────────────────────────────────────

export interface ArquivoFaturaLido {
  formato: FormatoArquivoFatura;
  /** null = nome do banco não identificável (quem chama usa o cartão do cliente). */
  fatura: Omit<FaturaCartaoDetectada, "emissor"> & { emissor: string | null };
}

/** Lê OFX/CSV de fatura. null = estrutura não reconhecida (nunca adivinha). */
export function lerArquivoFatura(nomeArquivo: string, bytes: Uint8Array): ArquivoFaturaLido | null {
  const texto = decodificarTexto(bytes);
  const formato = detectarFormato(texto);
  if (!formato) return null;

  let linhas: LinhaBruta[] | null;
  let org: string | null = null;
  if (formato === "OFX") {
    const r = lerLinhasOfx(texto);
    linhas = r.linhas;
    org = r.org;
  } else {
    linhas = lerLinhasCsv(texto);
  }
  if (!linhas || linhas.length === 0) return null;

  const compras: CompraFatura[] = [];
  const parceladas: ParceladaFatura[] = [];
  for (const l of linhas) {
    if (l.credito || DESCRICAO_NAO_E_GASTO.test(l.descricao) || l.valor <= 0) continue;
    const { limpa, atual, total } = separarParcela(l.descricao);
    compras.push({ descricao: limpa, valor: Math.round(l.valor * 100) / 100, data: l.data, parcelaAtual: atual });
    if (atual != null && total != null && atual < total) {
      parceladas.push({
        descricao: limpa,
        parcelaAtual: atual,
        totalParcelas: total,
        valorParcela: Math.round(l.valor * 100) / 100,
        ...(atual === 1 ? { dataCompra: l.data } : {}),
      });
    }
  }
  if (compras.length === 0) return null;

  const venc = vencimentoDoNome(nomeArquivo);
  let vencimentoFatura: string;
  let vencimentoEstimado = false;
  if (venc.data) {
    vencimentoFatura = venc.data;
  } else {
    const mes = venc.mes ?? proximoMes([...compras].sort((a, b) => b.data.localeCompare(a.data))[0].data.slice(0, 7));
    vencimentoFatura = `${mes}-${String(DIA_VENCIMENTO_ESTIMADO).padStart(2, "0")}`;
    vencimentoEstimado = true;
  }

  return {
    formato,
    fatura: {
      emissor: emissorDoArquivo(nomeArquivo, org),
      vencimentoFatura,
      ...(vencimentoEstimado ? { vencimentoEstimado } : {}),
      parceladas,
      compras,
    },
  };
}
