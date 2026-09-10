import { NextRequest, NextResponse } from "next/server";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { calcularGraficoCategoria, graficoEstaDesatualizado } from "@/lib/grafico-categoria-service";

// Compara o snapshot congelado (mostrado no chat) contra o recálculo
// agora — nunca atualiza o card sozinho, só avisa. Ver "fotografia" em
// docs/chat-nativo-arquitetura.md.
export async function POST(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const body = await req.json();
  const mapaCongelado = body?.mapaCongelado ?? {};

  const atual = await calcularGraficoCategoria(clienteId);
  const mapaAtual = atual?.mapaCompleto ?? {};

  return NextResponse.json({ desatualizado: graficoEstaDesatualizado(mapaCongelado, mapaAtual) });
}
