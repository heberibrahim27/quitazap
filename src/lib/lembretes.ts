// Regra pura dos lembretes de vencimento (D-3 / D-1 / D0) — sem banco, testável.
// Toda a aritmética de datas é em Brasília (a Vercel roda em UTC).
//
// Achados do QA de 2026-10-08 que esta regra resolve:
//  - dívida parcelada avisava o TOTAL restante e repetia todo mês no mesmo dia → agora avisa a
//    parcela que realmente vence na janela, com o valor dela;
//  - parcela ATRASADA e não marcada como paga bloqueava o aviso das parcelas seguintes
//    (o cron sempre pegava "a primeira pendente") → agora olha só as parcelas dentro da janela;
//  - a janela era comparada por número do dia do mês, então "dia 1" nunca era avisado em D-3 a
//    partir do dia 29 (virada de mês) → agora usa a próxima ocorrência real, com ajuste pra
//    mês curto (dia 31 em fevereiro vence dia 28).

import { anoMesDiaBrasil } from "./financeiro/fatura-cartao";

export interface DataBR {
  ano: number;
  mes: number;
  dia: number;
}

/** Janela de aviso em dias: hoje, amanhã e daqui a 3 dias. */
export const JANELA_AVISO = [0, 1, 3] as const;
export type DiasRestantes = (typeof JANELA_AVISO)[number];

const MS_DIA = 86_400_000;

function utc(d: DataBR): number {
  return Date.UTC(d.ano, d.mes - 1, d.dia);
}

export function diaBrasil(d: Date): DataBR {
  return anoMesDiaBrasil(d);
}

export function diasEntre(de: DataBR, ate: DataBR): number {
  return Math.round((utc(ate) - utc(de)) / MS_DIA);
}

export function somarDias(d: DataBR, n: number): DataBR {
  const t = new Date(utc(d) + n * MS_DIA);
  return { ano: t.getUTCFullYear(), mes: t.getUTCMonth() + 1, dia: t.getUTCDate() };
}

export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Próxima vez (hoje ou depois) em que cai o "dia X do mês", ajustando pra mês curto. */
export function proximaOcorrenciaDoDia(hoje: DataBR, diaVenc: number): DataBR {
  const esteMes = Math.min(diaVenc, ultimoDiaDoMes(hoje.ano, hoje.mes));
  if (esteMes >= hoje.dia) return { ano: hoje.ano, mes: hoje.mes, dia: esteMes };
  const proxAno = hoje.mes === 12 ? hoje.ano + 1 : hoje.ano;
  const proxMes = hoje.mes === 12 ? 1 : hoje.mes + 1;
  return { ano: proxAno, mes: proxMes, dia: Math.min(diaVenc, ultimoDiaDoMes(proxAno, proxMes)) };
}

/** Valores de `diaVencimento` que PODEM entrar na janela hoje — pra filtrar no banco sem varrer tudo. */
export function diasCandidatosDoMes(hoje: DataBR): number[] {
  const cand = new Set<number>();
  for (const off of JANELA_AVISO) {
    const alvo = somarDias(hoje, off);
    cand.add(alvo.dia);
    // dia 31 cadastrado vence no último dia de um mês curto
    if (alvo.dia === ultimoDiaDoMes(alvo.ano, alvo.mes)) for (let d = alvo.dia + 1; d <= 31; d++) cand.add(d);
  }
  return [...cand];
}

export interface DividaParaLembrete {
  diaVencimento: number | null;
  valorTotal: number;
  /** A dívida tem cronograma de parcelas (qualquer status). */
  temParcelas: boolean;
  /** Parcelas PENDENTES — o cron só precisa passar as que vencem na janela. */
  parcelasPendentes: { valor: number; vencimento: Date }[];
}

export interface AvisoVencimento {
  diasRestantes: DiasRestantes;
  valor: number;
  /** Dia do mês do vencimento, pra mensagem "(dia 10)". */
  dia: number;
}

export function avisoDeVencimento(d: DividaParaLembrete, agora: Date): AvisoVencimento | null {
  const hoje = diaBrasil(agora);

  if (d.temParcelas) {
    let melhor: (AvisoVencimento & { ordem: number }) | null = null;
    for (const p of d.parcelasPendentes) {
      const venc = diaBrasil(p.vencimento);
      const dias = diasEntre(hoje, venc);
      if (!(JANELA_AVISO as readonly number[]).includes(dias)) continue;
      if (!melhor || dias < melhor.ordem) melhor = { diasRestantes: dias as DiasRestantes, valor: p.valor, dia: venc.dia, ordem: dias };
    }
    return melhor ? { diasRestantes: melhor.diasRestantes, valor: melhor.valor, dia: melhor.dia } : null;
  }

  if (d.diaVencimento == null || d.diaVencimento < 1 || d.diaVencimento > 31) return null;
  const prox = proximaOcorrenciaDoDia(hoje, d.diaVencimento);
  const dias = diasEntre(hoje, prox);
  if (!(JANELA_AVISO as readonly number[]).includes(dias)) return null;
  return { diasRestantes: dias as DiasRestantes, valor: d.valorTotal, dia: prox.dia };
}
