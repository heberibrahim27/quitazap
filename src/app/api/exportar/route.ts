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

  // Select explícito (não include/findMany sem select) — decisão de
  // escopo do admin (Ibrahim, 2026-09-05): o backup é só pra gestão de
  // conta/assinatura, nunca dado financeiro pessoal do cliente (renda,
  // despesas, dívidas negociadas) nem o hash de senha de acesso ao
  // /minha-conta (esse por segurança, não por privacidade financeira).
  const clientes = await prisma.cliente.findMany({
    select: {
      id: true,
      nome: true,
      telefone: true,
      cpf: true,
      email: true,
      obs: true,
      statusAtendimento: true,
      gratuito: true,
      assinaturaVenceEm: true,
      aceitaProativas: true,
      criadoEm: true,
      atualizadoEm: true,
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
