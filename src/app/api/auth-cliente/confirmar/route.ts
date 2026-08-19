// ─────────────────────────────────────────
// QuitaZAP Controle — Confirma o link de acesso enviado por WhatsApp
// POST /api/auth-cliente/confirmar   body: { token }
// De propósito é POST, não GET: um GET seria disparado sozinho por
// pré-visualização de link (WhatsApp Web, scanners de segurança, etc.),
// logando alguém sem ação real do usuário. POST só acontece quando a
// pessoa efetivamente clica no botão de confirmar em /minha-conta/entrar.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { verificarLinkAcessoCliente, criarSessaoCliente } from "@/lib/cliente-auth";
import { COOKIE_CLIENTE } from "@/lib/get-cliente";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "");
  const clienteId = token ? verificarLinkAcessoCliente(token) : null;

  if (!clienteId) {
    return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_CLIENTE, criarSessaoCliente(clienteId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
