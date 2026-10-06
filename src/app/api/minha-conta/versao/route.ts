// GET /api/minha-conta/versao — "mudou alguma coisa nos meus dados?" (barato).
// O painel consulta isto a cada poucos segundos e só recarrega a tela pesada (router.refresh) quando o
// valor muda — antes recarregava tudo a cada 4s, o que, em conta com muitos contratos e parcelas,
// empilhava renders e deixava o app lento (achado do Ibrahim, 06/10/2026).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const [lanc, pag, dep] = await Promise.all([
    prisma.lancamento.aggregate({ where: { clienteId }, _max: { atualizadoEm: true }, _count: { _all: true } }),
    prisma.pagamento.aggregate({ where: { clienteId }, _max: { atualizadoEm: true }, _count: { _all: true } }),
    prisma.divida.aggregate({ where: { clienteId }, _max: { atualizadoEm: true }, _count: { _all: true } }),
  ]);

  const versao = [lanc, pag, dep]
    .map((a) => `${a._max.atualizadoEm?.getTime() ?? 0}:${a._count._all}`)
    .join("|");
  return NextResponse.json({ versao }, { headers: { "Cache-Control": "no-store" } });
}
