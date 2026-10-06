// Leitura de PRINT de fatura de cartão (app do banco) pelo chat nativo.
// Mesmo contrato do PDF (FaturaCartaoDetectada) — o que muda é só a entrada:
// o resultado cai em montarFaturaCartaoPendente/salvarComprasParceladasFatura,
// sem mecanismo novo de parcelamento nem de deduplicação.

import type { FaturaCartaoDetectada, ParceladaFatura } from "@/lib/fatura-cartao-flow";

export const PROMPT_FATURA_IMAGEM = `Esta imagem é um PRINT de fatura de cartão de crédito (app de banco, ex.: Nubank, Inter, Itaú, C6). Pode ser longo e mostrar a fatura inteira. Leia linha por linha, do início ao fim, e responda APENAS com JSON (sem markdown):

{
  "tipo": "FATURA_CARTAO",
  "emissor": "nome popular do banco/cartão",
  "vencimentoFatura": "AAAA-MM-DD",
  "parceladas": [
    { "descricao": "nome da compra/loja", "parcelaAtual": 3, "totalParcelas": 10, "valorParcela": 299.90, "dataCompra": "AAAA-MM-DD" }
  ]
}

Regras:
- emissor: nome popular (ex.: "Nubank"), nunca razão social nem CNPJ.
- vencimentoFatura: data de VENCIMENTO da fatura (não a de fechamento). Se o print mostrar só dia e mês, use o ano mais provável (a fatura vence logo depois das compras). Se não der pra saber com certeza, use null.
- parceladas: toda compra com parcelamento explicitamente impresso ("3/10", "parcela 3 de 10", "3x de ...") em que ainda restam parcelas (total maior que a atual). Nunca inclua compra à vista, última parcela (X igual a Y) nem parcelamento que você teria que adivinhar.
- Se a MESMA loja aparece em linhas diferentes com parcelamentos diferentes, trate cada linha como uma compra independente.
- descricao: sem o texto da parcela (ex.: "Magazine Luiza", nunca "Magazine Luiza 3/10").
- valorParcela: valor daquela parcela na fatura, sempre número.
- dataCompra: data da compra original impressa na linha (ex.: "12 AGO"), no formato AAAA-MM-DD. Se não estiver visível, use null.
- Se não for uma fatura de cartão, ou não conseguir ler emissor E vencimento com confiança, responda { "tipo": "OUTRO" }.`;

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const limpo = v.replace(/[^\d,.-]/g, "");
    const n = limpo.includes(",") ? parseFloat(limpo.replace(/\./g, "").replace(",", ".")) : parseFloat(limpo);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function dataIso(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return Number.isNaN(new Date(`${v}T12:00:00`).getTime()) ? null : v;
}

/** Interpreta a resposta JSON da visão. null = não é fatura legível. Itens
 * malformados são descartados um a um (nunca arrisca valor adivinhado). */
export function interpretarFaturaImagem(texto: string): FaturaCartaoDetectada | null {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
  } catch {
    return null;
  }
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;
  if (r.tipo !== "FATURA_CARTAO") return null;

  const emissor = typeof r.emissor === "string" ? r.emissor.trim() : "";
  const vencimentoFatura = dataIso(r.vencimentoFatura);
  if (!emissor || !vencimentoFatura) return null;

  const parceladas: ParceladaFatura[] = [];
  for (const item of Array.isArray(r.parceladas) ? r.parceladas : []) {
    if (!item || typeof item !== "object") continue;
    const i = item as Record<string, unknown>;
    const parcelaAtual = numero(i.parcelaAtual);
    const totalParcelas = numero(i.totalParcelas);
    const valorParcela = numero(i.valorParcela);
    const descricao = typeof i.descricao === "string" ? i.descricao.trim() : "";
    if (!descricao || parcelaAtual == null || totalParcelas == null || valorParcela == null) continue;
    const dataCompra = dataIso(i.dataCompra);
    parceladas.push({
      descricao,
      parcelaAtual,
      totalParcelas,
      valorParcela,
      ...(dataCompra ? { dataCompra } : {}),
    });
  }
  return { emissor, vencimentoFatura, parceladas };
}
