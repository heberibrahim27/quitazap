// ─────────────────────────────────────────
// QuitaZAP Controle — Primeiro acesso / redefinição de senha do cliente
// POST /api/auth-cliente/primeiro-acesso   body: { token, senha }
// O token vem do link mandado na boas-vindas (ver src/lib/primeiro-acesso.ts).
// Cria a senha e já deixa o cliente logado.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { criarSessaoCliente, hashSenhaCliente } from "@/lib/cliente-auth";
import { COOKIE_CLIENTE } from "@/lib/get-cliente";
import {
  clienteIdDoTokenPrimeiroAcesso,
  validarNovaSenha,
  verificarTokenPrimeiroAcesso,
} from "@/lib/primeiro-acesso";

const MENSAGENS: Record<string, string> = {
  invalido: "Link inválido. Peça um novo link de acesso.",
  expirado: "Esse link expirou. Peça um novo link de acesso.",
  "ja-usado": "Esse link já foi usado. Entre com seu telefone e senha.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "").trim();
  const senha = String(body?.senha ?? "");

  const erroSenha = validarNovaSenha(senha);
  if (erroSenha) return NextResponse.json({ error: erroSenha }, { status: 400 });

  const clienteId = clienteIdDoTokenPrimeiroAcesso(token);
  if (!clienteId) return NextResponse.json({ error: MENSAGENS.invalido }, { status: 400 });

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, senhaHash: true },
  });
  if (!cliente) return NextResponse.json({ error: MENSAGENS.invalido }, { status: 400 });

  const resultado = verificarTokenPrimeiroAcesso(token, cliente.id, cliente.senhaHash);
  if (resultado !== "ok") {
    return NextResponse.json({ error: MENSAGENS[resultado] }, { status: 400 });
  }

  // Só grava se a senha ainda é a mesma de quando o token foi validado —
  // dois envios simultâneos do mesmo link não conseguem ambos passar.
  const gravado = await prisma.cliente.updateMany({
    where: { id: cliente.id, senhaHash: cliente.senhaHash },
    data: { senhaHash: hashSenhaCliente(senha) },
  });
  if (gravado.count !== 1) {
    return NextResponse.json({ error: MENSAGENS["ja-usado"] }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_CLIENTE, criarSessaoCliente(cliente.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
