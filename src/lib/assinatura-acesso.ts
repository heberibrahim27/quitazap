// Acesso ao APP (telas, chat, leitura de documentos) por assinatura em dia.
// Antes (achado no QA de pré-venda, 2026-10-08) só o WhatsApp bloqueava: quem pedia reembolso,
// cancelava ou deixava vencer continuava usando o app inteiro — e gastando crédito de IA.
// Os dados do cliente NUNCA são apagados ao vencer: renovar pela Cakto restaura o acesso na hora.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assinaturaVencida, MENSAGEM_ASSINATURA_VENCIDA } from "@/lib/assinatura-regra";

export { assinaturaVencida, MENSAGEM_ASSINATURA_VENCIDA };
export type { ClienteParaAssinatura } from "@/lib/assinatura-regra";

/** Para rotas de API do app: devolve 402 se a assinatura venceu; null se pode seguir. */
export async function respostaSeAssinaturaVencida(clienteId: string): Promise<NextResponse | null> {
  const c = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { gratuito: true, isTeste: true, assinaturaVenceEm: true },
  });
  if (c && assinaturaVencida(c)) {
    return NextResponse.json({ error: MENSAGEM_ASSINATURA_VENCIDA, assinaturaVencida: true }, { status: 402 });
  }
  return null;
}
