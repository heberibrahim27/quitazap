import { NextRequest, NextResponse } from "next/server";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { dividirLancamentoCard } from "@/lib/lancamento-card-service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const { id } = await params;
  const body = await req.json();

  const partes = Array.isArray(body.partes) ? body.partes : [];
  if (partes.length < 2) {
    return NextResponse.json({ ok: false, erro: "Envie ao menos 2 partes pra dividir." }, { status: 400 });
  }

  const resultado = await dividirLancamentoCard({
    clienteId,
    lancamentoId: id,
    canal: "APP",
    partes: partes.map((p: { descricao?: unknown; categoria?: unknown; valor?: unknown }) => ({
      descricao: String(p.descricao ?? ""),
      categoria: p.categoria != null ? String(p.categoria) : undefined,
      valor: Number(p.valor),
    })),
  });

  if (!resultado.ok) return NextResponse.json({ ok: false, erro: resultado.erro }, { status: 400 });
  return NextResponse.json({ ok: true, divisoes: resultado.dado });
}
