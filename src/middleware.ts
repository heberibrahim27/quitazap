import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rotas públicas
  // "/minha-conta" fica de fora da senha do admin de propósito: é a área do
  // cliente, com login próprio (link mágico por WhatsApp, cookie
  // qz_cliente_auth) verificado no layout de src/app/minha-conta/(protegido)
  // — não aqui no middleware, pra evitar depender de Node crypto no Edge
  // Runtime (middleware roda em Edge por padrão).
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/oferta") ||
    pathname.startsWith("/minha-conta") ||
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
