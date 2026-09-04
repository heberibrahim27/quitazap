import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// "/api" fica fora da checagem do middleware.ts de propósito (webhooks
// públicos como Z-API/Cakto precisam responder sem cookie de admin) — o
// preço disso é que toda rota sob /api que expõe dado sensível precisa da
// própria checagem de autenticação, o que esta rota não tinha (achado de
// auditoria de segurança: expunha a base inteira de clientes/dívidas/
// parcelas/pagamentos pra qualquer requisição GET sem login). Mesmo
// cookie/token que o middleware exige pras rotas admin.
const COOKIE_NAME = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export async function GET(req: NextRequest) {
  if (req.cookies.get(COOKIE_NAME)?.value !== COOKIE_TOKEN) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const clientes = await prisma.cliente.findMany({
    include: {
      dividas: {
        include: {
          parcelas: true,
          pagamentos: true,
        },
      },
      planosEnviados: true,
    },
    orderBy: { criadoEm: "asc" },
  });

  const payload = {
    exportadoEm: new Date().toISOString(),
    versao: "1.0",
    totalClientes: clientes.length,
    clientes,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="quitazap-backup-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
