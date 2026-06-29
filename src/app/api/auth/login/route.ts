// POST /api/auth/login
// Suporta dois modos:
// 1. FormData com "senha" → login admin legado (mantém compatibilidade)
// 2. JSON com "email"+"senha" → login multi-tenant QuitaZAP Receber
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { criarToken } from "@/lib/auth-jwt";
import { compareSync } from "bcryptjs";

const COOKIE_NAME  = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // ── Modo legado (admin) ── FormData
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form  = await req.formData();
    const senha = String(form.get("senha") || "");
    const correta = process.env.APP_SENHA || "quitazap2024";

    if (senha !== correta) {
      return NextResponse.redirect(new URL("/login?erro=1", req.url), 303);
    }

    const res = NextResponse.redirect(new URL("/", req.url), 303);
    res.cookies.set(COOKIE_NAME, COOKIE_TOKEN, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      ...(process.env.NODE_ENV === "production" ? { domain: ".quitazap.com.br" } : {}),
    });
    return res;
  }

  // ── Modo novo (multi-tenant) ── JSON
  try {
    const { email, senha } = await req.json();

    if (!email || !senha) {
      return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!usuario || !compareSync(senha, usuario.senhaHash)) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    const token = criarToken(usuario.id);

    const res = NextResponse.json({
      ok: true,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, plano: usuario.plano },
    });

    res.cookies.set("qz-auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("[LOGIN]", err);
    return NextResponse.json({ error: "Erro interno ao fazer login." }, { status: 500 });
  }
}
