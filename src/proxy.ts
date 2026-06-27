import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rotas públicas — não precisam de login
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/oferta") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const senha = process.env.APP_SENHA || "quitazap2024";
  const cookie = req.cookies.get("qz_auth")?.value;

  if (cookie !== senha) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
