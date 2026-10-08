import { respostaSeAssinaturaVencida } from "@/lib/assinatura-acesso";
import { NextRequest, NextResponse } from "next/server";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { desfazerLancamentoCard } from "@/lib/lancamento-card-service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();
  // Assinatura vencida/reembolsada/cancelada: sem acesso (mesma regra do WhatsApp).
  const bloqueioAssinatura = await respostaSeAssinaturaVencida(clienteId);
  if (bloqueioAssinatura) return bloqueioAssinatura;

  const { id } = await params;

  const resultado = await desfazerLancamentoCard({ clienteId, lancamentoId: id, canal: "APP" });

  if (!resultado.ok) return NextResponse.json({ ok: false, erro: resultado.erro }, { status: 409 });
  return NextResponse.json({ ok: true });
}
