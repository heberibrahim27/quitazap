// ─────────────────────────────────────────
// QuitaZAP — Landing Page de Vendas
// Rota: / (raiz do site — antes era /oferta, ver src/app/oferta/page.tsx
// pro redirecionamento mantido por compatibilidade)
// ─────────────────────────────────────────

import { Inter, Fraunces, Oswald, JetBrains_Mono } from "next/font/google";
import { ScrollReveal } from "./ScrollReveal";
import { CountUp } from "./CountUp";
import { ComoFuncionaScroll } from "./ComoFuncionaScroll";
import { WhatsAppPainelStage } from "./WhatsAppPainelStage";
import { HeroFade } from "./HeroFade";
import { FuncionalidadesStack } from "./FuncionalidadesStack";

// Inter nunca foi de fato carregada nesta página (o fontFamily só citava
// o nome, sem @font-face nem next/font) — sempre caiu pro fallback
// (Segoe UI/Arial) em qualquer sistema sem Inter instalada. Corrigido
// aqui via next/font (auto-hospedado, sem request externo) e aproveitado
// pra trazer as duas fontes da identidade "Hero Ousado" (serifada
// itálica pros acentos, mono pros rótulos) — escopado só a esta página,
// não mexe na tipografia do resto do produto logado.
const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], weight: ["300", "500", "600"], variable: "--font-fraunces" });
// Fonte extra usada só no Hero (pedido explícito) — condensada/geométrica
// como no headline da referência Finex que o Ibrahim mandou, aplicada em
// cima da nossa paleta (verde), não as cores azuis do original. O resto
// do site continua com Fraunces (serifada itálica), sem mudança.
const oswald = Oswald({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-oswald" });
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
  /* Border-beam: aro fino de luz que dá uma volta única quando o elemento
     entra na tela (reaproveita o mesmo IntersectionObserver do reveal, via
     .qz-visible), depois some e deixa só a borda estática já existente do
     elemento. Usado com critério em pouquíssimos lugares (card de preço) —
     nunca em todo card, conforme decidido no diagnóstico de direção de arte. */
  .qz-beam { position: relative; }
  .qz-beam::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit;
    border: 1px solid rgba(255,255,255,0);
    box-shadow: 0 0 0 0 rgba(255,255,255,0);
    opacity: 0; pointer-events: none;
  }
  .qz-price-wrap.qz-visible .qz-beam::before { animation: qz-beam-sweep 1.6s cubic-bezier(.16,1,.3,1) .3s 1 both; }
  @keyframes qz-beam-sweep {
    0% { opacity: 0; border-color: rgba(255,255,255,0); box-shadow: 0 0 0 0 rgba(255,255,255,0); }
    35% { opacity: 1; border-color: rgba(255,255,255,0.55); box-shadow: 0 0 20px 1px rgba(255,255,255,0.25); }
    100% { opacity: 0; border-color: rgba(255,255,255,0); box-shadow: 0 0 0 0 rgba(255,255,255,0); }
  }
  /* CTA estilo Finex (referência mandada pelo Ibrahim) adaptado pra nossa
     paleta: anel fino girando continuamente ao redor da pílula, sem usar
     mask/conic-gradient mascarado (técnica que já vazou fora do card uma
     vez nesta sessão) — aqui é só empilhamento de 3 camadas com
     overflow:hidden: (1) o wrap com border-radius+overflow:hidden, (2) um
     conic-gradient bem maior que o próprio botão girando por baixo, (3) a
     pílula de verdade (gradiente verde + sombra) cobrindo tudo menos um
     anel fino de ~1.5px nas bordas, onde o brilho giratório aparece. */
  .qz-cta-wrap {
    position: relative; display: inline-flex; border-radius: 999px; overflow: hidden;
    padding: 1.5px; text-decoration: none; flex-shrink: 0;
  }
  .qz-cta-wrap::before {
    content: ""; position: absolute; inset: -150%;
    background: conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(255,255,255,0.95) 320deg, #22e07a 345deg, transparent 360deg);
    animation: qz-cta-spin 3s linear infinite;
  }
  @keyframes qz-cta-spin { to { transform: rotate(360deg); } }
  .qz-cta-inner {
    position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; border-radius: 999px; color: #000; text-decoration: none;
    background: linear-gradient(180deg, #29e883, #1bc767);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.16);
    transition: transform .2s ease, box-shadow .2s ease;
  }
  .qz-cta-wrap:hover .qz-cta-inner {
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 4px rgba(0,0,0,0.16), 0 6px 16px -6px rgba(34,224,122,0.6);
  }
  .qz-cta-arrow { transition: transform .25s ease; flex-shrink: 0; }
  .qz-cta-wrap:hover .qz-cta-arrow { transform: translateX(3px); }
  @media (prefers-reduced-motion: reduce) {
    .qz-cta-wrap::before { animation: none; }
  }
  .qz-grid12 { display: grid; grid-template-columns: 1fr; gap: 28px; }
  .qz-hero-pad { padding-left: 24px; padding-right: 24px; }
  /* Tamanho fluido (clamp) em vez de salto fixo por breakpoint — o salto
     duro pra 128px/72px/48px exatamente em 768px, junto com o grid virando
     multi-coluna nesse mesmo ponto (coluna de texto ainda estreita),
     quebrava "ainda é seu."/"Um plano só..." em linhas curtas e
     desalinhadas por volta de 768-900px. Fluido cresce com a largura da
     coluna em vez de saltar de uma vez. */
  .qz-hero-light { font-size: clamp(40px, 6.5vw, 72px); }
  .qz-hero-heavy { font-size: clamp(56px, 10vw, 128px); line-height: 0.95; }
  .qz-section { padding: 64px 24px; }
  .qz-h2-sm { font-size: 24px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.25; }
  .qz-h2-md { font-size: 28px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.2; }
  .qz-h2-lg { font-size: clamp(28px, 4.5vw, 48px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; }
  /* Fechamento — headline bem maior que as outras seções (bookend do
     Hero), em duas linhas com stagger separado, pra terminar "grande"
     em vez do bloco de texto centralizado genérico de antes. */
  .qz-close-light { display: block; font-size: clamp(20px, 5vw, 30px); font-weight: 300; opacity: 0.75; margin-bottom: 4px; }
  .qz-close-heavy { display: block; font-family: var(--font-fraunces); font-style: italic; font-weight: 500; font-size: clamp(34px, 9vw, 76px); line-height: 1.05; letter-spacing: -0.02em; }
  .qz-panel-phone { width: 200px; height: 412px; margin: 0 auto; border-radius: 30px; padding: 2px; background: linear-gradient(160deg, rgba(255,255,255,.5), rgba(255,255,255,.05)); box-shadow: 0 30px 60px -20px rgba(15,23,42,.35); }
  /* Fotos reais (Como Funciona) já vêm com a moldura de celular completa
     (bezel, notch, status bar) dentro da própria imagem — usar
     .qz-panel-phone aqui criaria um "celular dentro de celular". Só um
     recorte com cantos levemente arredondados, sem frame extra por fora. */
  .qz-cf-photo { width: 200px; height: 412px; margin: 0 auto; border-radius: 22px; overflow: hidden; box-shadow: 0 24px 48px -20px rgba(15,23,42,.35); }
  .qz-hero-side { margin-top: 8px; }
  .qz-feat-img { aspect-ratio: 16 / 9; }
  /* Foto real de celular (retrato) — não force a mesma proporção paisagem
     dos placeholders, senão o crop corta o topo da tela e mostra só um
     pedaço irreconhecível da conversa. */
  .qz-feat-img-portrait { aspect-ratio: 9 / 19.5; }
  /* Cards empilhando com scroll (referência "Parallax Clean" que o
     Ibrahim mandou) — só no desktop; no mobile é uma lista sequencial
     simples, sem sticky, sem scale/opacity scrubado (decisão de
     engenharia pra não pesar no celular). */
  .qz-feat-stack-desktop { display: none; }
  .qz-feat-stack-mobile { display: flex; flex-direction: column; gap: 20px; margin-top: 24px; }
  .qz-feat-stack-mobile .qz-feat-stack-card {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .qz-feat-stack-mobile .qz-feat-stack-imgwrap { order: 1; }
  .qz-feat-stack-mobile .qz-feat-stack-content { order: 2; }
  .qz-feat-stack-content { padding: 20px; display: flex; flex-direction: column; justify-content: center; }
  .qz-feat-stack-imgwrap { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; }
  .qz-price-card { padding: 28px 22px; }
  .qz-dor-num-1 { font-size: 44px; }
  .qz-dor-num-2 { font-size: 32px; }
  .qz-dor-num-3 { font-size: 56px; }
  .qz-cf-desktop { display: none; }
  .qz-cf-mobile { display: flex; flex-direction: column; gap: 40px; }
  .qz-wp-stage { display: flex; flex-direction: column; gap: 20px; margin-top: 40px; }
  /* Screenshot real do painel (substituiu as barras/linhas fake em CSS) —
     só recorte com cantos arredondados + sombra, sem frame extra por
     fora, mesmo critério já usado nas fotos reais de Como Funciona. */
  .qz-wp-dashboard {
    position: relative; border-radius: 16px; overflow: hidden;
    box-shadow: 0 20px 40px -20px rgba(0,0,0,0.6);
  }
  .qz-wp-phone { width: 176px; margin: 0 auto; }
  .qz-wp-phone-photo { width: 100%; height: 364px; border-radius: 22px; overflow: hidden; box-shadow: 0 24px 48px -20px rgba(0,0,0,.6); }
  .qz-wp-chip {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;
  }
  .qz-wp-chip-msg { font-size: 13.5px; color: rgba(255,255,255,0.85); }
  .qz-wp-chip-status { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.05em; color: var(--accent); font-weight: 600; }
  .qz-wp-chip-label { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.06em; color: rgba(255,255,255,0.4); }
  .qz-wp-chip-insight { font-size: 13.5px; color: rgba(255,255,255,0.85); line-height: 1.5; margin: 0; }
  .qz-wp-chip-insight strong { color: var(--accent); font-weight: 700; }
  .qz-wa-screen { position: absolute; inset: 0; display: flex; flex-direction: column; background: #E5DDD5; }
  .qz-wa-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #075E54; flex-shrink: 0; }
  .qz-wa-avatar {
    width: 26px; height: 26px; border-radius: 50%; background: #128C7E; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 700;
  }
  .qz-wa-header-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .qz-wa-header-name { color: #fff; font-size: 12.5px; font-weight: 600; line-height: 1.1; }
  .qz-wa-header-status { color: rgba(255,255,255,0.75); font-size: 9.5px; line-height: 1; }
  .qz-wa-body { flex: 1; padding: 12px 10px; display: flex; flex-direction: column; gap: 6px; overflow: visible; }
  .qz-wa-row { display: flex; }
  .qz-wa-row.qz-wa-out { justify-content: flex-end; }
  .qz-wa-row.qz-wa-in { justify-content: flex-start; }
  .qz-wa-bubble {
    max-width: 80%; padding: 6px 7px 4px; border-radius: 7.5px; font-size: 12px;
    line-height: 1.35; color: #111b21; position: relative;
  }
  .qz-wa-bubble.qz-wa-out { background: #D9FDD3; border-top-right-radius: 0; }
  .qz-wa-bubble.qz-wa-in { background: #fff; border-top-left-radius: 0; box-shadow: 0 1px 0.5px rgba(0,0,0,0.13); }
  /* Rabicho da bolha (tail) — sem isso não parece WhatsApp de verdade,
     só um card com canto reto. Triângulo via border trick, encostado no
     canto onde o border-radius foi zerado acima. */
  .qz-wa-bubble.qz-wa-out::after {
    content: ""; position: absolute; top: 0; right: -8px; width: 0; height: 0;
    border-style: solid; border-width: 0 0 13px 8px;
    border-color: transparent transparent transparent #D9FDD3;
  }
  .qz-wa-bubble.qz-wa-in::after {
    content: ""; position: absolute; top: 0; left: -8px; width: 0; height: 0;
    border-style: solid; border-width: 0 8px 13px 0;
    border-color: transparent transparent transparent transparent;
    border-right-color: #fff;
  }
  .qz-wa-meta { display: flex; align-items: center; gap: 3px; justify-content: flex-end; margin-top: 2px; font-size: 9px; color: rgba(0,0,0,0.45); }
  .qz-wa-check { color: #53BDEB; font-size: 11px; line-height: 1; }
  .qz-wa-inputbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px 10px; background: #E5DDD5; flex-shrink: 0; }
  .qz-wa-input-pill {
    flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0;
    background: #fff; border-radius: 999px; padding: 5px 10px;
  }
  .qz-wa-input-placeholder { flex: 1; font-size: 11.5px; color: #8696a0; }
  .qz-wa-mic-btn {
    flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; background: #00A884;
    display: flex; align-items: center; justify-content: center;
  }
  @media (min-width: 768px) {
    .qz-grid12 { grid-template-columns: repeat(12, 1fr); gap: 40px; }
    .qz-col-4 { grid-column: span 4; }
    .qz-col-5 { grid-column: span 5; }
    .qz-col-6 { grid-column: span 6; }
    .qz-col-7 { grid-column: span 7; }
    .qz-col-8 { grid-column: span 8; }
    .qz-hero-pad { padding-left: 48px; padding-right: 48px; }
    .qz-hero-heavy { margin-top: -16px; }
    .qz-section { padding: 96px 48px; }
    .qz-h2-sm { font-size: 30px; }
    .qz-h2-md { font-size: 36px; }
    .qz-hero-side { margin-top: 32px; }
    .qz-panel-phone { width: 240px; height: 494px; border-radius: 34px; margin: 0; }
    .qz-cf-photo { width: 240px; height: 494px; margin: 0; }
    .qz-feat-img { aspect-ratio: 4 / 3; }
    .qz-feat-stack-desktop { display: block; position: relative; margin-top: 32px; padding-bottom: 8vh; }
    .qz-feat-stack-mobile { display: none; }
    .qz-feat-stack-item {
      position: sticky; top: 10vh; height: 62vh; margin-bottom: 6vh;
      display: flex; align-items: center; justify-content: center;
    }
    .qz-feat-stack-card {
      width: 100%; height: 100%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 24px;
      overflow: hidden; display: grid; grid-template-columns: 1fr 1.2fr;
      box-shadow: 0 30px 60px -20px rgba(15,23,42,.3);
    }
    .qz-feat-stack-content { padding: 48px; display: flex; flex-direction: column; justify-content: center; }
    .qz-feat-stack-imgwrap { position: relative; width: 100%; height: 100%; overflow: hidden; }
    .qz-price-card { padding: 40px 36px; }
    .qz-cf-mobile { display: none; }
    .qz-cf-desktop {
      display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 48px;
    }
    .qz-cf-sticky-col { position: relative; }
    .qz-cf-sticky-inner { position: sticky; top: 12vh; height: 76vh; display: flex; align-items: center; justify-content: flex-end; }
    .qz-cf-steps-col { display: flex; flex-direction: column; }
    .qz-cf-step { min-height: 88vh; display: flex; align-items: center; }
    .qz-wp-stage { position: relative; height: 560px; display: block; margin-top: 64px; }
    .qz-wp-dashboard {
      position: absolute; top: 4%; right: 0; width: 56%; max-width: 400px;
      transform: translate3d(calc(var(--wp-px, 0) * 6px), calc(var(--wp-py, 0) * 6px), 0) rotate(1.5deg);
      transition: transform .2s ease-out;
    }
    .qz-wp-phone {
      position: absolute; left: 2%; bottom: 0; z-index: 3;
      transform: translate3d(calc(var(--wp-px, 0) * 12px), calc(var(--wp-py, 0) * 12px), 0) rotate(var(--wp-phone-rot, -3deg));
      transition: transform .25s ease-out;
    }
    .qz-wp-phone:hover { --wp-phone-rot: 0deg; }
    .qz-wp-chip-1 {
      position: absolute; top: 0; left: 4%; width: 200px; z-index: 4;
      transform: translate3d(calc(var(--wp-px, 0) * 18px), calc(var(--wp-py, 0) * 18px), 0);
      transition: transform .2s ease-out;
    }
    .qz-wp-chip-2 {
      position: absolute; bottom: 6%; right: 4%; width: 260px; z-index: 4;
      transform: translate3d(calc(var(--wp-px, 0) * 20px), calc(var(--wp-py, 0) * -18px), 0);
      transition: transform .2s ease-out;
    }
    .qz-dor-num-1 { font-size: 88px; }
    .qz-dor-num-2 { font-size: 56px; }
    .qz-dor-num-3 { font-size: 120px; }
  }
`;

const CAKTO_URL = process.env.NEXT_PUBLIC_CAKTO_URL ?? "#";

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
  { badge: "CARTÃO", titulo: "Cartão de crédito", texto: "A fatura sobe e você não sabe onde foi.", icone: "cartao" as const },
  { badge: "FIXAS", titulo: "Contas fixas", texto: "Água, luz, aluguel — tudo saindo ao mesmo tempo.", icone: "contas" as const },
  { badge: "CONSIGNADO", titulo: "Empréstimos e consignado", texto: "Parcelas que descontam antes de você ver o dinheiro.", icone: "emprestimo" as const },
  { badge: "DIA A DIA", titulo: "Gastos do dia a dia", texto: "Pequenos gastos que somam mais do que parece.", icone: "gastos" as const },
];

// Os 3 primeiros ficam no grid estático de sempre; os 3 últimos (Modo
// Apertou / Simulador de Parcelas / Dívidas e Consignados) ganham o
// efeito de empilhamento com scroll (ver FuncionalidadesStack.tsx).
// `imagem` só quando existe screenshot real batendo de fato com a
// funcionalidade — sem isso, fica o placeholder "EM BREVE" (mostrar um
// print de outra tela fingindo ser a certa seria tão desonesto quanto
// inventar prova social).
const funcionalidadesGrid = [
  { titulo: "Raio-X do Salário", texto: "Entenda de onde vem e pra onde vai cada real do seu contracheque.", imagem: "/painel-raiox.webp", imagemVertical: true },
  { titulo: "Salário Livre", texto: "Saiba exatamente quanto sobra até o próximo pagamento.", imagem: "/painel-salario-livre.webp" },
  { titulo: "Analista pelo WhatsApp", texto: "Pergunte qualquer coisa sobre suas finanças, na hora.", imagem: "/whatsapp-3.webp", imagemVertical: true },
];
const funcionalidadesStack = [
  { titulo: "Modo Apertou", texto: "Um aviso claro quando dias apertados estão chegando.", imagem: "/painel-modo-apertou.webp" },
  // Renomeado de "Simulador de Parcelas": o print real disponível
  // (tela de Empréstimos > detalhe) mostra o controle de uma parcela já
  // existente — marcar como paga, ver quanto falta — não uma simulação de
  // parcela nova. Texto ajustado pra descrever o que a tela mostra de
  // verdade, em vez de prometer algo que ela não faz.
  { titulo: "Controle de Parcelas", texto: "Acompanhe cada parcela do seu empréstimo e marque como paga sem esforço.", imagem: "/painel-emprestimo.webp" },
  { titulo: "Dívidas e Consignados", texto: "Organize tudo num só lugar e veja o caminho pra ficar livre delas.", imagem: "/painel-dividas.webp" },
  { titulo: "Cartões sob controle", texto: "Limite, fatura e compras parceladas — tudo num só lugar, sem susto.", imagem: "/painel-cartoes.webp" },
];

const faq = [
  {
    p: "O QuitaZap tem acesso à minha conta bancária?",
    r: "Não. Hoje você não precisa conectar sua conta bancária. O QuitaZap trabalha com as informações que você decide registrar pelo WhatsApp ou pelo painel.",
  },
  {
    p: "Preciso trocar de banco ou cartão para usar?",
    r: "Não. O QuitaZap independe do banco ou cartão que você usa. Você pode organizar receitas, gastos, cartões, dívidas e compromissos no mesmo lugar.",
  },
  {
    p: "Como registro meus gastos?",
    r: "É só falar normalmente pelo WhatsApp. Você pode escrever, mandar áudio, foto ou documento, e o QuitaZap ajuda a transformar isso em informação organizada.",
  },
  {
    p: "O que eu posso perguntar ao QuitaZap?",
    r: "Coisas do dia a dia, como \"quanto ainda posso gastar?\", \"onde estou gastando mais?\", \"essa parcela cabe no meu mês?\" ou \"como posso economizar este mês?\".",
  },
  {
    p: "Preciso entender de finanças para usar?",
    r: "Não. O objetivo é justamente tirar a complexidade. O QuitaZap organiza os números e apresenta o que importa em linguagem simples.",
  },
  {
    p: "As respostas da inteligência artificial podem errar?",
    r: "Podem. Por isso, as análises dependem das informações registradas no QuitaZap. A IA ajuda a interpretar e explicar os dados, mas não substitui uma decisão financeira profissional quando ela for necessária.",
  },
  {
    p: "Meus dados são vendidos para outras empresas?",
    r: "Não. O QuitaZap não vende seus dados. As informações são usadas para prestar o serviço e gerar as funcionalidades que você utiliza.",
  },
  {
    p: "Posso cancelar quando quiser? E o valor de R$14,90?",
    r: "Sim. Você pode cancelar sua assinatura. Quem aderir à condição de R$14,90 mantém esse valor enquanto a assinatura permanecer ativa; se cancelar e voltar depois, vale a condição disponível naquele momento.",
  },
];

// Botão de CTA — anel giratório + pílula verde (estilo Finex adaptado à
// nossa paleta). Componente compartilhado pelos 3 CTAs (Hero, Preço,
// Fechamento) pra não triplicar a mesma estrutura de 3 camadas.
function CtaButton({
  href,
  children,
  className,
  innerStyle,
  block,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  innerStyle?: React.CSSProperties;
  block?: boolean;
}) {
  return (
    <a href={href} className={`qz-cta-wrap ${className ?? ""}`} style={block ? { display: "flex", width: "100%" } : undefined}>
      <span className="qz-cta-inner" style={innerStyle}>
        {children}
        <svg className="qz-cta-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </a>
  );
}

// Logo com glow suave atrás — a wordmark tem "Quita" em tom bem escuro
// (parte oficial do arquivo enviado), que quase some nos fundos escuros
// do Hero/rodapé sem esse respiro claro por trás.
function LogoQuitaZap({ height }: { height: number }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <div style={{
        position: "absolute", inset: `${-height * 0.35}px ${-height * 0.18}px`,
        background: "radial-gradient(ellipse, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.22) 45%, transparent 75%)",
        filter: `blur(${height * 0.22}px)`,
      }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-quitazap.webp" alt="QuitaZap" style={{ position: "relative", height, width: "auto", display: "block" }} />
    </div>
  );
}

// Ícones dos 4 mini-cards de Dor — estilo linha fina, verde só no traço
// (referência: print que o Ibrahim mandou, cards escuros com badge+ícone
// verde centralizados, não o card inteiro pintado).
function IconeDor({ tipo }: { tipo: "cartao" | "contas" | "emprestimo" | "gastos" }) {
  const props = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none" as const, stroke: "#22e07a", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (tipo === "cartao") {
    return (
      <svg {...props}>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
        <path d="M2.5 9.5h19" />
        <path d="M6 14.5h4" />
      </svg>
    );
  }
  if (tipo === "contas") {
    return (
      <svg {...props}>
        <path d="M6 3h12v16.5l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z" />
        <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
      </svg>
    );
  }
  if (tipo === "emprestimo") {
    return (
      <svg {...props}>
        <circle cx="8" cy="8" r="2.5" />
        <circle cx="16" cy="16" r="2.5" />
        <path d="M17 7 7 17" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M6 8h12l-1 12H7Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

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
  return (
    <div className={`${inter.variable} ${fraunces.variable} ${oswald.variable} ${mono.variable}`} style={{
      background: "#ffffff", minHeight: "100vh", fontFamily: "var(--font-inter), 'Segoe UI', Arial, sans-serif",
      color: "#0a0a0a", overflowX: "clip", position: "relative",
      // Paleta formalizada (direção "editorial com ritmo claro/escuro" —
      // substitui os hex ad-hoc usados até aqui). Verde continua só como
      // sinal de ação (CTA, número positivo, progresso) — nunca fundo.
      "--ink": "#080908", "--carbon": "#111211", "--graphite": "#242624",
      "--paper": "#F0F0EA", "--stone": "#D8D9D3", "--muted": "#989C96",
      "--accent": "#22e07a",
    } as React.CSSProperties}>
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
            decodificar o primeiro frame (e o fallback se autoplay falhar).
            Fica FORA do fade (backdrop permanente por trás do vídeo), então
            os tons precisam terminar bem escuros/neutros (perto do preto da
            dobra de Dor) — antes terminava num verde médio (#114a28/#0e3a20)
            que, sem o vídeo/overlays por cima durante o fade, aparecia como
            um "flash" verde na transição. */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          background: "linear-gradient(160deg, #030f08 0%, #0a1a10 45%, #060f09 80%, #030906 100%)",
        }} />
        <HeroFade>
          {/* Glow radial e grid ficam dentro do fade (junto com o vídeo) —
              não podem sobrar sozinhos por trás como backdrop permanente,
              senão o glow verde vira o tint visível durante a transição. */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 0,
            background: "radial-gradient(ellipse 60% 55% at 30% 35%, rgba(34,224,122,0.16), transparent 70%)",
          }} />
          <div style={{
            position: "absolute", inset: 0, zIndex: 0, opacity: 0.05,
            backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
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
              <LogoQuitaZap height={34} />
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
                color: "rgba(255,255,255,0.6)", letterSpacing: "0.14em", textTransform: "uppercase",
              }}>
                Controle financeiro pelo WhatsApp
              </p>
              <h1 style={{ margin: 0, color: "#fff", lineHeight: 1, letterSpacing: "-0.02em", fontFamily: "var(--font-oswald)" }}>
                <span className="qz-reveal qz-hero-light" style={{ display: "block", fontWeight: 300, opacity: 0.8, marginBottom: 8, "--qz-delay": "60ms" } as React.CSSProperties}>
                  Descubra quanto do seu dinheiro
                </span>
                <span className="qz-reveal qz-hero-heavy" style={{ display: "block", fontWeight: 600, marginLeft: -2, "--qz-delay": "120ms" } as React.CSSProperties}>
                  ainda é <span style={{ color: "#22e07a" }}>seu.</span>
                </span>
              </h1>
            </div>

            <div className="qz-col-5 qz-hero-side" style={{ color: "#fff" }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 400, letterSpacing: "-0.01em", fontFamily: "var(--font-oswald)" }} className="qz-reveal">
                Direto no WhatsApp.
              </h2>
              <p className="qz-reveal" style={{ margin: "0 0 32px", fontSize: 14, opacity: 0.8, maxWidth: 380, fontWeight: 300, lineHeight: 1.6 }}>
                Controle seus gastos, entenda suas contas e dívidas, e pergunte ao QuitaZap antes de gastar — sem conectar conta bancária.
              </p>
              <CtaButton
                href={CAKTO_URL}
                className="qz-reveal"
                innerStyle={{ padding: "13px 26px", fontSize: 14, fontWeight: 600, fontFamily: "var(--font-oswald)", textTransform: "uppercase", letterSpacing: "0.02em" }}
              >
                Quero garantir R$14,90/mês
              </CtaButton>
            </div>
          </div>
        </HeroFade>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* SEÇÃO DOR + PROVA — agita o problema em palavras, depois narrativa
          de subtração editorial (não 3 cards iguais): renda cheia → o que
          já está comprometido → o que sobra de verdade, em verde e maior,
          entrando por último. Sem "wow moment" pesado aqui (isso fica pra
          Hero/Como Funciona/WhatsApp+Painel) — só reveal e contador. */}
      {/* ══════════════════════════════════════ */}
      <section className="qz-section" style={{ background: "linear-gradient(180deg, #050b07 0%, #0a140d 100%)", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.035, mixBlendMode: "overlay", pointerEvents: "none",
          backgroundImage: `url("${GRAIN_SVG}")`,
        }} />
        <div style={{ maxWidth: 1080, margin: "0 auto", position: "relative" }}>
          <div className="qz-grid12" style={{ marginBottom: 56 }}>
            <div className="qz-col-8 qz-reveal">
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.55)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>TODO MÊS A MESMA HISTÓRIA</p>
              <h2 className="qz-h2-sm" style={{ margin: 0, color: "#fff", textAlign: "left" }}>
                Muita gente recebe o dinheiro do mês e, quando vê, quase tudo já foi em cartão, contas e dívidas — e no fim do mês nem sabe direito onde o dinheiro foi.
              </h2>
            </div>
          </div>

          {/* Narrativa de subtração — renda cheia, o que já está
              comprometido, o que sobra de verdade. Posições assimétricas,
              não cards iguais; cada linha entra em cascata no scroll. */}
          <div style={{ marginBottom: 56 }}>
            <div className="qz-reveal">
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>RENDA LÍQUIDA</p>
              <p className="qz-dor-num-1" style={{ margin: 0, fontFamily: "var(--font-fraunces)", fontWeight: 500, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
                <CountUp valor={5820} />
              </p>
            </div>

            <div className="qz-reveal" style={{ marginTop: 20, marginLeft: "8%", "--qz-delay": "120ms" } as React.CSSProperties}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>− COMPROMETIDO COM CONTAS E DÍVIDAS</p>
              <p className="qz-dor-num-2" style={{ margin: 0, fontFamily: "var(--font-fraunces)", fontWeight: 500, color: "rgba(255,255,255,0.4)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                <CountUp valor={4190} />
              </p>
            </div>

            <div className="qz-reveal" style={{
              marginTop: 32, paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.15)", "--qz-delay": "260ms",
            } as React.CSSProperties}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#22e07a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>REALMENTE LIVRE</p>
              <p className="qz-dor-num-3" style={{ margin: 0, fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontWeight: 500, color: "#22e07a", letterSpacing: "-0.02em", lineHeight: 1 }}>
                <CountUp valor={1630} />
              </p>
              <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "rgba(255,255,255,0.4)" }}>
                Exemplo ilustrativo — os números do seu caso vêm do que você registrar no QuitaZap.
              </p>
            </div>
          </div>

          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {/* Textura de grid sutil só atrás desses 4 cards — referência
                do print (fundo quase preto com grafite/grid de fundo). */}
            <div style={{
              position: "absolute", inset: -16, zIndex: 0, opacity: 0.05, pointerEvents: "none",
              backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }} />
            {doresMinicards.map((d, i) => (
              <div key={d.titulo} className="qz-reveal" style={{
                position: "relative", zIndex: 1, background: "#0a140d", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
                "--qz-delay": `${i * 70}ms`,
              } as React.CSSProperties}>
                <span style={{
                  display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "#22e07a",
                  letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 999,
                  border: "1px solid rgba(34,224,122,0.35)", background: "rgba(34,224,122,0.08)", marginBottom: 18,
                }}>
                  {d.badge}
                </span>
                <IconeDor tipo={d.icone} />
                <p style={{ margin: "16px 0 6px", fontSize: 15, fontWeight: 700, color: "#fff" }}>{d.titulo}</p>
                <p style={{ margin: 0, fontSize: 12.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{d.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* COMO FUNCIONA — um dos 3 "momentos uau" da página (os outros são
          Hero e WhatsApp+Painel). Fundo STONE, não preto — a virada de
          humor depois de Hero+Dor escuros. Celular sticky no desktop,
          conteúdo trocando por estado via IntersectionObserver (não
          scroll contínuo recalculado a cada pixel — decisão de engenharia
          pra não arriscar performance/prazo). Mobile simplifica pra 3
          blocos empilhados, sem sticky de 250vh. */}
      {/* ══════════════════════════════════════ */}
      <section id="como-funciona" className="qz-section" style={{ background: "var(--stone)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <p className="qz-reveal" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", marginBottom: 20 }}>
            [ 03 / COMO FUNCIONA ]
          </p>
          <h2 className="qz-reveal" style={{
            margin: "0 0 64px", fontFamily: "var(--font-fraunces)", fontWeight: 500, color: "var(--ink)",
            fontSize: "clamp(28px, 5vw, 44px)", lineHeight: 1.15, maxWidth: 640, "--qz-delay": "60ms",
          } as React.CSSProperties}>
            Sua vida acontece. Você só conta pra gente.
          </h2>

          <ComoFuncionaScroll />
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* WHATSAPP + PAINEL — segundo dos 3 "momentos uau" (Hero e Como
          Funciona são os outros). Fundo CARBON: o produto como objeto,
          não texto+celular de template. Celular + fatia de painel +
          mensagens flutuando fora do aparelho, com leve parallax de
          MOUSE (não de scroll — decisão já tomada de cortar parallax
          contínuo ligado a scroll por custo/risco de performance; mouse
          é interação local, não compete com essa decisão). */}
      {/* ══════════════════════════════════════ */}
      <section id="whatsapp-painel" className="qz-section" style={{ background: "var(--carbon)", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.035, mixBlendMode: "overlay", pointerEvents: "none",
          backgroundImage: `url("${GRAIN_SVG}")`,
        }} />
        <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>
          <p className="qz-reveal" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", marginBottom: 20 }}>
            [ 04 / WHATSAPP + PAINEL ]
          </p>
          <h2 className="qz-reveal" style={{
            margin: "0 0 16px", fontFamily: "var(--font-fraunces)", fontWeight: 500, color: "var(--paper)",
            fontSize: "clamp(28px, 5vw, 44px)", lineHeight: 1.15, maxWidth: 620, "--qz-delay": "40ms",
          } as React.CSSProperties}>
            Converse de um lado. Enxergue tudo do outro.
          </h2>
          <p className="qz-reveal" style={{
            margin: 0, fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, maxWidth: 460, "--qz-delay": "80ms",
          } as React.CSSProperties}>
            Você conversa normalmente pelo WhatsApp — e cada gasto, dívida e resposta vira informação organizada no seu painel, sempre atualizado.
          </p>

          <WhatsAppPainelStage />
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* FUNCIONALIDADES */}
      {/* ══════════════════════════════════════ */}
      <section className="qz-section" style={{ background: "#ffffff", position: "relative" }}>
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
            {funcionalidadesGrid.map((f, i) => (
              <div key={f.titulo} className="qz-reveal" style={{
                background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden",
                "--qz-delay": `${i * 60}ms`,
              } as React.CSSProperties}>
                {f.imagem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.imagem} alt="" className={f.imagemVertical ? "qz-feat-img-portrait" : "qz-feat-img"} style={{ objectFit: "cover", width: "100%" }} />
                ) : (
                  /* Placeholder — sem screenshot real batendo com essa
                     funcionalidade ainda. */
                  <div className="qz-feat-img" style={{
                    background: "linear-gradient(160deg, #0a2e18 0%, #041a0c 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.05em" }}>
                      PRINT DO APP EM BREVE
                    </span>
                  </div>
                )}
                <div style={{ padding: "18px 20px" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{f.titulo}</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{f.texto}</p>
                </div>
              </div>
            ))}
          </div>

          <FuncionalidadesStack itens={funcionalidadesStack} />
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* PROVA SOCIAL — etapa 4/4 do plano da auditoria de direção de arte.
          Sem depoimento, sem foto/vídeo e sem número — não existe ainda
          nenhum dado real (avaliação, contagem de usuários, foto de
          cliente) pra sustentar uma prova social de verdade, e inventar
          qualquer um desses violaria a própria regra do brief ("não criar
          falsas provas sociais"). Fica só uma frase editorial curta,
          quieta, sem moldura de "card de depoimento" — um respiro entre o
          grid denso de Funcionalidades e o pedido de Preço, não uma
          seção fingindo ter prova que não tem. Assim que existir material
          real (foto/vídeo de gente usando o QuitaZap, depoimento de
          verdade), essa dobra ganha corpo. */}
      {/* ══════════════════════════════════════ */}
      <section className="qz-section" style={{ background: "var(--paper)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <p className="qz-reveal" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
            [ VIDA REAL ]
          </p>
          <p className="qz-reveal" style={{
            margin: 0, fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontWeight: 500, color: "var(--ink)",
            fontSize: "clamp(26px, 4.5vw, 42px)", lineHeight: 1.3, "--qz-delay": "60ms",
          } as React.CSSProperties}>
            No meio da correria, você continua no controle.
          </p>
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
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.55)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>CONDIÇÃO ESPECIAL</p>
            <h2 className="qz-h2-lg" style={{ margin: "0 0 16px", color: "#fff", textAlign: "left" }}>
              <span style={{ fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontWeight: 500 }}>Um plano só.</span> Sem letra miúda, sem surpresa.
            </h2>
            <p style={{ margin: 0, fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, textAlign: "left" }}>
              Você mantém R$14,90/mês enquanto sua assinatura permanecer ativa.
            </p>
          </div>

          <div className="qz-col-7 qz-reveal qz-price-wrap" style={{ "--qz-delay": "100ms" } as React.CSSProperties}>
            {/* Card "vidro" — brilho neutro (branco), não verde: o verde fica
                reservado só pro CTA, não pra moldura inteira do card.
                qz-beam dá uma volta de luz única quando o card entra na
                tela (border-beam pontual, só aqui — não em todo card da
                página). */}
            <div className="qz-price-card qz-beam" style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 20,
              boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 40px -12px rgba(255,255,255,0.06)",
              backdropFilter: "blur(16px)", textAlign: "left",
            }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 28 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>QuitaZAP</div>
                <div style={{ textAlign: "right", lineHeight: 1 }}>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.5)", verticalAlign: "top" }}>R$ </span>
                  <span style={{ fontFamily: "var(--font-fraunces)", fontSize: "clamp(40px, 9vw, 56px)", fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>14,90</span>
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>/mês</span>
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
                    <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700, flexShrink: 0 }}>✓</span>
                    {item}
                  </div>
                ))}
              </div>

              <CtaButton href={CAKTO_URL} block innerStyle={{ padding: "16px 24px", fontSize: 16, fontWeight: 700 }}>
                Quero garantir R$14,90/mês
              </CtaButton>

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
                  {item.p === "Meus dados são vendidos para outras empresas?" ? (
                    <>
                      {item.r} Veja todos os detalhes na nossa{" "}
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
      {/* CTA FINAL — bookend do Hero: volta pro dark e termina "grande"
          (auditoria de direção de arte apontou essa dobra como a mais
          fraca — bloco de texto centralizado genérico, sem escala nem
          entrada diferenciada). Gradiente final escurecido (era
          #0a2e18, um verde bem saturado — mesmo problema já corrigido
          no Hero: sem nada por cima suavizando, virava a dobra mais
          "verde" da página, contradizendo a própria regra de verde só
          em ponto de ação). */}
      {/* ══════════════════════════════════════ */}
      <section className="qz-section" style={{ background: "linear-gradient(160deg, #020d06 0%, #041209 55%, #030a05 100%)", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: "600px", height: "400px", maxWidth: "150vw",
          background: "radial-gradient(ellipse, rgba(34,224,122,0.12) 0%, transparent 70%)",
        }} />
        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <h2 style={{ margin: "0 0 20px", color: "#fff" }}>
            <span className="qz-reveal qz-close-light" style={{ "--qz-delay": "0ms" } as React.CSSProperties}>
              Descubra hoje quanto do seu dinheiro
            </span>
            <span className="qz-reveal qz-close-heavy" style={{ "--qz-delay": "90ms" } as React.CSSProperties}>
              é realmente <span style={{ color: "#22e07a" }}>seu.</span>
            </span>
          </h2>
          <p className="qz-reveal" style={{ margin: "0 0 32px", fontSize: 14, color: "#4ade80", "--qz-delay": "180ms" } as React.CSSProperties}>
            Cancele quando quiser
          </p>
          <div className="qz-reveal" style={{ display: "inline-block", "--qz-delay": "260ms" } as React.CSSProperties}>
            <CtaButton href={CAKTO_URL} innerStyle={{ padding: "18px 48px", fontSize: 18, fontWeight: 800 }}>
              Quero garantir R$14,90/mês
            </CtaButton>
          </div>
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
              <LogoQuitaZap height={28} />
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
