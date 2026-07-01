// QuitaZAP Controle: relatórios e diagnósticos só são enviados sob pedido do usuário.
// Mantemos esta rota para compatibilidade com agendamentos antigos, mas sem ação automática.

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const telefone = body?.telefone ?? "sem telefone";

  console.log(`[RESUMO] Sem ação automática para ${telefone}.`);

  return NextResponse.json({
    ok: true,
    msg: "relatorio somente sob pedido do usuario",
  });
}
