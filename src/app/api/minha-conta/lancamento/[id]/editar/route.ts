import { NextRequest, NextResponse } from "next/server";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { editarLancamentoCard } from "@/lib/lancamento-card-service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const { id } = await params;
  const body = await req.json();

  if (!body.atualizadoEmVisto) {
    return NextResponse.json({ ok: false, erro: "atualizadoEmVisto é obrigatório (evita sobrescrever edição concorrente)." }, { status: 400 });
  }

  const mudancas: { descricao?: string; categoria?: string | null; valor?: number; data?: Date } = {};
  if (typeof body.descricao === "string") mudancas.descricao = body.descricao;
  if (body.categoria !== undefined) mudancas.categoria = body.categoria;
  if (typeof body.valor === "number") mudancas.valor = body.valor;
  if (typeof body.data === "string") mudancas.data = new Date(body.data);

  const resultado = await editarLancamentoCard({
    clienteId,
    lancamentoId: id,
    atualizadoEmVisto: new Date(body.atualizadoEmVisto),
    canal: "APP",
    mudancas,
  });

  if (!resultado.ok) return NextResponse.json({ ok: false, erro: resultado.erro }, { status: 409 });
  return NextResponse.json({ ok: true, lancamento: resultado.dado });
}
