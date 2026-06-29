import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioId, erroNaoAutenticado } from "@/lib/get-usuario";

// GET /api/contatos — lista os contatos do usuário logado
export async function GET(req: NextRequest) {
  const usuarioId = getUsuarioId(req);
  if (!usuarioId) return erroNaoAutenticado();

  const contatos = await prisma.contatoReceber.findMany({
    where: { usuarioId },
    orderBy: { nome: "asc" },
    include: { pendencias: { select: { id: true } } },
  });

  return NextResponse.json({ contatos });
}

// POST /api/contatos — cria um novo contato
export async function POST(req: NextRequest) {
  const usuarioId = getUsuarioId(req);
  if (!usuarioId) return erroNaoAutenticado();

  const body = await req.json().catch(() => null);
  if (!body?.nome || !body?.telefone) {
    return NextResponse.json({ error: "nome e telefone são obrigatórios" }, { status: 400 });
  }

  const telefone = String(body.telefone).replace(/\D/g, "");

  try {
    const contato = await prisma.contatoReceber.upsert({
      where: { usuarioId_telefone: { usuarioId, telefone } },
      update: { nome: body.nome, email: body.email ?? null, obs: body.obs ?? null },
      create: {
        usuarioId,
        nome: body.nome,
        telefone,
        email:    body.email    ?? null,
        obs:      body.obs      ?? null,
        documento: body.documento ?? null,
      },
    });
    return NextResponse.json({ contato }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao criar contato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
