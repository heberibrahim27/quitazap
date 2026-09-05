import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rotas públicas
  // "/" é a página de vendas do produto (pública, visitante sem login) —
  // o painel do fundador mudou pra "/painel" depois do login. "/oferta"
  // continua liberada só como redirecionamento pra "/" (link antigo).
  // "/minha-conta" fica de fora da senha do admin de propósito: é a área do
  // cliente, com login próprio (link mágico por WhatsApp, cookie
  // qz_cliente_auth) verificado no layout de src/app/minha-conta/(protegido)
  // — não aqui no middleware, pra evitar depender de Node crypto no Edge
  // Runtime (middleware roda em Edge por padrão).
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/oferta") ||
    pathname.startsWith("/minha-conta") ||
    // Política de Privacidade/Termos: linkada direto na landing (FAQ,
    // rodapé) pra qualquer visitante sem login nenhum — sem essa linha,
    // clicar nesse link redirecionava pro /login (bug real, pré-existente,
    // achado na validação final antes do merge pra main).
    pathname.startsWith("/privacidade") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    // Qualquer arquivo estático servido direto de /public (vídeos, imagens,
    // ícones, manifest, sw.js etc.) precisa ser público — sem essa checagem,
    // um visitante sem cookie de admin pedindo /videos/hero-loop.mp4 (ou
    // qualquer novo asset futuro) era redirecionado pro /login em vez de
    // receber o arquivo (bug real: o vídeo do Hero nunca carregava).
    /\.[a-zA-Z0-9]+$/.test(pathname)
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
