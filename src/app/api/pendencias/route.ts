import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioId, erroNaoAutenticado } from "@/lib/get-usuario";

// GET /api/pendencias?status=X,Y
export async function GET(req: NextRequest) {
  const usuarioId = getUsuarioId(req);
  if (!usuarioId) return erroNaoAutenticado();

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const statusList  = statusParam ? statusParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const pendencias = await prisma.pendencia.findMany({
    where: {
      usuarioId,
      ...(statusList.length > 0 ? { status: { in: statusList } } : {}),
    },
    orderBy: { vencimento: "asc" },
    include: {
      contato: { select: { nome: true, telefone: true } },
    },
  });

  return NextResponse.json({ pendencias });
}

// POST /api/pendencias — cria uma nova pendência
export async function POST(req: NextRequest) {
  const usuarioId = getUsuarioId(req);
  if (!usuarioId) return erroNaoAutenticado();

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const {
    contatoId, nomeManual, telefoneManual,
    descricao, tipo = "SERVICO", valor, vencimento,
    pixChave, mensagemCustom, enviarEm, status = "RASCUNHO",
  } = body;

  if (!valor || !vencimento) {
    return NextResponse.json({ error: "valor e vencimento são obrigatórios" }, { status: 400 });
  }

  let resolvedContatoId: string | null = contatoId ?? null;

  // Se não tem contatoId mas tem dados manuais, cria/upsert o contato
  if (!resolvedContatoId && nomeManual && telefoneManual) {
    const telefone = String(telefoneManual).replace(/\D/g, "");
    const contato = await prisma.contatoReceber.upsert({
      where: { usuarioId_telefone: { usuarioId, telefone } },
      update: { nome: nomeManual },
      create: { usuarioId, nome: nomeManual, telefone },
    });
    resolvedContatoId = contato.id;
  }

  if (!resolvedContatoId) {
    return NextResponse.json({ error: "Informe um contato ou nome/telefone" }, { status: 400 });
  }

  // Gera slug único para link de pagamento
  const linkSlug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const pendencia = await prisma.pendencia.create({
      data: {
        usuarioId,
        contatoId:      resolvedContatoId,
        descricao:      descricao || tipo,
        tipo,
        valor:          Number(valor),
        vencimento:     new Date(vencimento),
        pixChave:       pixChave       ?? null,
        mensagemCustom: mensagemCustom ?? null,
        enviarEm:       enviarEm ? new Date(enviarEm) : null,
        status,
        linkSlug,
        etapa:          0,
        tentativas:     0,
      },
    });
    return NextResponse.json({ pendencia }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao criar pendência";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
