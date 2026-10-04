// ─────────────────────────────────────────
// Recorrência de lançamentos ("repete todo mês") — parte pura (sem banco)
// ─────────────────────────────────────────
// Achado em QA (04/10/2026): o formulário prometia "Recorrente (repete todo
// mês, ex: salário fixo)" mas `Lancamento.recorrente` só mudava um ícone —
// nada criava o lançamento do mês seguinte. A geração em si fica em
// recorrencia-service.ts; aqui só as contas de data e a decisão.

const FUSO = "America/Sao_Paulo";

/** Meio-dia em Brasília (15:00 UTC) — mesma âncora dos lançamentos web/seed,
 * que não troca de dia por diferença de fuso. */
const HORA_UTC_ANCORA = 15;

function componentesBrasil(data: Date): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(data)
    .split("-")
    .map(Number);
  return { ano, mes, dia };
}

function ultimoDiaDoMesCalendario(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Mesmo dia do mês seguinte, no calendário de Brasília. Dia 31 num mês de 30
 * dias cai no último dia ("clamp"). `diaOriginal` (quando conhecido) evita que
 * a cadeia fique presa no dia clampado (31 → 28 em fevereiro → 28 pra
 * sempre); quem gera a série passa o dia da primeira ocorrência.
 */
export function proximaOcorrenciaMensal(data: Date, diaOriginal?: number): Date {
  const { ano, mes, dia } = componentesBrasil(data);
  const alvoDia = diaOriginal ?? dia;
  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const diaFinal = Math.min(alvoDia, ultimoDiaDoMesCalendario(proxAno, proxMes));
  return new Date(Date.UTC(proxAno, proxMes - 1, diaFinal, HORA_UTC_ANCORA, 0, 0, 0));
}

/**
 * Dia-alvo da série a partir de um lançamento: quem cai no ÚLTIMO dia do mês
 * (28 a 31) é tratado como "último dia do mês" (31, que o clamp ajusta). Sem
 * isso, um lançamento do dia 31 viraria dia 28 pra sempre depois de fevereiro.
 */
export function diaAlvoDaSerie(data: Date): number {
  const { ano, mes, dia } = componentesBrasil(data);
  return dia >= 28 && dia === ultimoDiaDoMesCalendario(ano, mes) ? 31 : dia;
}

/** Início (00:00 em Brasília) do dia de `data`. */
function inicioDoDia(data: Date): number {
  const { ano, mes, dia } = componentesBrasil(data);
  return Date.UTC(ano, mes - 1, dia, 3, 0, 0, 0);
}

export interface DecisaoRecorrencia {
  /** A ocorrência ainda não chegou — não faz nada agora. */
  aguardar: boolean;
  /** Data da próxima ocorrência (sempre calculada). */
  proxima: Date;
}

/**
 * A ocorrência de um mês só é criada quando o DIA chega: um salário do dia 5
 * lançado em 1º/11 inflaria "Entradas" e o disponível antes de ser recebido.
 */
export function decidirRecorrencia(dataFonte: Date, agora: Date): DecisaoRecorrencia {
  const proxima = proximaOcorrenciaMensal(dataFonte, diaAlvoDaSerie(dataFonte));
  return { proxima, aguardar: inicioDoDia(proxima) > agora.getTime() };
}

/** Tipos que repetem. FATURA_FECHADA é só marcador; parcela/compra parcelada
 * nunca é recorrente (cada parcela já é um lançamento do seu mês). */
export const TIPOS_RECORRENTES = ["RECEITA", "DESPESA_FIXA", "DESPESA_VARIAVEL", "COMPRA_CARTAO"] as const;

/** Depósito/saque de meta (categoria "Metas") nunca se repete sozinho. */
export function podeRepetir(l: { tipo: string; categoria: string | null; descricao: string }): boolean {
  if (!(TIPOS_RECORRENTES as readonly string[]).includes(l.tipo)) return false;
  if (l.categoria === "Metas") return false;
  // "TV (2/3)" — parcela de compra parcelada (defesa extra; o formulário já
  // grava parcelas com recorrente=false).
  if (/\(\d+\/\d+\)\s*$/.test(l.descricao)) return false;
  return true;
}

export function normalizarDescricaoRecorrencia(descricao: string): string {
  return descricao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
