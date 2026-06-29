import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioId, erroNaoAutenticado } from "@/lib/get-usuario";

// PATCH /api/pendencias/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const usuarioId = getUsuarioId(req);
  if (!usuarioId) return erroNaoAutenticado();

  const { id } = params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  // Garante que a pendência pertence ao usuário logado
  const existente = await prisma.pendencia.findFirst({ where: { id, usuarioId } });
  if (!existente) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const {
    status, descricao, tipo, valor, vencimento,
    pixChave, mensagemCustom, enviarEm,
    confirmacaoManual, pagoEm, valorPago,
    reguaPausada,
  } = body;

  const pendencia = await prisma.pendencia.update({
    where: { id },
    data: {
      ...(status       !== undefined ? { status }       : {}),
      ...(descricao    !== undefined ? { descricao }    : {}),
      ...(tipo         !== undefined ? { tipo }         : {}),
      ...(valor        !== undefined ? { valor: Number(valor) } : {}),
      ...(vencimento   !== undefined ? { vencimento: new Date(vencimento) } : {}),
      ...(pixChave     !== undefined ? { pixChave }     : {}),
      ...(mensagemCustom !== undefined ? { mensagemCustom } : {}),
      ...(enviarEm     !== undefined ? { enviarEm: enviarEm ? new Date(enviarEm) : null } : {}),
      ...(confirmacaoManual !== undefined ? { confirmacaoManual } : {}),
      ...(pagoEm       !== undefined ? { pagoEm: pagoEm ? new Date(pagoEm) : null } : {}),
      ...(valorPago    !== undefined ? { valorPago: Number(valorPago) } : {}),
      ...(reguaPausada !== undefined ? { reguaPausada } : {}),
      atualizadoEm: new Date(),
    },
  });

  return NextResponse.json({ pendencia });
}

// DELETE /api/pendencias/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const usuarioId = getUsuarioId(req);
  if (!usuarioId) return erroNaoAutenticado();

  const { id } = params;
  const existente = await prisma.pendencia.findFirst({ where: { id, usuarioId } });
  if (!existente) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  await prisma.pendencia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
