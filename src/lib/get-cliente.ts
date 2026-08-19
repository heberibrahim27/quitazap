// Helper para extrair o cliente autenticado em "Minha Conta"
// (Server Components usam getClienteIdAtual/getClienteAtual via cookies();
// API routes usam getClienteIdDaRequisicao via NextRequest.)
import { cache } from "react";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarSessaoCliente } from "@/lib/cliente-auth";
import { prisma } from "@/lib/prisma";

export const COOKIE_CLIENTE = "qz_cliente_auth";

export async function getClienteIdAtual(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_CLIENTE)?.value;
  if (!token) return null;
  return verificarSessaoCliente(token);
}

// cache() do React dedupe chamadas dentro da mesma requisição — o layout
// protegido e a página home chamam getClienteAtual() de forma independente,
// mas isso garante que só roda a verificação de cookie + consulta no banco
// uma vez por requisição, não duas.
export const getClienteAtual = cache(async () => {
  const clienteId = await getClienteIdAtual();
  if (!clienteId) return null;
  return prisma.cliente.findUnique({ where: { id: clienteId } });
});

export function getClienteIdDaRequisicao(req: NextRequest): string | null {
  const token = req.cookies.get(COOKIE_CLIENTE)?.value;
  if (!token) return null;
  return verificarSessaoCliente(token);
}

export function erroClienteNaoAutenticado() {
  return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
}
