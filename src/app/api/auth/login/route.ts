import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export async function POST(req: NextRequest) {
  const form = await req.formData();
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
    maxAge: 60 * 60 * 24 * 30, // 30 dias
    path: "/",
    // Cobre tanto quitazap.com.br quanto www.quitazap.com.br
    ...(process.env.NODE_ENV === "production"
      ? { domain: ".quitazap.com.br" }
      : {}),
  });

  return res;
}
