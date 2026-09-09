// POST /api/auth/login
// Login admin (fundador) via FormData com "senha"
import { NextRequest, NextResponse } from "next/server";
import { verificarSenhaAdmin } from "@/lib/admin-auth";

const COOKIE_NAME  = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Content-Type inválido." }, { status: 400 });
  }

  const form  = await req.formData();
  const senha = String(form.get("senha") || "");

  if (!(await verificarSenhaAdmin(senha))) {
    return NextResponse.redirect(new URL("/login?erro=1", req.url), 303);
  }

  const res = NextResponse.redirect(new URL("/painel", req.url), 303);
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
