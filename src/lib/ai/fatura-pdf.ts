// Fatura de cartão lida de PDF (extrairPDF): normaliza pro mesmo contrato do print e do
// arquivo (FaturaCartaoDetectada, com TODAS as compras + parcelas futuras) e monta o
// pendente com deduplicação. Compartilhado por WhatsApp e chat nativo. Nunca grava nada.

import crypto from "crypto";
import { interpretarFaturaImagem } from "@/lib/ai/fatura-imagem";
import type { PDFFaturaCartao } from "@/lib/ai/extrair-pdf";
import { montarFaturaCartaoPendente, type FaturaCartaoPendente } from "@/lib/fatura-cartao-flow";

export async function pendenteDeFaturaPdf(
  clienteId: string,
  resultado: PDFFaturaCartao,
  bytes: Buffer
): Promise<FaturaCartaoPendente | null> {
  // O JSON do PDF tem o mesmo formato do print — o parser valida, descarta item
  // malformado e aceita só o mês da fatura quando o vencimento não está impresso.
  const fatura = interpretarFaturaImagem(JSON.stringify(resultado));
  if (!fatura) return null;
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  return montarFaturaCartaoPendente(clienteId, hash, fatura);
}
