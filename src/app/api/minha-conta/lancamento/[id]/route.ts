import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";

// GET — estado atual de um lançamento. Usado pelo card do chat pra
// revalidar contra o snapshot congelado em MensagemChat.dadosEstruturados
// ao montar (achado real do Ibrahim em produção, 2026-09-10: sem isso, um
// card de lançamento já desfeito/editado continuava aparecendo como se
// nada tivesse acontecido depois de recarregar a conversa).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const { id } = await params;
  const lancamento = await prisma.lancamento.findFirst({
    where: { id, clienteId },
    select: {
      id: true,
      tipo: true,
      descricao: true,
      categoria: true,
      valor: true,
      data: true,
      atualizadoEm: true,
      substituidoPorDivisao: true,
    },
  });

  if (!lancamento) return NextResponse.json({ existe: false });
  return NextResponse.json({ existe: true, lancamento });
}
