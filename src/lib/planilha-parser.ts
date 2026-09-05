import * as XLSX from "xlsx";

export type LinhaPlanilha = Record<string, string | number | boolean | null>;

export type MetricasPlanilha = {
  totalLinhas: number;
  colunas: string[];
  resumoNumerico: Record<string, { soma: number; media: number }>;
};

// Lê a primeira aba de um .csv/.xlsx/.xls (o `xlsx` detecta o formato pelo
// próprio conteúdo do buffer, não pela extensão) e devolve as linhas cruas
// mais um resumo numérico simples — soma/média de cada coluna cujo valor é
// número em pelo menos uma linha. Sem tentar adivinhar nomes de métrica
// específicas do Analytics: o resumo é genérico de propósito, já que cada
// planilha exportada tem colunas diferentes.
export function parsePlanilha(buffer: ArrayBuffer): { linhas: LinhaPlanilha[]; metricas: MetricasPlanilha } {
  const workbook = XLSX.read(buffer, { type: "array" });
  const primeiraAba = workbook.SheetNames[0];
  if (!primeiraAba) {
    return { linhas: [], metricas: { totalLinhas: 0, colunas: [], resumoNumerico: {} } };
  }

  const linhas = XLSX.utils.sheet_to_json<LinhaPlanilha>(workbook.Sheets[primeiraAba], { defval: null });
  const colunas = linhas.length > 0 ? Object.keys(linhas[0]) : [];

  const resumoNumerico: MetricasPlanilha["resumoNumerico"] = {};
  for (const coluna of colunas) {
    const valores = linhas
      .map((linha) => linha[coluna])
      .filter((v): v is number => typeof v === "number");
    if (valores.length === 0) continue;
    const soma = valores.reduce((acc, v) => acc + v, 0);
    resumoNumerico[coluna] = { soma, media: soma / valores.length };
  }

  return {
    linhas,
    metricas: { totalLinhas: linhas.length, colunas, resumoNumerico },
  };
}
