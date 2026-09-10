// ─────────────────────────────────────────
// QuitaZAP — Listagem/busca de movimentações (chat nativo Fase 3)
// GET /api/minha-conta/movimentacoes?inicio=&fim=&categoria=&texto=&valorMin=&valorMax=
// Reaproveita listarMovimentacoes (mesma função canônica que
// /minha-conta/movimentacoes já usa) — filtros extras (categoria, texto,
// valor) aplicados em memória sobre o mesmo resultado, nunca uma query
// paralela. Serve tanto o painel "Ver lançamentos" do gráfico de
// categoria quanto a página de busca completa — mesma definição em
// qualquer lugar que isso for consumido.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { listarMovimentacoes } from "@/lib/movimentacoes-service";

export async function GET(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const { searchParams } = new URL(req.url);
  const inicioParam = searchParams.get("inicio");
  const fimParam = searchParams.get("fim");
  const categoria = searchParams.get("categoria");
  const texto = searchParams.get("texto")?.trim().toLowerCase();
  const valorMin = searchParams.get("valorMin");
  const valorMax = searchParams.get("valorMax");

  if (!inicioParam || !fimParam) {
    return NextResponse.json({ error: "Parâmetros 'inicio' e 'fim' são obrigatórios." }, { status: 400 });
  }
  const inicio = new Date(inicioParam);
  const fim = new Date(fimParam);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return NextResponse.json({ error: "Datas inválidas." }, { status: 400 });
  }

  let movimentacoes = await listarMovimentacoes({ clienteId, inicio, fim });

  if (categoria) movimentacoes = movimentacoes.filter((m) => m.categoria === categoria);
  if (texto) movimentacoes = movimentacoes.filter((m) => m.descricao.toLowerCase().includes(texto));
  if (valorMin) movimentacoes = movimentacoes.filter((m) => m.valor >= Number(valorMin));
  if (valorMax) movimentacoes = movimentacoes.filter((m) => m.valor <= Number(valorMax));

  return NextResponse.json({ movimentacoes });
}
