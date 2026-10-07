// Leitura de PRINT de fatura de cartão (app do banco) pelo chat nativo e pelo WhatsApp.
// Mesmo contrato do PDF (FaturaCartaoDetectada) — o que muda é só a entrada:
// o resultado cai em montarFaturaCartaoPendente/salvarComprasParceladasFatura,
// sem mecanismo novo de parcelamento nem de deduplicação.

import type { CompraFatura, FaturaCartaoDetectada, ParceladaFatura } from "@/lib/fatura-cartao-flow";
import { interpretarEmprestimo, type EmprestimoDetectado } from "../emprestimo-imagem";

// Dia assumido quando o print só mostra o mês da fatura ("Novembro de 2026").
const DIA_VENCIMENTO_ESTIMADO = 10;

export const PROMPT_FATURA_IMAGEM = `Esta imagem é um PRINT de fatura de cartão de crédito (app de banco, ex.: Nubank, Inter, Itaú, C6). Pode ser longo e mostrar a fatura inteira. Leia linha por linha, do início ao fim, e responda APENAS com JSON (sem markdown):

{
  "tipo": "FATURA_CARTAO",
  "emissor": "nome popular do banco/cartão",
  "vencimentoFatura": "AAAA-MM-DD",
  "mesFatura": "AAAA-MM",
  "totalFatura": 1234.56,
  "compras": [
    { "descricao": "nome da compra/loja", "valor": 139.12, "data": "AAAA-MM-DD", "parcelaAtual": null, "totalParcelas": null }
  ],
  "parceladas": [
    { "descricao": "nome da compra/loja", "parcelaAtual": 1, "totalParcelas": 3, "valorParcela": 30.90 }
  ]
}

Regras:
- emissor: nome popular (ex.: "Nubank"), nunca razão social nem CNPJ. Se o nome não estiver escrito, deduza pelo visual do app (ex.: tema roxo com "Pagar" e filtros "Tudo/Cartões" = Nubank); só use null se realmente não souber.
- vencimentoFatura: data de VENCIMENTO da fatura (não a de fechamento), só se estiver impressa; senão null.
- mesFatura: mês de referência da fatura mostrado no topo (ex.: "Novembro de 2026" → "2026-11"); null se não aparecer.
- totalFatura: o total de compras do período se estiver impresso (não saldo anterior nem pagamento mínimo); null se não aparecer.
- compras: TODA linha de cobrança do print, uma por linha, sem pular nenhuma: compras à vista, parcelas (a linha do mês), IOF, Pix no crédito, assinaturas, tarifas. NÃO inclua pagamentos, estornos, créditos nem o total da fatura. Cada linha é independente, mesmo que o nome se repita.
  - valor: número positivo exatamente como impresso.
  - data: a data impressa na linha (ex.: "06 OUT") no formato AAAA-MM-DD. O ano é o mais provável: compras são sempre ANTERIORES ou iguais ao dia de hoje e próximas da fatura.
  - parcelaAtual: o X e totalParcelas: o Y de "Parcela X/Y" quando a linha é parcelada; null nos dois quando é à vista.
  - descricao: sem o texto da parcela (ex.: "Atacadao Atakarejo", nunca "Atacadao Atakarejo - Parcela 1/3").
- REGRA DE CONFERÊNCIA: toda compra parcelada listada em parceladas TAMBÉM deve aparecer em compras (a linha do mês dela), com a data impressa. Antes de responder, confira linha por linha: o número de linhas de cobrança do print deve ser igual ao tamanho de compras.
- parceladas: só as compras com parcelamento explicitamente impresso ("Parcela 1/3", "3x") em que ainda restam parcelas depois desta (Y maior que X). valorParcela = valor da linha. Nunca inclua à vista, última parcela (X igual a Y) nem parcelamento que você teria que adivinhar.
- Se não for fatura de cartão, ou não conseguir ler (vencimentoFatura ou mesFatura) com confiança, responda { "tipo": "OUTRO" }.

SE A IMAGEM FOR A TELA DE UM EMPRÉSTIMO (título com "valor restante", botões como "Pagar próxima parcela", e listas de parcelas pagas e agendadas), ignore tudo acima e responda APENAS com este JSON:

{
  "tipo": "EMPRESTIMO",
  "credor": "nome popular do banco (ex.: Nubank; deduza pelo visual do app se não estiver escrito)",
  "nome": "nome do contrato impresso (ex.: Dinheiro do negócio), ou null",
  "valorRestante": 1063.06,
  "parcelas": [
    { "numero": 1, "vencimento": "2026-09-24", "valor": 265.77, "paga": true },
    { "numero": 2, "vencimento": "2026-10-24", "valor": 265.77, "paga": false }
  ]
}

Regras do empréstimo: liste TODAS as parcelas visíveis (as da seção "parcelas pagas" com paga true e as "agendadas"/"a pagar" com paga false), uma por linha. numero = o ordinal impresso (1ª, 2ª...). vencimento no formato AAAA-MM-DD (ano completo como impresso). valor = número positivo. valorRestante = o valor total restante impresso no topo, ou null.`;

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

function mesIso(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

/** Interpreta a resposta JSON da visão. null = não é fatura legível. Itens
 * malformados são descartados um a um (nunca arrisca valor adivinhado). */
export type DocumentoImagemLido =
  | { tipo: "FATURA"; fatura: FaturaCartaoDetectada }
  | { tipo: "EMPRESTIMO"; emprestimo: EmprestimoDetectado }
  | null;

/** Decide entre fatura de cartão e empréstimo pelo "tipo" devolvido pela visão. */
export function interpretarDocumentoImagem(texto: string, emissorReserva?: string): DocumentoImagemLido {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
  } catch {
    return null;
  }
  if (bruto && typeof bruto === "object" && (bruto as Record<string, unknown>).tipo === "EMPRESTIMO") {
    const emprestimo = interpretarEmprestimo(bruto as Record<string, unknown>);
    return emprestimo ? { tipo: "EMPRESTIMO", emprestimo } : null;
  }
  const fatura = interpretarFaturaImagem(texto, emissorReserva);
  return fatura ? { tipo: "FATURA", fatura } : null;
}

export function interpretarFaturaImagem(texto: string, emissorReserva?: string): FaturaCartaoDetectada | null {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
  } catch {
    return null;
  }
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;
  if (r.tipo !== "FATURA_CARTAO") return null;

  const emissor = (typeof r.emissor === "string" ? r.emissor.trim() : "") || emissorReserva || "";
  let vencimentoFatura = dataIso(r.vencimentoFatura);
  let vencimentoEstimado = false;
  if (!vencimentoFatura) {
    const mes = mesIso(r.mesFatura);
    if (mes) {
      vencimentoFatura = `${mes}-${String(DIA_VENCIMENTO_ESTIMADO).padStart(2, "0")}`;
      vencimentoEstimado = true;
    }
  }
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
    parceladas.push({ descricao, parcelaAtual, totalParcelas, valorParcela });
  }

  const compras: CompraFatura[] = [];
  for (const item of Array.isArray(r.compras) ? r.compras : []) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const descricao = typeof c.descricao === "string" ? c.descricao.trim() : "";
    const valor = numero(c.valor);
    const data = dataIso(c.data);
    if (!descricao || valor == null || valor <= 0 || !data) continue;
    compras.push({ descricao, valor, data, parcelaAtual: numero(c.parcelaAtual) });
    // Parcelas futuras também saem da própria linha da compra ("X de Y"): não depende
    // de a IA repetir a compra em "parceladas".
    const atual = numero(c.parcelaAtual);
    const total = numero(c.totalParcelas);
    if (atual != null && total != null && Number.isInteger(atual) && Number.isInteger(total) && atual >= 1 && total > atual) {
      const ja = parceladas.some((p) => p.descricao.toLowerCase() === descricao.toLowerCase() && Math.abs(p.valorParcela - valor) < 0.02 && p.parcelaAtual === atual);
      if (!ja) parceladas.push({ descricao, parcelaAtual: atual, totalParcelas: total, valorParcela: valor });
    }
  }

  // Data da compra: só a 1ª parcela tem (a linha das demais mostra a data da
  // cobrança, não a da compra original — parcela 10/12 não foi comprada este mês).
  for (const p of parceladas) {
    if (p.parcelaAtual !== 1) continue;
    const linha = compras.find((c) => c.descricao.toLowerCase() === p.descricao.toLowerCase() && Math.abs(c.valor - p.valorParcela) < 0.02);
    if (linha) p.dataCompra = linha.data;
  }

  const totalBruto = numero(r.totalFatura);
  const totalImpresso = totalBruto != null && totalBruto > 0 ? Math.round(totalBruto * 100) / 100 : undefined;

  return { emissor, vencimentoFatura, ...(totalImpresso != null ? { totalImpresso } : {}), ...(vencimentoEstimado ? { vencimentoEstimado } : {}), parceladas, compras };
}
