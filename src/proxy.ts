import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rotas públicas
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/oferta") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;

  if (cookie !== COOKIE_TOKEN) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
