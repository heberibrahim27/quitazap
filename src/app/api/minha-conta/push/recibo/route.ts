// ─────────────────────────────────────────
// QuitaZAP — Recibo de exibição do push de teste (diagnóstico temporário,
// ver PushTesteDiagnostico no schema e NotificacoesPush.tsx)
//
// POST: o service worker chama isso de dentro do handler "push" (fora do
// contexto de qualquer página aberta — é uma invocação serverless própria,
// sem acesso a cookie de sessão da aba, por isso não exige autenticação de
// cliente aqui — o testId em si (UUID aleatório, de uso único, criado no
// momento do teste) já funciona como a credencial). Só aceita escrever no
// registro que já existe com esse testId — nunca cria nada novo.
//
// GET: a página faz polling nisso depois de disparar o teste, esperando o
// service worker confirmar. Esse lado SIM exige o cliente autenticado, e
// só devolve o registro se pertencer a ele.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";

export async function POST(req: NextRequest) {
  let body: { testId?: string; exibiu?: boolean; erro?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const testId = typeof body.testId === "string" ? body.testId : null;
  if (!testId) return NextResponse.json({ error: "testId ausente." }, { status: 400 });

  await prisma.pushTesteDiagnostico
    .updateMany({
      where: { testId },
      data: {
        recebidoPeloSw: Boolean(body.exibiu),
        recebidoEm: new Date(),
        swErro: typeof body.erro === "string" ? body.erro.slice(0, 300) : null,
      },
    })
    .catch((err) => console.error("[PUSH-RECIBO] Erro ao gravar recibo:", err));

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const testId = req.nextUrl.searchParams.get("testId");
  if (!testId) return NextResponse.json({ error: "testId ausente." }, { status: 400 });

  const registro = await prisma.pushTesteDiagnostico.findUnique({ where: { testId } });
  if (!registro || registro.clienteId !== clienteId) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    recebidoPeloSw: registro.recebidoPeloSw,
    recebidoEm: registro.recebidoEm,
    swErro: registro.swErro,
  });
}
