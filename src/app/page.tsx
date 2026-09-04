// ─────────────────────────────────────────
// QuitaZAP — Landing Page de Vendas
// Rota: / (raiz do site — antes era /oferta, ver src/app/oferta/page.tsx
// pro redirecionamento mantido por compatibilidade)
// ─────────────────────────────────────────

import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { prisma } from "@/lib/prisma";
import { ScrollReveal } from "./ScrollReveal";
import { CountUp } from "./CountUp";
import { CountdownTimer } from "./CountdownTimer";

// Inter nunca foi de fato carregada nesta página (o fontFamily só citava
// o nome, sem @font-face nem next/font) — sempre caiu pro fallback
// (Segoe UI/Arial) em qualquer sistema sem Inter instalada. Corrigido
// aqui via next/font (auto-hospedado, sem request externo) e aproveitado
// pra trazer as duas fontes da identidade "Hero Ousado" (serifada
// itálica pros acentos, mono pros rótulos) — escopado só a esta página,
// não mexe na tipografia do resto do produto logado.
const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], weight: ["300", "500", "600"], variable: "--font-fraunces" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-mono" });

// Textura de grain sutil (SVG de ruído em data-URI) — mesmo recurso visto
// nas referências de design (Aura Build) pra tirar a sensação de fundo
// chapado/genérico. Opacidade bem baixa, fixed, não intercepta clique.
const GRAIN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

// Grid assimétrico de 12 colunas + reveal on-scroll — CSS puro porque
// estilo inline não faz media query; classes com prefixo qz- pra não
// colidir com nada do resto do app (essa página não compartilha layout
// com o produto logado). Stagger de cards usa --qz-delay setado inline.
const LANDING_CSS = `
  .qz-reveal { opacity: 0; transform: translateY(28px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); transition-delay: var(--qz-delay, 0ms); }
  .qz-reveal.qz-visible { opacity: 1; transform: none; }
  .qz-grid12 { display: grid; grid-template-columns: 1fr; gap: 28px; }
  .qz-hero-pad { padding-left: 24px; padding-right: 24px; }
  .qz-hero-light { font-size: 48px; }
  .qz-hero-heavy { font-size: 72px; line-height: 0.95; }
  .qz-section { padding: 64px 24px; }
  .qz-h2-sm { font-size: 24px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.25; }
  .qz-h2-md { font-size: 28px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.2; }
  .qz-h2-lg { font-size: 32px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; }
  .qz-phone-mock { display: none; }
  .qz-phone-mock-inner {
    position: relative; width: 100%; height: 100%; border-radius: 38px;
    background: #0a0a0a; overflow: hidden; border: 1px solid #000;
  }
  .qz-phone-notch-band {
    position: absolute; top: 0; left: 0; right: 0; height: 24px; z-index: 2;
    display: flex; justify-content: center;
  }
  .qz-phone-notch { width: 33%; height: 100%; border-radius: 0 0 12px 12px; background: #000; }
  .qz-panel-phone { width: 200px; height: 412px; margin: 0 auto; border-radius: 30px; padding: 2px; background: linear-gradient(160deg, rgba(255,255,255,.5), rgba(255,255,255,.05)); box-shadow: 0 30px 60px -20px rgba(15,23,42,.35); }
  .qz-hero-side { margin-top: 8px; }
  .qz-feat-img { aspect-ratio: 16 / 9; }
  .qz-price-card { padding: 28px 22px; }
  @media (min-width: 768px) {
    .qz-grid12 { grid-template-columns: repeat(12, 1fr); gap: 40px; }
    .qz-col-4 { grid-column: span 4; }
    .qz-col-5 { grid-column: span 5; }
    .qz-col-6 { grid-column: span 6; }
    .qz-col-7 { grid-column: span 7; }
    .qz-col-8 { grid-column: span 8; }
    .qz-hero-pad { padding-left: 48px; padding-right: 48px; }
    .qz-hero-light { font-size: 72px; }
    .qz-hero-heavy { font-size: 128px; margin-top: -16px; }
    .qz-section { padding: 96px 48px; }
    .qz-h2-sm { font-size: 30px; }
    .qz-h2-md { font-size: 36px; }
    .qz-h2-lg { font-size: 48px; }
    .qz-hero-side { margin-top: 32px; }
    .qz-panel-phone { width: 240px; height: 494px; border-radius: 34px; margin: 0; }
    .qz-feat-img { aspect-ratio: 4 / 3; }
    .qz-price-card { padding: 40px 36px; }
  }
  @media (min-width: 1280px) {
    .qz-phone-mock {
      display: block; position: absolute; top: 40px; right: 48px;
      width: 280px; height: 580px; border-radius: 40px; padding: 2px;
      background: linear-gradient(160deg, rgba(255,255,255,0.6), rgba(255,255,255,0.05));
      box-shadow: 0 60px 100px -30px rgba(15,23,42,0.35), 0 20px 40px -15px rgba(15,23,42,0.2);
    }
  }
`;

// Contador de vagas do Preço Fundador é lido do banco a cada request —
// nunca pode ser congelado no build (teria que ser "force-dynamic" mesmo
// se essa fosse a única razão nesta página).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CAKTO_URL = process.env.NEXT_PUBLIC_CAKTO_URL ?? "#";
const VAGAS_FUNDADOR = 1000;

// Mesmo contato/link de suporte usado em /privacidade — WhatsApp oficial
// do QuitaZap já usado em outras telas do produto (dashboard/plano).
const CONTATO_SUPORTE_LINK = process.env.NEXT_PUBLIC_SUPORTE_LINK || "https://wa.me/5571993085436";

// Redes sociais: só aparece no rodapé quando a env var correspondente
// estiver configurada — dá o mesmo efeito de "ativar/desativar" sem
// precisar de painel de admin ainda (fica pro backlog).
const REDES_SOCIAIS = [
  { nome: "Instagram", url: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM },
  { nome: "WhatsApp", url: process.env.NEXT_PUBLIC_SOCIAL_WHATSAPP || CONTATO_SUPORTE_LINK },
  { nome: "Facebook", url: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK },
  { nome: "TikTok", url: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK },
].filter((r): r is { nome: string; url: string } => Boolean(r.url));

export const metadata = {
  title: "QuitaZAP — Descubra quanto do seu dinheiro ainda é seu",
  description:
    "Controle seus gastos pelo WhatsApp, entenda suas contas e dívidas, e pergunte ao QuitaZap antes de gastar. A partir de R$14,90/mês.",
  openGraph: {
    title: "QuitaZAP — Descubra quanto do seu dinheiro ainda é seu",
    description: "Controle seus gastos, dívidas e contas direto no WhatsApp.",
    type: "website",
  },
};

const doresMinicards = [
  { icone: "💳", titulo: "Cartão de crédito", texto: "A fatura sobe e você não sabe onde foi." },
  { icone: "📄", titulo: "Contas fixas", texto: "Água, luz, aluguel — tudo saindo ao mesmo tempo." },
  { icone: "🏦", titulo: "Empréstimos e consignado", texto: "Parcelas que descontam antes de você ver o dinheiro." },
  { icone: "🧾", titulo: "Gastos do dia a dia", texto: "Pequenos gastos que somam mais do que parece." },
];

const comoFunciona = [
  { numero: 1, titulo: "Informe sua renda pelo WhatsApp — ou envie seu contracheque, se tiver." },
  { numero: 2, titulo: "Registre seus gastos conversando com o QuitaZap." },
  { numero: 3, titulo: "Veja quanto do seu dinheiro está realmente livre — e pergunte “posso gastar R$300 hoje?” antes de gastar." },
];

const funcionalidades = [
  { titulo: "Raio-X do Salário", texto: "Entenda de onde vem e pra onde vai cada real do seu contracheque." },
  { titulo: "Salário Livre", texto: "Saiba exatamente quanto sobra até o próximo pagamento." },
  { titulo: "Analista pelo WhatsApp", texto: "Pergunte qualquer coisa sobre suas finanças, na hora." },
  { titulo: "Modo Apertou", texto: "Um aviso claro quando dias apertados estão chegando." },
  { titulo: "Simulador de Parcelas", texto: "Descubra se uma parcela nova cabe nos seus próximos pagamentos." },
  { titulo: "Dívidas e Consignados", texto: "Organize tudo num só lugar e veja o caminho pra ficar livre delas." },
];

const faq = [
  {
    p: "Preciso conectar minha conta bancária?",
    r: "Não. Você começa direto pelo WhatsApp e pelo seu contracheque — sem conectar conta bancária, sem Open Finance. As informações vêm do que você mesmo registra ou envia.",
  },
  {
    p: "Como funciona o Raio-X do contracheque?",
    r: "Você envia uma foto ou PDF do seu contracheque (ou informa sua renda) pelo WhatsApp, e o QuitaZap identifica salário, descontos e consignados pra te mostrar quanto realmente sobra.",
  },
  {
    p: "O QuitaZap paga ou movimenta meu dinheiro?",
    r: "Não. O QuitaZap não acessa sua conta bancária nem movimenta ou paga nada por você — ele só organiza as informações que você registra e ajuda você a entender sua situação financeira. Os pagamentos continuam sendo feitos por você, do seu jeito de sempre.",
  },
  {
    p: "Meus dados ficam seguros?",
    r: "Sim. Seus dados são usados só pra calcular suas informações financeiras e gerar suas análises — não vendemos seus dados pessoais ou financeiros pra ninguém. Você pode pedir a exclusão da sua conta e dos seus dados quando quiser. Veja todos os detalhes na nossa Política de Privacidade.",
  },
  {
    p: "Posso cancelar quando quiser?",
    r: "Sim, a qualquer momento, sem multa e sem burocracia. Seu acesso continua até o fim do período já pago.",
  },
  {
    p: "O preço vai aumentar pra quem já assinou?",
    r: "Não. Enquanto sua assinatura estiver ativa, o valor de R$14,90/mês não muda. O reajuste vale só pra quem assinar depois que as 1.000 vagas desta condição se esgotarem.",
  },
  {
    p: "Por que confiar em mais um app financeiro?",
    r: "Porque o QuitaZap mostra de onde vêm os números. As análises são baseadas nos dados que você registra e servem para te ajudar a entender melhor sua situação — sem promessa milagrosa e sem esconder informação atrás de um score misterioso.",
  },
  {
    p: "Funciona com qualquer banco?",
    r: "Sim. Como você não precisa conectar sua conta bancária, pode usar o QuitaZap independentemente do banco que utiliza. Cartões, gastos, receitas, dívidas e outros compromissos podem ser registrados normalmente.",
  },
  {
    p: "Funciona em qualquer WhatsApp?",
    r: "Sim. Você usa o WhatsApp normalmente para registrar gastos, receitas e fazer consultas ao QuitaZap. Não precisa instalar outro aplicativo de mensagens.",
  },
];

const WHATSAPP_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652C8.051 23.08 9.993 23.56 12 23.56h.008c6.572 0 11.92-5.334 11.928-11.894 0-3.174-1.25-6.16-3.42-8.217M12.045 21.58h-.007c-1.784 0-3.532-.48-5.057-1.38l-.363-.215-3.76.985 1.006-3.654-.237-.374a9.814 9.814 0 0 1-1.51-5.26c.001-5.45 4.452-9.878 9.92-9.878 2.648 0 5.135 1.03 7.007 2.9a9.836 9.836 0 0 1 2.907 6.988c-.002 5.45-4.455 9.888-9.906 9.888" fill="white"/>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.031-.967-.272-.099-.47-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.668-1.612-.916-2.207-.241-.579-.486-.5-.668-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" fill="white"/>
  </svg>
);

const ICONES_REDE: Record<string, React.ReactNode> = {
  Instagram: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
  ),
  WhatsApp: <span style={{ display: "inline-flex" }}>{WHATSAPP_ICON}</span>,
  Facebook: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.88v-6.99H7.9V12h2.5V9.8c0-2.48 1.48-3.85 3.74-3.85 1.08 0 2.21.2 2.21.2v2.43h-1.25c-1.23 0-1.61.76-1.61 1.55V12h2.75l-.44 2.89h-2.31v6.99A10 10 0 0 0 22 12z" /></svg>
  ),
  TikTok: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82c-.9-.98-1.4-2.26-1.4-3.62h-3.15v13.44a2.7 2.7 0 1 1-1.9-2.58V9.9a5.85 5.85 0 1 0 5.05 5.79V9.5a7.9 7.9 0 0 0 4.6 1.47V7.83a4.83 4.83 0 0 1-3.2-2.01z" /></svg>
  ),
};

export default async function LandingPage() {
  let assinantesFundador = 0;
  try {
    assinantesFundador = await prisma.cliente.count({ where: { gratuito: false } });
  } catch {
    // Landing nunca pode cair por causa de uma falha de contagem — segue
    // com 0 (mostra "1.000 vagas ainda disponíveis") em vez de derrubar a
    // página inteira.
  }
  // Contador regressivo (vagas ainda disponíveis, não "vaga número X") —
  // pedido explícito: a mecânica de urgência é sobre quantas restam, não
  // sobre implicar que já existem 1.000+ assinantes reais.
  const vagasRestantes = Math.max(VAGAS_FUNDADOR - assinantesFundador, 0);

  return (
    <div className={`${inter.variable} ${fraunces.variable} ${mono.variable}`} style={{ background: "#ffffff", minHeight: "100vh", fontFamily: "var(--font-inter), 'Segoe UI', Arial, sans-serif", color: "#0a0a0a", overflowX: "hidden", position: "relative" }}>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <ScrollReveal />

      {/* Grain sutil por cima de tudo — puramente decorativo, não intercepta clique. */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 40, pointerEvents: "none",
        backgroundImage: `url("${GRAIN_SVG}")`, opacity: 0.045,
      }} />

      {/* ══════════════════════════════════════ */}
      {/* HERO — porte fiel do export Aura Build (Bloomava) que o Ibrahim
          mandou como referência. Mesma estrutura/escala exata (grid-cols-12,
          col-span-8/4, text-5xl→9xl, font-extralight→semibold, tracking-
          tighter, leading-none, breakpoint md=768px), conteúdo adaptado pro
          QuitaZap. Valores em px/rem abaixo são a tradução literal das
          classes Tailwind do arquivo de referência — não são invenção. */}
      {/* ══════════════════════════════════════ */}
      <section style={{ position: "relative", overflow: "hidden", minHeight: 640 }} className="qz-hero">
        {/* Gradiente de marca como poster — cobre o instante antes do vídeo
            decodificar o primeiro frame (e o fallback se autoplay falhar). */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          background: "linear-gradient(160deg, #020d06 0%, #041a0c 50%, #0a2e18 100%)",
        }} />
        <div style={{
          position: "absolute", inset: 0, zIndex: 0, opacity: 0.06,
          backgroundImage: "linear-gradient(#22e07a 1px, transparent 1px), linear-gradient(90deg, #22e07a 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />
        <video
          autoPlay
          muted
          loop
          playsInline
          style={{ position: "absolute", inset: 0, zIndex: 0, width: "100%", height: "100%", objectFit: "cover" }}
        >
          <source src="/videos/hero-loop.mp4" type="video/mp4" />
        </video>
        {/* Overlay 1 — bg-neutral-900/50 mix-blend-multiply na referência */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "rgba(0,0,0,0.5)", mixBlendMode: "multiply" }} />
        {/* Overlay 2 — bg-gradient-to-b from-neutral-900/60 via-transparent to-neutral-900/90 */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent, rgba(0,0,0,0.9))",
        }} />

        {/* header — px-6 md:px-12 py-8 */}
        <header style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "32px 24px" }} className="qz-hero-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-q-icon.png" alt="" style={{ height: 34, width: "auto", display: "block" }} />
            <span style={{ color: "#fff", fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>QuitaZap</span>
          </div>
          <a href="/minha-conta/entrar" style={{ color: "#fff", fontSize: 14, fontWeight: 500, textDecoration: "none", opacity: 0.85, display: "inline-block", padding: "12px 4px" }}>
            Já sou cliente
          </a>
        </header>

        {/* grid grid-cols-1 md:grid-cols-12 gap-8 items-end — px-6 md:px-12 pb-12 md:pb-24 */}
        <div className="qz-grid12 qz-hero-pad" style={{ position: "relative", zIndex: 10, padding: "0 24px 48px", alignItems: "end" }}>
          <div className="qz-col-7">
            <p className="qz-reveal" style={{
              margin: "0 0 20px", fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600,
              color: "#22e07a", letterSpacing: "0.14em", textTransform: "uppercase",
            }}>
              Controle financeiro pelo WhatsApp
            </p>
            <h1 style={{ margin: 0, color: "#fff", lineHeight: 1, letterSpacing: "-0.05em" }}>
              <span className="qz-reveal qz-hero-light" style={{ display: "block", fontWeight: 200, opacity: 0.8, marginBottom: 8, "--qz-delay": "60ms" } as React.CSSProperties}>
                Descubra quanto do seu dinheiro
              </span>
              <span className="qz-reveal qz-hero-heavy" style={{ display: "block", fontWeight: 600, marginLeft: -2, "--qz-delay": "120ms" } as React.CSSProperties}>
                ainda é <span style={{ color: "#22e07a", fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontWeight: 500 }}>seu.</span>
              </span>
            </h1>
          </div>

          <div className="qz-col-5 qz-hero-side" style={{ color: "#fff" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 400, letterSpacing: "-0.025em" }} className="qz-reveal">
              Direto no WhatsApp.
            </h2>
            <p className="qz-reveal" style={{ margin: "0 0 32px", fontSize: 14, opacity: 0.8, maxWidth: 380, fontWeight: 300, lineHeight: 1.6 }}>
              Controle seus gastos, entenda suas contas e dívidas, e pergunte ao QuitaZap antes de gastar — sem conectar conta bancária.
            </p>
            <a href={CAKTO_URL} className="qz-reveal" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              borderRadius: 999, padding: "13px 26px", fontSize: 14, fontWeight: 600,
              background: "#22e07a", color: "#000", textDecoration: "none",
            }}>
              Quero garantir R$14,90/mês
            </a>
          </div>
        </div>

        {/* Transição em degradê pro branco da seção seguinte — evita o corte
            seco entre o hero escuro e o fundo claro logo abaixo. */}
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: 120,
          background: "linear-gradient(to bottom, transparent, #ffffff)",
          pointerEvents: "none",
        }} />
      </section>

      {/* ══════════════════════════════════════ */}
      {/* SEÇÃO DOR — vem antes da prova numérica de propósito: primeiro
          agita o problema em palavras, só depois mostra o número frio
          como prova concreta (ordem sugerida pelo Ibrahim/ChatGPT). */}
      {/* ══════════════════════════════════════ */}
      <section className="qz-section" style={{ background: "#ffffff" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div className="qz-grid12" style={{ marginBottom: 40 }}>
            <div className="qz-col-7 qz-reveal">
              <h2 className="qz-h2-sm" style={{ margin: 0, color: "#0f172a", textAlign: "left" }}>
                Muita gente recebe o dinheiro do mês e, quando vê, quase tudo já foi em cartão, contas e dívidas — e no fim do mês nem sabe direito onde o dinheiro foi.
              </h2>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
            {doresMinicards.map((d, i) => (
              <div key={d.titulo} className="qz-reveal" style={{
                background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14,
                padding: "22px 16px", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8,
                "--qz-delay": `${i * 70}ms`,
              } as React.CSSProperties}>
                <span style={{ fontSize: 28 }}>{d.icone}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{d.titulo}</span>
                <span style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.4 }}>{d.texto}</span>
              </div>
            ))}
          </div>

          {/* Prova numérica (exemplo ilustrativo) — logo abaixo da dor,
              como evidência concreta do que acabou de ser descrito. */}
          <div className="qz-reveal" style={{ maxWidth: 780, margin: "40px auto 0", "--qz-delay": "280ms" } as React.CSSProperties}>
            <div style={{
              background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16,
              padding: "28px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20,
            }}>
              {[
                { label: "Renda líquida", valor: 5820, cor: "#0f172a" },
                { label: "Contas e dívidas", valor: 4190, cor: "#ef4444" },
                { label: "Realmente livre", valor: 1630, cor: "#16a34a" },
              ].map((item) => (
                <div key={item.label} style={{ textAlign: "center" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 12.5, color: "#64748b", fontWeight: 600 }}>{item.label}</p>
                  <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: item.cor, letterSpacing: "-0.5px" }}>
                    <CountUp valor={item.valor} />
                  </p>
                </div>
              ))}
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 11.5, color: "#94a3b8", textAlign: "center" }}>
              Exemplo ilustrativo — os números do seu caso vêm do que você registrar no QuitaZap.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* COMO FUNCIONA */}
      {/* ══════════════════════════════════════ */}
      <section id="como-funciona" className="qz-section" style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div className="qz-grid12" style={{ marginBottom: 48 }}>
            <div className="qz-col-6 qz-reveal">
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "#22e07a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>COMO FUNCIONA</p>
              <h2 className="qz-h2-md" style={{ margin: 0, color: "#0f172a", textAlign: "left" }}>
                Simples assim, direto no WhatsApp.
              </h2>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
            {comoFunciona.map((passo, i) => (
              <div key={passo.numero} className="qz-reveal" style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "28px 24px",
                "--qz-delay": `${i * 90}ms`,
              } as React.CSSProperties}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: "#22e07a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 16, color: "#000", marginBottom: 16,
                }}>
                  {passo.numero}
                </div>
                <p style={{ margin: 0, fontSize: 15, color: "#374151", lineHeight: 1.55, fontWeight: 500 }}>{passo.titulo}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* WHATSAPP + PAINEL — prova de que existe um produto de verdade
          por trás da conversa no WhatsApp. Celular sempre visível (não
          só desktop, diferente do mockup decorativo da seção seguinte),
          já que a maioria do público chega pelo celular. */}
      {/* ══════════════════════════════════════ */}
      <section className="qz-section" style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div className="qz-grid12" style={{ maxWidth: 1080, margin: "0 auto", alignItems: "center" }}>
          <div className="qz-col-7 qz-reveal">
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "#22e07a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>WHATSAPP + PAINEL</p>
            <h2 className="qz-h2-md" style={{ margin: "0 0 16px", color: "#0f172a", textAlign: "left" }}>
              Por trás da conversa, um painel de verdade.
            </h2>
            <p style={{ margin: "0 0 28px", fontSize: 15, color: "#64748b", lineHeight: 1.6, maxWidth: 440 }}>
              Você conversa normalmente pelo WhatsApp — e cada gasto, dívida e resposta vira informação organizada no seu painel, sempre atualizado.
            </p>

            {/* Mockup de conversa — texto de exemplo, não é print real de conversa de nenhum cliente. */}
            <div style={{ background: "#e9edf1", border: "1px solid #dbe2e8", borderRadius: 16, padding: 20, maxWidth: 420 }}>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: "#dcf8c6", borderRadius: "12px 12px 2px 12px", padding: "9px 13px", fontSize: 13.5, color: "#1f2937" }}>
                  gastei 45 no mercado
                </div>
                <div style={{ alignSelf: "flex-start", maxWidth: "85%", background: "#fff", borderRadius: "12px 12px 12px 2px", padding: "9px 13px", fontSize: 13.5, color: "#1f2937", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
                  Anotado ✅ Esse mês você já gastou R$680 em mercado.
                </div>
                <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: "#dcf8c6", borderRadius: "12px 12px 2px 12px", padding: "9px 13px", fontSize: 13.5, color: "#1f2937" }}>
                  posso gastar 300 hoje?
                </div>
                <div style={{ alignSelf: "flex-start", maxWidth: "85%", background: "#fff", borderRadius: "12px 12px 12px 2px", padding: "9px 13px", fontSize: 13.5, color: "#1f2937", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
                  Pode! Depois disso ainda sobra R$1.330 até o fim do mês.
                </div>
              </div>
            </div>
          </div>

          <div className="qz-col-5 qz-reveal" style={{ marginTop: 40, "--qz-delay": "120ms" } as React.CSSProperties}>
            <div className="qz-panel-phone" aria-hidden="true">
              <div className="qz-phone-mock-inner">
                <div className="qz-phone-notch-band">
                  <div className="qz-phone-notch" />
                </div>
                <div style={{
                  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(160deg, #0a2e18 0%, #041a0c 100%)",
                }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.05em", textAlign: "center", padding: "0 24px" }}>
                    PRINT DO PAINEL EM BREVE
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* FUNCIONALIDADES */}
      {/* ══════════════════════════════════════ */}
      <section className="qz-section" style={{ background: "#ffffff", position: "relative" }}>
        {/* Mockup de celular flutuante (referência de estilo "Cogni" que o
            Ibrahim mandou) — só aparece em telas bem largas (>=1280px) pra
            não disputar espaço com o grid de cards em tablet/laptop menor.
            Sem print real do painel ainda, então usa o mesmo placeholder
            "em breve" das outras telas dos cards abaixo. */}
        <div className="qz-phone-mock qz-reveal" aria-hidden="true">
          <div className="qz-phone-mock-inner">
            <div className="qz-phone-notch-band">
              <div className="qz-phone-notch" />
            </div>
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(160deg, #0a2e18 0%, #041a0c 100%)",
            }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.05em", textAlign: "center", padding: "0 24px" }}>
                PRINT DO PAINEL EM BREVE
              </span>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div className="qz-grid12" style={{ marginBottom: 48 }}>
            <div className="qz-col-6 qz-reveal">
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "#22e07a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>FUNCIONALIDADES</p>
              <h2 className="qz-h2-md" style={{ margin: 0, color: "#0f172a", textAlign: "left" }}>
                Tudo isso, direto no seu WhatsApp.
              </h2>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {funcionalidades.map((f, i) => (
              <div key={f.titulo} className="qz-reveal" style={{
                background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden",
                "--qz-delay": `${i * 60}ms`,
              } as React.CSSProperties}>
                {/* Placeholder de screenshot real do app — trocar por print
                    de tela verdadeira desta funcionalidade assim que
                    disponível. */}
                <div className="qz-feat-img" style={{
                  background: "linear-gradient(160deg, #0a2e18 0%, #041a0c 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.05em" }}>
                    PRINT DO APP EM BREVE
                  </span>
                </div>
                <div style={{ padding: "18px 20px" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{f.titulo}</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{f.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* PREÇO */}
      {/* ══════════════════════════════════════ */}
      <section id="preco" className="qz-section" style={{ background: "linear-gradient(160deg, #050b07 0%, #0d1a10 100%)", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.035, mixBlendMode: "overlay", pointerEvents: "none",
          backgroundImage: `url("${GRAIN_SVG}")`,
        }} />
        <div className="qz-grid12" style={{ maxWidth: 1080, margin: "0 auto", alignItems: "center", position: "relative" }}>
          <div className="qz-col-5 qz-reveal">
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "#22e07a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>CONDIÇÃO ESPECIAL</p>
            <h2 className="qz-h2-lg" style={{ margin: "0 0 16px", color: "#fff", textAlign: "left" }}>
              <span style={{ fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontWeight: 500 }}>Um plano.</span> Sem tier, sem surpresa.
            </h2>
            <p style={{ margin: 0, fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, textAlign: "left" }}>
              1.000 vagas disponibilizadas nesta condição. Você mantém R$14,90/mês enquanto sua assinatura permanecer ativa.
            </p>
          </div>

          <div className="qz-col-7 qz-reveal" style={{ "--qz-delay": "100ms" } as React.CSSProperties}>
            {/* Card "vidro" — brilho de borda bem sutil (10-20% da intensidade
                de uma referência glass-pricing comum: se ficar forte demais
                parece cassino neon e derruba a confiança do preço). */}
            <div className="qz-price-card" style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(34,224,122,0.25)", borderRadius: 20,
              boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 40px -12px rgba(34,224,122,0.15)",
              backdropFilter: "blur(16px)", textAlign: "left",
            }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>QuitaZAP</div>
                <div style={{ textAlign: "right", lineHeight: 1 }}>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.5)", verticalAlign: "top" }}>R$ </span>
                  <span style={{ fontFamily: "var(--font-fraunces)", fontSize: "clamp(40px, 9vw, 56px)", fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>14,90</span>
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>/mês</span>
                </div>
              </div>

              {/* Instrumentos de urgência — vagas restantes com barra de
                  progresso e countdown evergreen, tratados como dado da
                  própria interface, não banner de promoção. */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", borderBottom: "1px solid rgba(255,255,255,0.1)", padding: "18px 0", marginBottom: 24, display: "flex", flexDirection: "column" as const, gap: 16 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>VAGAS DISPONÍVEIS</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#22e07a", letterSpacing: "0.05em" }}>
                      {assinantesFundador.toLocaleString("pt-BR")} / {VAGAS_FUNDADOR.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div style={{ height: 3, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min((assinantesFundador / VAGAS_FUNDADOR) * 100, 100)}%`, background: "#22e07a", borderRadius: 999 }} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>TEMPO RESTANTE</span>
                  <CountdownTimer />
                </div>
              </div>

              <div style={{ marginBottom: 28 }}>
                {[
                  "Registro de gastos e dívidas pelo WhatsApp",
                  "Raio-X do Salário e leitura de contracheque",
                  "Análises e alertas de saúde financeira",
                  "Analista financeiro por IA, 24h",
                  "Cancelamento a qualquer momento",
                ].map((item) => (
                  <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "rgba(255,255,255,0.75)", marginBottom: 10 }}>
                    <span style={{ color: "#22e07a", fontWeight: 700, flexShrink: 0 }}>✓</span>
                    {item}
                  </div>
                ))}
              </div>

              <a href={CAKTO_URL} style={{
                display: "block", background: "#22e07a", color: "#000",
                fontWeight: 700, fontSize: 16, padding: "16px 24px", borderRadius: 10,
                textDecoration: "none", textAlign: "center",
              }}>
                Quero garantir R$14,90/mês
              </a>

              <p style={{ margin: "12px 0 0", fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
                7 dias de garantia. Cancele quando quiser.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* FAQ */}
      {/* ══════════════════════════════════════ */}
      <section id="faq" className="qz-section" style={{ background: "#ffffff" }}>
        <div className="qz-grid12" style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div className="qz-col-4 qz-reveal">
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "#22e07a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>DÚVIDAS</p>
            <h2 className="qz-h2-lg" style={{ margin: 0, color: "#0f172a", textAlign: "left" }}>
              Perguntas frequentes
            </h2>
          </div>
          <div className="qz-col-8" style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
            {faq.map((item, i) => (
              <details key={i} className="qz-reveal" style={{
                background: i % 2 === 0 ? "#fff" : "#fafafa", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden",
                "--qz-delay": `${i * 50}ms`,
              } as React.CSSProperties}>
                <summary style={{
                  padding: "18px 20px", fontSize: 15, fontWeight: 600, color: "#0f172a", cursor: "pointer",
                  listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  {item.p}
                  <span style={{ fontSize: 18, color: "#94a3b8", flexShrink: 0, marginLeft: 12 }}>+</span>
                </summary>
                <div style={{ padding: "0 20px 18px", fontSize: 14, color: "#64748b", lineHeight: 1.65 }}>
                  {item.p === "Meus dados ficam seguros?" ? (
                    <>
                      Sim. Seus dados são usados só pra calcular suas informações financeiras e gerar suas análises — não vendemos seus dados pessoais ou financeiros pra ninguém. Você pode pedir a exclusão da sua conta e dos seus dados quando quiser. Veja todos os detalhes na nossa{" "}
                      <a href="/privacidade" style={{ color: "#16a34a", fontWeight: 600 }}>Política de Privacidade</a>.
                    </>
                  ) : item.r}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* CTA FINAL */}
      {/* ══════════════════════════════════════ */}
      <section className="qz-section" style={{ background: "linear-gradient(160deg, #020d06 0%, #041a0c 50%, #0a2e18 100%)", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: "600px", height: "400px", maxWidth: "150vw",
          background: "radial-gradient(ellipse, rgba(34,224,122,0.1) 0%, transparent 70%)",
        }} />
        <div className="qz-reveal" style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <h2 className="qz-h2-lg" style={{ margin: "0 0 16px", color: "#fff" }}>
            Descubra hoje quanto do seu dinheiro é realmente seu.
          </h2>
          <p style={{ margin: "0 0 32px", fontSize: 14, color: "#4ade80" }}>
            {vagasRestantes.toLocaleString("pt-BR")} vagas ainda disponíveis nesta condição · Cancele quando quiser
          </p>
          <a href={CAKTO_URL} style={{
            display: "inline-block", background: "#22e07a", color: "#000", fontWeight: 800, fontSize: 18,
            padding: "18px 48px", borderRadius: 8, textDecoration: "none",
          }}>
            Quero garantir R$14,90/mês
          </a>
        </div>

        {/* Transição em degradê pro preto do rodapé — mesmo tratamento do
            hero, fundo escuro pra fundo escuro (menos contraste, mas
            mantém consistência de padrão entre as seções). */}
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: 80,
          background: "linear-gradient(to bottom, transparent, #0a0a0a)",
          pointerEvents: "none",
        }} />
      </section>

      {/* ══════════════════════════════════════ */}
      {/* RODAPÉ */}
      {/* ══════════════════════════════════════ */}
      <footer style={{ background: "#0a0a0a", padding: "40px 24px", borderTop: "1px solid #1a1a1a" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-q-icon.png" alt="" style={{ height: 28, width: "auto", display: "block" }} />
              <span style={{ color: "#fff", fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>QuitaZap</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {["Como funciona", "Preço", "FAQ"].map((link) => (
                <a key={link} href={`#${link.toLowerCase().replace(" ", "-")}`} style={{ fontSize: 13, color: "#475569", textDecoration: "none", display: "inline-block", padding: "8px 4px" }}>{link}</a>
              ))}
              <a href="/minha-conta/entrar" style={{ fontSize: 13, color: "#475569", textDecoration: "none", display: "inline-block", padding: "8px 4px" }}>Já sou cliente</a>
              <a href="/privacidade" style={{ fontSize: 13, color: "#475569", textDecoration: "none", display: "inline-block", padding: "8px 4px" }}>Privacidade e Termos</a>
              <a href={CONTATO_SUPORTE_LINK} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#475569", textDecoration: "none", display: "inline-block", padding: "8px 4px" }}>Suporte</a>

              {REDES_SOCIAIS.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {REDES_SOCIAIS.map((r) => (
                    <a key={r.nome} href={r.url} target="_blank" rel="noreferrer" aria-label={r.nome} style={{
                      width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.06)",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8",
                    }}>
                      {ICONES_REDE[r.nome]}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 20 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
              © 2026 QuitaZAP. Todos os direitos reservados. · <a href="/privacidade" style={{ color: "#475569" }}>Privacidade e Termos de Uso</a>
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
              O QuitaZAP é uma ferramenta de organização e apoio ao planejamento financeiro. Não é consultoria financeira regulamentada, não promete limpar nome, reduzir dívida ou garantir resultado. As decisões financeiras continuam sendo responsabilidade do usuário.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
