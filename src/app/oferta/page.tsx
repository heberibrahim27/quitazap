// ─────────────────────────────────────────
// QuitaZAP — Landing Page Premium
// Rota: /oferta
// ─────────────────────────────────────────

const CAKTO_URL = process.env.NEXT_PUBLIC_CAKTO_URL ?? "#";

export const metadata = {
  title: "QuitaZAP — Organize suas dívidas com IA pelo WhatsApp",
  description:
    "82,8 milhões de brasileiros estão endividados. O QuitaZAP organiza todas as suas dívidas pelo WhatsApp, calcula seu QuitaScore e monta um plano de quitação simples. A partir de R$29,90/mês.",
  openGraph: {
    title: "QuitaZAP — Organize suas dívidas com IA pelo WhatsApp",
    description: "Diagnóstico financeiro, QuitaScore e plano de quitação direto no WhatsApp.",
    type: "website",
  },
};

const conversa = [
  { lado: "bot", texto: "Olá, Marcos! 👋 Bem-vindo ao QuitaZAP.\n\nSou sua IA de organização financeira. Vou te ajudar a organizar suas dívidas e montar um plano claro de quitação.\n\nMe conta: qual é sua primeira dívida?" },
  { lado: "user", texto: "Cartão de crédito Itaú, uns R$ 4.800" },
  { lado: "bot", texto: "Anotado 📝 Cartão Itaú — R$ 4.800.\n\nEssa é parcelada ou tá acumulando juros rotativos?" },
  { lado: "user", texto: "Rotativo, pago o mínimo todo mês e não cai..." },
  { lado: "bot", texto: "Entendi. Esse é exatamente o problema do rotativo — os juros chegam a 400% ao ano, você paga mas a dívida cresce. Vamos organizar isso.\n\nTem mais dívidas?" },
  { lado: "user", texto: "Sim. Empréstimo pessoal no banco, R$ 12.000, pago R$ 480/mês" },
  { lado: "bot", texto: "✅ Plano de Quitação — Marcos\n━━━━━━━━━━━━━━━\n📊 Suas dívidas:\n• Rotativo Itaú → R$ 4.800 (PRIORIDADE)\n• Empréstimo → R$ 12.000 (R$ 480/mês)\n\nTotal: R$ 16.800\nQuitaScore atual: 340/1000\n\n🎯 Estratégia:\nZere o rotativo PRIMEIRO. A cada R$ 100 que você não paga no rotativo, perde R$ 33 em juros mensais.\n\n📅 Com R$ 600/mês no cartão: livre em 8 meses. Depois, esse valor vai pro empréstimo." },
];

const relatorioPlano = [
  "Avaliar assinaturas e gastos recorrentes",
  "Priorizar dívida menor de R$ 600,00",
  "Evitar novas compras no cartão este mês",
  "Acompanhar vencimentos pelo WhatsApp",
];

const criteriosScore = [
  { icon: "💰", texto: "Comprometimento da renda" },
  { icon: "⚖️", texto: "Equilíbrio do orçamento" },
  { icon: "📉", texto: "Nível de endividamento" },
  { icon: "✅", texto: "Contas em dia" },
  { icon: "🛟", texto: "Reserva de emergência" },
  { icon: "📈", texto: "Evolução mensal" },
];

const dividasPorCategoria = [
  { categoria: "Cartão", valor: "R$ 4.800", pct: 100 },
  { categoria: "Empréstimo", valor: "R$ 3.500", pct: 73 },
  { categoria: "Loja", valor: "R$ 600", pct: 13 },
];

const rendaDistribuicao = [
  { label: "Moradia", pct: 35, cor: "#3b82f6" },
  { label: "Cartões", pct: 30, cor: "#22c55e" },
  { label: "Dívidas", pct: 20, cor: "#ef4444" },
  { label: "Outros", pct: 15, cor: "#94a3b8" },
];

const painelStats = [
  { titulo: "Sobra estimada", valor: "-R$ 530,00", valorColor: "#fca5a5", badge: "Atenção", badgeColor: "#f59e0b" },
  { titulo: "Dívida foco do mês", valor: "Casas Bahia — R$ 600,00", valorColor: "#f8fafc", badge: "Prioridade", badgeColor: "#22c55e" },
  { titulo: "Próximo vencimento", valor: "Nubank — dia 10", valorColor: "#f8fafc", badge: "R$ 1.200,00", badgeColor: "#f59e0b" },
];

const scoreMeses = [
  { mes: "Mês 1", score: 310 },
  { mes: "Mês 2", score: 360 },
  { mes: "Mês 3", score: 420 },
  { mes: "Mês 4", score: 460 },
];
const SCORE_MIN = 250;
const SCORE_MAX = 500;
const CHART_W = 340;
const CHART_H = 170;
const PAD_X = 30;
const PAD_TOP = 34;
const PAD_BOTTOM = 26;
const scorePontos = scoreMeses.map((d, i) => {
  const x = PAD_X + i * ((CHART_W - PAD_X * 2) / (scoreMeses.length - 1));
  const y = (CHART_H - PAD_BOTTOM) - ((d.score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * (CHART_H - PAD_BOTTOM - PAD_TOP);
  return { ...d, x, y };
});

const incluso = [
  "Atendimento financeiro com IA pelo WhatsApp",
  "Diagnóstico financeiro personalizado",
  "Organização de renda, despesas e dívidas",
  "QuitaScore de saúde financeira",
  "Plano de quitação com prioridade",
  "Estratégia Snowball ou Avalanche",
  "Sugestões de ajuste no orçamento",
  "Lembretes de vencimento",
  "Atualizações ilimitadas do plano",
  "Relatórios de evolução",
  "Resumo visual de acompanhamento",
  "Suporte pelo WhatsApp",
  "7 dias de garantia",
  "Cancelamento quando quiser",
];

const faq = [
  { p: "O QuitaZAP é um app que preciso baixar?", r: "Não. Tudo acontece dentro do WhatsApp, que você já usa no dia a dia. Não tem app para baixar nem instalar." },
  { p: "Preciso criar conta?", r: "Não. Depois de assinar, você já recebe a mensagem da IA no WhatsApp e começa a conversar — sem cadastro, sem senha, sem formulário." },
  { p: "O QuitaZAP quita minhas dívidas por mim?", r: "Não. O QuitaZAP organiza suas informações, calcula sua situação financeira e monta um plano de prioridades. O pagamento e a quitação continuam sendo feitos por você." },
  { p: "O resultado é garantido?", r: "Não. O QuitaZAP é uma ferramenta de organização e apoio ao planejamento financeiro. Nenhum resultado é prometido — tudo depende das informações que você envia e das suas ações." },
  { p: "Posso cancelar?", r: "Sim, a qualquer momento, sem multa e sem burocracia. O acesso continua até o fim do período já pago." },
  { p: "Tem garantia?", r: "Sim. Você tem 7 dias de garantia incondicional. Se não fizer sentido para você, devolvemos 100% do valor." },
  { p: "Meus dados ficam seguros?", r: "Sim. Usamos criptografia, seguimos a LGPD e nunca vendemos ou compartilhamos seus dados com terceiros." },
  { p: "Serve para quem está muito endividado?", r: "Sim. Quanto mais dívidas espalhadas, mais o QuitaZAP ajuda a organizar tudo em um só lugar e definir o que priorizar primeiro." },
  { p: "Serve para quem só quer organizar as contas?", r: "Sim. Mesmo sem dívidas, dá para usar o QuitaZAP para organizar renda, despesas fixas e acompanhar as finanças com mais clareza." },
  { p: "O que acontece depois que eu pago?", r: "Você recebe uma mensagem da IA no WhatsApp, conta sua situação financeira e recebe seu diagnóstico, QuitaScore e plano de quitação inicial em poucos minutos." },
];

function QuitaScoreGauge({
  score,
  max = 1000,
  statusLabel,
  statusColor,
  legenda,
}: {
  score: number;
  max?: number;
  statusLabel: string;
  statusColor: string;
  legenda: string;
}) {
  const fraction = Math.min(Math.max(score / max, 0), 1);
  const arcLength = Math.PI * 80;
  const offset = arcLength * (1 - fraction);
  const needleDeg = 180 * fraction - 90;
  const gradId = `quitascore-grad-${score}`;
  const glowId = `quitascore-glow-${score}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{
      textAlign: "center" as const,
      background: "linear-gradient(165deg, #0c1f12 0%, #060a07 100%)",
      border: "1px solid rgba(34,197,94,0.18)",
      borderRadius: 24,
      padding: "26px 28px 24px",
      minWidth: 240,
      position: "relative" as const,
      overflow: "hidden" as const,
      boxShadow: "0 24px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>
      <div style={{
        position: "absolute" as const, top: -70, left: "50%", transform: "translateX(-50%)",
        width: 220, height: 220, borderRadius: "50%",
        background: `radial-gradient(circle, ${statusColor}33 0%, transparent 70%)`,
        pointerEvents: "none" as const,
      }} />
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#86efac", letterSpacing: "0.08em",
        textTransform: "uppercase" as const, marginBottom: 10, position: "relative" as const,
      }}>
        {legenda}
      </div>
      <svg viewBox="0 0 200 130" width="220" height="143" style={{ display: "block", margin: "0 auto", position: "relative" as const }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="33%" stopColor="#f97316" />
            <stop offset="66%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M20,100 A80,80 0 0,1 180,100" stroke="rgba(255,255,255,0.08)" strokeWidth="14" fill="none" strokeLinecap="round" />
        {ticks.map((t) => {
          const ang = (180 - t * 180) * (Math.PI / 180);
          const x1 = 100 + 68 * Math.cos(ang), y1 = 100 - 68 * Math.sin(ang);
          const x2 = 100 + 80 * Math.cos(ang), y2 = 100 - 80 * Math.sin(ang);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" />;
        })}
        <path
          d="M20,100 A80,80 0 0,1 180,100"
          stroke={`url(#${gradId})`}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={offset}
          filter={`url(#${glowId})`}
        />
        <line
          x1="100" y1="100" x2="100" y2="34"
          stroke="#f8fafc" strokeWidth="3" strokeLinecap="round"
          transform={`rotate(${needleDeg} 100 100)`}
        />
        <circle cx="100" cy="100" r="6" fill="#f8fafc" />
      </svg>
      <div style={{ fontSize: 34, fontWeight: 800, color: "#fff", marginTop: -4, letterSpacing: "-1px", position: "relative" as const }}>
        {score}<span style={{ fontSize: 15, color: "#64748b", fontWeight: 600 }}>/{max}</span>
      </div>
      <div style={{
        display: "inline-block", marginTop: 10, padding: "5px 14px", borderRadius: 99,
        background: `${statusColor}22`, color: statusColor, fontSize: 12, fontWeight: 700,
        border: `1px solid ${statusColor}55`, position: "relative" as const,
      }}>
        {statusLabel}
      </div>
    </div>
  );
}

export default function OfertaPage() {
  return (
    <div style={{ background: "#ffffff", minHeight: "100vh", fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: "#0a0a0a", overflowX: "hidden" }}>

      {/* ══════════════════════════════════════ */}
      {/* 1. HERO + 2. MOCKUP WHATSAPP */}
      {/* ══════════════════════════════════════ */}
      <section style={{
        background: "linear-gradient(160deg, #020d06 0%, #041a0c 50%, #0a2e18 100%)",
        padding: "0 24px 80px",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.06,
          backgroundImage: "linear-gradient(#22c55e 1px, transparent 1px), linear-gradient(90deg, #22c55e 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: "-200px", left: "50%", transform: "translateX(-50%)",
          width: "800px", height: "600px",
          background: "radial-gradient(ellipse, rgba(34,197,94,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Nav */}
        <nav style={{
          maxWidth: 1080, margin: "0 auto", padding: "28px 0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "relative", zIndex: 1,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, background: "#22c55e",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652C8.051 23.08 9.993 23.56 12 23.56h.008c6.572 0 11.92-5.334 11.928-11.894 0-3.174-1.25-6.16-3.42-8.217M12.045 21.58h-.007c-1.784 0-3.532-.48-5.057-1.38l-.363-.215-3.76.985 1.006-3.654-.237-.374a9.814 9.814 0 0 1-1.51-5.26c.001-5.45 4.452-9.878 9.92-9.878 2.648 0 5.135 1.03 7.007 2.9a9.836 9.836 0 0 1 2.907 6.988c-.002 5.45-4.455 9.888-9.906 9.888" fill="white"/>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.031-.967-.272-.099-.47-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.668-1.612-.916-2.207-.241-.579-.486-.5-.668-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" fill="white"/>
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 18, color: "#ffffff", letterSpacing: "-0.3px" }}>QuitaZAP</span>
          </div>
          <a href={CAKTO_URL} style={{
            background: "#22c55e", color: "#000", fontWeight: 700,
            fontSize: 13, padding: "9px 20px", borderRadius: 8,
            textDecoration: "none", display: "none",
          }}>
            Assinar agora
          </a>
        </nav>

        {/* Hero content */}
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1, paddingTop: 40 }}>

          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)",
            borderRadius: 99, padding: "6px 16px", marginBottom: 32,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "#86efac", fontWeight: 500 }}>
              IA financeira disponível 24h no WhatsApp
            </span>
          </div>

          <h1 style={{
            margin: "0 0 24px",
            fontSize: "clamp(36px, 6vw, 64px)",
            fontWeight: 800,
            lineHeight: 1.08,
            color: "#ffffff",
            letterSpacing: "-2px",
          }}>
            Pare de perder sono<br />
            <span style={{ color: "#22c55e" }}>por causa das dívidas.</span>
          </h1>

          <p style={{
            margin: "0 0 40px",
            fontSize: "clamp(16px, 2vw, 20px)",
            color: "#94a3b8",
            lineHeight: 1.65,
            maxWidth: 600,
            marginLeft: "auto",
            marginRight: "auto",
          }}>
            O QuitaZAP é uma IA financeira no WhatsApp que organiza suas dívidas, calcula sua situação atual e monta um plano de quitação simples para você saber o que pagar primeiro.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
            <a href={CAKTO_URL} style={{
              background: "#22c55e", color: "#000",
              fontWeight: 700, fontSize: 16,
              padding: "16px 32px", borderRadius: 10,
              textDecoration: "none", display: "inline-block",
            }}>
              Quero meu plano agora — R$ 29,90/mês
            </a>
            <a href="#relatorio" style={{
              background: "rgba(255,255,255,0.07)", color: "#fff",
              fontWeight: 600, fontSize: 16,
              padding: "16px 28px", borderRadius: 10,
              textDecoration: "none", display: "inline-block",
              border: "1px solid rgba(255,255,255,0.1)",
            }}>
              Ver exemplo do relatório
            </a>
          </div>

          {/* Microcopy */}
          <p style={{ margin: 0, fontSize: 13, color: "#64748b", fontWeight: 500 }}>
            7 dias de garantia • Atendimento pelo WhatsApp • Cancele quando quiser • Sem app para baixar
          </p>
        </div>

        {/* Mockup da conversa */}
        <div style={{ maxWidth: 400, margin: "56px auto 0", position: "relative", zIndex: 1 }}>
          <div style={{
            background: "#1a1a1a", borderRadius: 32, padding: "12px",
            border: "1px solid #2a2a2a",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 16px 4px", color: "#fff", fontSize: 11, fontWeight: 600,
            }}>
              <span>23:12</span>
              <span>●●●</span>
            </div>
            <div style={{
              background: "#1f2c34", padding: "10px 14px",
              display: "flex", alignItems: "center", gap: 10,
              borderBottom: "1px solid #2a3942",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "#22c55e", display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652C8.051 23.08 9.993 23.56 12 23.56h.008c6.572 0 11.92-5.334 11.928-11.894 0-3.174-1.25-6.16-3.42-8.217M12.045 21.58h-.007c-1.784 0-3.532-.48-5.057-1.38l-.363-.215-3.76.985 1.006-3.654-.237-.374a9.814 9.814 0 0 1-1.51-5.26c.001-5.45 4.452-9.878 9.92-9.878 2.648 0 5.135 1.03 7.007 2.9a9.836 9.836 0 0 1 2.907 6.988c-.002 5.45-4.455 9.888-9.906 9.888"/>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.031-.967-.272-.099-.47-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.668-1.612-.916-2.207-.241-.579-.486-.5-.668-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
                </svg>
              </div>
              <div>
                <div style={{ color: "#e9edef", fontWeight: 600, fontSize: 14 }}>QuitaZAP IA</div>
                <div style={{ color: "#4ade80", fontSize: 11 }}>● online agora</div>
              </div>
            </div>
            <div style={{
              background: "#0b141a",
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 60L60 0H30L0 30M60 60V30L30 60' fill='%23172028' fill-opacity='0.4'/%3E%3C/svg%3E\")",
              padding: "12px 10px",
              display: "flex", flexDirection: "column" as const, gap: 8,
              maxHeight: 320, overflowY: "auto" as const,
              borderRadius: "0 0 20px 20px",
            }}>
              {conversa.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.lado === "bot" ? "flex-start" : "flex-end" }}>
                  <div style={{
                    maxWidth: "82%",
                    background: msg.lado === "bot" ? "#1f2c34" : "#005c4b",
                    borderRadius: msg.lado === "bot" ? "12px 12px 12px 3px" : "12px 12px 3px 12px",
                    padding: "8px 11px",
                    fontSize: 12,
                    color: "#e9edef",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap" as const,
                  }}>
                    {msg.texto}
                    <div style={{ fontSize: 9, color: "#8696a0", textAlign: "right", marginTop: 4 }}>
                      {["23:12","23:13","23:13","23:14","23:14","23:15"][i]} ✓✓
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 3. ESTATÍSTICAS DO PROBLEMA */}
      {/* ══════════════════════════════════════ */}
      <section style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "32px 24px" }}>
        <div style={{
          maxWidth: 900, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 24, textAlign: "center",
        }}>
          {[
            { num: "82,8M", label: "brasileiros endividados", fonte: "SERASA 2026" },
            { num: "R$ 6.598", label: "dívida média por pessoa", fonte: "SERASA 2026" },
            { num: "78%", label: "ganham até 2 salários mínimos", fonte: "SERASA 2026" },
            { num: "400% a.a.", label: "juros do rotativo do cartão", fonte: "Banco Central" },
          ].map((s) => (
            <div key={s.num} style={{ padding: "4px 0" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-1px" }}>{s.num}</div>
              <div style={{ fontSize: 13, color: "#475569", marginTop: 4, lineHeight: 1.4 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Fonte: {s.fonte}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 4. PROBLEMA */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#ffffff" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>O PROBLEMA</p>
            <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-1px" }}>
              Você sabe que deve.<br />Mas não sabe <em>quanto</em>, <em>para quem</em> e <em>o que fazer primeiro</em>.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {[
              { icon: "😰", titulo: "A dívida cresce sozinha", texto: "Você paga o mínimo do cartão. No mês seguinte, a dívida está igual — ou maior. Parece um buraco sem fundo." },
              { icon: "📅", titulo: "Vencimentos te perseguem", texto: "Você não sabe mais quais boletos vencem essa semana. A angústia de esquecer um pagamento é constante." },
              { icon: "🌀", titulo: "Tudo se mistura", texto: "Cartão, financiamento, empréstimo, cheque especial. Está tudo junto na sua cabeça — e nada está organizado." },
              { icon: "🤯", titulo: "Planilha? Desistiu.", texto: "Tentou montar uma planilha. Ficou complicado, você esqueceu de atualizar. Abandonou na segunda semana." },
              { icon: "😓", titulo: "A vergonha paralisa", texto: "Falar de dívida é difícil. Parece fraqueza. Então você guarda tudo pra si e a situação vai ficando pior." },
              { icon: "🌙", titulo: "Noites de ansiedade", texto: "Você deita e os números aparecem na cabeça. Quanto deve? Consegue pagar? Vai conseguir sair disso?" },
            ].map((item) => (
              <div key={item.titulo} style={{
                background: "#fff", border: "1px solid #f1f5f9",
                borderRadius: 16, padding: "24px 22px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <span style={{ fontSize: 28, display: "block", marginBottom: 12 }}>{item.icon}</span>
                <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{item.titulo}</h3>
                <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>{item.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 5. COMO FUNCIONA */}
      {/* ══════════════════════════════════════ */}
      <section id="como-funciona" style={{ padding: "96px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>COMO FUNCIONA</p>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-1px" }}>
              Do caos financeiro ao plano claro.<br />Em minutos.
            </h2>
            <p style={{ margin: 0, fontSize: 17, color: "#64748b", maxWidth: 480, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
              Você fala pelo WhatsApp como fala com um amigo. A IA cuida do resto.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
            {[
              {
                num: "01",
                titulo: "Assine e receba a mensagem",
                texto: "Segundos após a compra, o QuitaZAP te envia uma mensagem no WhatsApp. Sem cadastro, sem senha, sem app.",
                cor: "#22c55e",
              },
              {
                num: "02",
                titulo: "Conte suas dívidas em texto livre",
                texto: "Fala como quiser: 'cartão Nubank 3 mil', 'financiamento do carro 650 por mês'. A IA entende tudo.",
                cor: "#3b82f6",
              },
              {
                num: "03",
                titulo: "Receba seu diagnóstico e plano",
                texto: "A IA calcula seu QuitaScore, define prioridades e envia um plano claro: o que pagar primeiro, quanto separar e os próximos passos.",
                cor: "#8b5cf6",
              },
            ].map((step) => (
              <div key={step.num} style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 20,
                padding: 32,
                position: "relative",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, color: step.cor,
                  letterSpacing: "0.05em", marginBottom: 20,
                  fontFeatureSettings: '"tnum"',
                }}>
                  PASSO {step.num}
                </div>
                <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>
                  {step.titulo}
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.65 }}>{step.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 6. RELATÓRIO FINANCEIRO — DEMONSTRAÇÃO */}
      {/* ══════════════════════════════════════ */}
      <section id="relatorio" style={{ padding: "96px 24px", background: "#ffffff" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>DEMONSTRAÇÃO</p>
            <h2 style={{ margin: "0 0 12px", fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, letterSpacing: "-1px" }}>
              Veja como o QuitaZAP organiza seus números
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: "#64748b", maxWidth: 460, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
              Você manda as informações pelo WhatsApp. A IA organiza tudo em um resumo claro.
            </p>
          </div>

          <div style={{
            background: "linear-gradient(160deg, #0a0a0a 0%, #0f1a12 100%)", borderRadius: 20, padding: "28px 24px",
            border: "1px solid #1f2937", boxShadow: "0 24px 60px rgba(0,0,0,0.2)", position: "relative", overflow: "hidden",
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)",
              borderRadius: 99, padding: "4px 12px", marginBottom: 18,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "#86efac", fontWeight: 700, letterSpacing: "0.04em" }}>DEMONSTRAÇÃO VISUAL</span>
            </div>
            <pre style={{
              margin: 0, fontFamily: "'Courier New', monospace", fontSize: 13,
              color: "#e2e8f0", lineHeight: 1.8, whiteSpace: "pre-wrap" as const, overflowX: "auto" as const,
            }}>
{`Renda mensal           R$ 3.200,00
Despesas fixas         R$ 1.750,00
Cartões                R$   980,00
Dívidas cadastradas    R$ 4.600,00
────────────────────────────────
Sobra estimada         R$  -530,00`}
            </pre>
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid #1f2937" }}>
              <span style={{ fontFamily: "'Courier New', monospace", fontSize: 13, color: "#facc15", fontWeight: 700 }}>
                QuitaScore: 310/1000 ⚠️ Atenção
              </span>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Resumo</h3>
            <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.7 }}>
              Mariana está gastando mais do que recebe no mês. O primeiro passo sugerido é reduzir gastos variáveis e organizar a menor dívida para tentar liberar parcela mais rápido.
            </p>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Plano inicial</h3>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
              {relatorioPlano.map((item, i) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
                    background: "#f0fdf4", color: "#16a34a", fontSize: 12, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, paddingTop: 1 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <p style={{ marginTop: 24, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
            Dados demonstrativos. O resultado real depende das informações enviadas pelo usuário.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 7. QUITASCORE */}
      {/* ══════════════════════════════════════ */}
      <section id="quitascore" style={{ padding: "96px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>QUITASCORE</p>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-1px" }}>
              Sua saúde financeira em um número.
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: "#64748b", maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
              O QuitaScore ajuda você a visualizar sua saúde financeira e acompanhar sua evolução.
            </p>
          </div>

          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "center", gap: 20, flexWrap: "wrap",
          }}>
            <QuitaScoreGauge score={310} statusLabel="Atenção" statusColor="#f59e0b" legenda="Antes da organização" />
            <div style={{
              display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 6,
              color: "#22c55e", fontWeight: 800,
            }}>
              <span style={{ fontSize: 26 }}>→</span>
              <span style={{
                fontSize: 12, background: "#f0fdf4", color: "#16a34a", padding: "4px 12px",
                borderRadius: 99, whiteSpace: "nowrap" as const, fontWeight: 700,
                border: "1px solid #bbf7d0",
              }}>+150 pontos</span>
            </div>
            <QuitaScoreGauge score={460} statusLabel="Em evolução" statusColor="#22c55e" legenda="Depois de organizar" />
          </div>

          <p style={{ marginTop: 20, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
            Demonstração visual. A evolução real depende das informações e ações do usuário.
          </p>

          <div style={{ marginTop: 48 }}>
            <p style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 20 }}>
              O QuitaScore é calculado com base em:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {criteriosScore.map((c) => (
                <div key={c.texto} style={{
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                  padding: "14px 16px", display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontSize: 18 }}>{c.icon}</span>
                  <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{c.texto}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 8. PAINEL — VISÃO GERAL */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#ffffff" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>VISÃO GERAL</p>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-1px" }}>
              Seu dinheiro vira um resumo claro.
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: "#64748b", maxWidth: 560, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
              Você manda as informações pelo WhatsApp e o QuitaZAP organiza tudo em um resumo simples de entender.
            </p>
          </div>

          {/* Dashboard card */}
          <div style={{
            background: "linear-gradient(165deg, #0c1f12 0%, #060a07 100%)",
            border: "1px solid rgba(34,197,94,0.18)",
            borderRadius: 28,
            padding: "32px 24px",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 30px 70px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}>
            <div style={{
              position: "absolute", top: -120, right: -90, width: 320, height: 320, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(34,197,94,0.18) 0%, transparent 70%)",
              pointerEvents: "none" as const,
            }} />
            <div style={{
              position: "absolute", bottom: -140, left: -100, width: 320, height: 320, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)",
              pointerEvents: "none" as const,
            }} />

            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)",
              borderRadius: 99, padding: "6px 14px", marginBottom: 24, position: "relative" as const,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "#86efac", fontWeight: 700, letterSpacing: "0.05em" }}>RESUMO QUITAZAP — VISÃO ORGANIZADA</span>
            </div>

            {/* Stat cards */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14,
              marginBottom: 16, position: "relative" as const,
            }}>
              {painelStats.map((s) => (
                <div key={s.titulo} style={{
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16, padding: "18px 18px",
                }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" as const, marginBottom: 10 }}>
                    {s.titulo}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: s.valorColor, marginBottom: 12, letterSpacing: "-0.3px", lineHeight: 1.3 }}>
                    {s.valor}
                  </div>
                  <div style={{
                    display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                    background: `${s.badgeColor}22`, color: s.badgeColor, border: `1px solid ${s.badgeColor}55`,
                  }}>
                    {s.badge}
                  </div>
                </div>
              ))}
            </div>

            {/* Gráficos */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14,
              position: "relative" as const,
            }}>
              {/* Barras: dívidas por categoria */}
              <div style={{ background: "#0c1a11", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24 }}>
                <h3 style={{ margin: "0 0 22px", fontSize: 13, fontWeight: 700, color: "#f8fafc", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                  Dívidas por categoria
                </h3>
                {dividasPorCategoria.map((d) => (
                  <div key={d.categoria} style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, color: "#cbd5e1" }}>{d.categoria}</span>
                      <span style={{ fontWeight: 800, color: "#fff" }}>{d.valor}</span>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, height: 14, overflow: "hidden" }}>
                      <div style={{
                        width: `${d.pct}%`, height: "100%", borderRadius: 8,
                        background: "linear-gradient(90deg,#16a34a,#4ade80)",
                        boxShadow: "0 0 14px rgba(34,197,94,0.45)",
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Donut: para onde vai a renda */}
              <div style={{ background: "#0c1a11", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24 }}>
                <h3 style={{ margin: "0 0 22px", fontSize: 13, fontWeight: 700, color: "#f8fafc", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                  Para onde vai sua renda
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" as const }}>
                  <div style={{
                    position: "relative", width: 160, height: 160, borderRadius: "50%", flexShrink: 0,
                    boxShadow: "0 0 30px rgba(34,197,94,0.15)",
                    background: `conic-gradient(${rendaDistribuicao.map((r, i) => {
                      const start = rendaDistribuicao.slice(0, i).reduce((acc, x) => acc + x.pct, 0);
                      return `${r.cor} ${start}% ${start + r.pct}%`;
                    }).join(", ")})`,
                  }}>
                    <div style={{
                      position: "absolute", inset: 28, background: "#0c1a11", borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" as const,
                    }}>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>Renda</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>100%</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                    {rendaDistribuicao.map((r) => (
                      <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: r.cor, flexShrink: 0, boxShadow: `0 0 6px ${r.cor}` }} />
                        <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{r.label}</span>
                        <span style={{ color: "#64748b" }}>{r.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Linha: evolução do score */}
              <div style={{ background: "#0c1a11", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#f8fafc", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                  QuitaScore mês a mês
                </h3>
                <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} width="100%" height="170" style={{ display: "block" }}>
                  <defs>
                    <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon
                    points={`${scorePontos[0].x},${CHART_H - PAD_BOTTOM} ${scorePontos.map((p) => `${p.x},${p.y}`).join(" ")} ${scorePontos[scorePontos.length - 1].x},${CHART_H - PAD_BOTTOM}`}
                    fill="url(#scoreAreaGrad)"
                  />
                  <polyline
                    points={scorePontos.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none" stroke="#22c55e" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                  {scorePontos.map((p) => (
                    <g key={p.mes}>
                      <circle cx={p.x} cy={p.y} r="5" fill="#22c55e" stroke="#0c1a11" strokeWidth="2" />
                      <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill="#f8fafc">{p.score}</text>
                      <text x={p.x} y={CHART_H - 4} textAnchor="middle" fontSize="10" fill="#64748b">{p.mes}</text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          </div>

          <p style={{ marginTop: 24, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
            Dados demonstrativos. Os valores reais dependem das informações enviadas pelo usuário.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 9. O QUE ESTÁ INCLUSO */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>O QUE ESTÁ INCLUSO</p>
            <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-1px" }}>
              Tudo no seu plano, sem letra miúda.
            </h2>
          </div>

          <div style={{
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, padding: "32px 28px",
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px 24px",
          }}>
            {incluso.map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ color: "#22c55e", fontWeight: 800, flexShrink: 0, fontSize: 15 }}>✓</span>
                <span style={{ fontSize: 14, color: "#374151", fontWeight: 500, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 10. IA FINANCEIRA NO BOLSO */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#020d06" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>INTELIGÊNCIA ARTIFICIAL</p>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-1px", color: "#fff" }}>
              Uma IA de organização financeira no seu bolso.<br />
              <span style={{ color: "#22c55e" }}>Disponível às 3h da manhã.</span>
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: "#64748b", maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
              A IA não julga. Não cobra por hora. Não tem horário. E entende exatamente o que você está passando.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {[
              { icon: "🧠", titulo: "Entende linguagem natural", texto: "Fala do jeito que você fala. 'Devo uns 4 mil no banco' já é suficiente — a IA extrai tudo o que precisa." },
              { icon: "⚡", titulo: "Prioridade inteligente", texto: "Ela compara as taxas de juros de cada dívida e sugere qual priorizar para você perder menos dinheiro." },
              { icon: "📊", titulo: "Plano realista", texto: "Leva em conta sua renda e monta um plano que você consegue acompanhar — não um que parece bonito mas é impossível na prática." },
              { icon: "🔄", titulo: "Atualiza sempre", texto: "Pagou uma dívida? Mudou a renda? Manda no WhatsApp e a IA recalcula o plano na hora." },
              { icon: "💬", titulo: "Tira dúvidas", texto: "'Vale a pena parcelar no cartão?' 'Devo priorizar o cheque especial?' — perguntas reais, respostas diretas." },
              { icon: "🌙", titulo: "24 horas, 7 dias", texto: "Sem agenda, sem lista de espera. Quando a ansiedade bater, a IA está lá para te dar clareza." },
            ].map((item) => (
              <div key={item.titulo} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, padding: "22px 20px",
              }}>
                <span style={{ fontSize: 24, display: "block", marginBottom: 10 }}>{item.icon}</span>
                <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>{item.titulo}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{item.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 11. COMPARATIVO */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#ffffff" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>COMPARATIVO</p>
            <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-1px" }}>
              Por que o QuitaZAP e não outra solução?
            </h2>
          </div>

          <div style={{ overflowX: "auto" as const }}>
            <table style={{ width: "100%", borderCollapse: "collapse" as const, minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ padding: "14px 16px", textAlign: "left", fontSize: 13, color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}></th>
                  {["Planilha", "App comum", "Consultor", "QuitaZAP"].map((col, i) => (
                    <th key={col} style={{
                      padding: "14px 16px", textAlign: "center", fontSize: 13,
                      fontWeight: 700, borderBottom: "1px solid #e2e8f0",
                      color: i === 3 ? "#16a34a" : "#0f172a",
                      background: i === 3 ? "#f0fdf4" : "transparent",
                      borderRadius: i === 3 ? "8px 8px 0 0" : 0,
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Fácil de usar", "❌", "✅", "✅", "✅"],
                  ["Personalizado para você", "❌", "❌", "✅", "✅"],
                  ["Pelo WhatsApp", "❌", "❌", "❌", "✅"],
                  ["Disponível 24h", "❌", "✅", "❌", "✅"],
                  ["Prioridade de pagamento", "❌", "❌", "✅", "✅"],
                  ["Sem app pra baixar", "❌", "❌", "✅", "✅"],
                  ["Preço acessível", "✅", "✅", "❌", "✅"],
                  ["QuitaScore incluso", "❌", "❌", "❌", "✅"],
                ].map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "#374151", fontWeight: 500 }}>{row[0]}</td>
                    {row.slice(1).map((val, ci) => (
                      <td key={ci} style={{
                        padding: "14px 16px", textAlign: "center", fontSize: 18,
                        background: ci === 3 ? "#f0fdf4" : "transparent",
                      }}>{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 12. PREÇO */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>PREÇO</p>
          <h2 style={{ margin: "0 0 12px", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-1px" }}>
            Simples como deveria ser.
          </h2>
          <p style={{ margin: "0 0 48px", fontSize: 16, color: "#64748b", lineHeight: 1.6 }}>
            Um plano. Sem cobrança por dívida, sem tier, sem surpresa.
          </p>

          <div style={{
            background: "#fff",
            border: "2px solid #22c55e",
            borderRadius: 24,
            padding: "40px 36px",
            boxShadow: "0 0 0 8px rgba(34,197,94,0.07)",
            textAlign: "left",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>ACESSO COMPLETO</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>QuitaZAP</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: "#0f172a", letterSpacing: "-1px", lineHeight: 1 }}>R$ 29,90</div>
                <div style={{ fontSize: 14, color: "#94a3b8" }}>/mês</div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 24, marginBottom: 28 }}>
              {[
                "Diagnóstico financeiro personalizado",
                "QuitaScore de saúde financeira",
                "Plano de quitação com prioridade",
                "Lembretes de vencimento",
                "Atualizações ilimitadas do plano",
                "Suporte pelo próprio WhatsApp",
                "Cancelamento a qualquer momento",
              ].map((item) => (
                <div key={item} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  fontSize: 14, color: "#374151", marginBottom: 10,
                }}>
                  <span style={{ color: "#22c55e", fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {item}
                </div>
              ))}
            </div>

            <a href={CAKTO_URL} style={{
              display: "block",
              background: "#22c55e", color: "#000",
              fontWeight: 700, fontSize: 16,
              padding: "16px 24px", borderRadius: 12,
              textDecoration: "none", textAlign: "center",
            }}>
              Assinar por R$ 29,90/mês
            </a>

            <p style={{ margin: "12px 0 0", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
              7 dias de garantia. Cancele quando quiser.
            </p>

            <div style={{
              marginTop: 16,
              background: "#f8fafc", border: "1px solid #e2e8f0",
              borderRadius: 10, padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 22 }}>🛡️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Garantia incondicional de 7 dias</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  Não gostou por qualquer razão? Reembolso de 100%, sem perguntas.
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 32, padding: "20px 24px", background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Compare o custo:</div>
            {[
              { label: "Consultor financeiro humano", valor: "R$ 500–800/mês", strike: true },
              { label: "Continuar pagando só o mínimo do cartão", valor: "R$ ∞ em juros", strike: true },
              { label: "QuitaZAP", valor: "R$ 29,90/mês", strike: false },
            ].map((item) => (
              <div key={item.label} style={{
                display: "flex", justifyContent: "space-between",
                fontSize: 13, color: item.strike ? "#94a3b8" : "#0f172a",
                textDecoration: item.strike ? "line-through" : "none",
                padding: "6px 0",
                fontWeight: item.strike ? 400 : 700,
              }}>
                <span>{item.label}</span>
                <span style={{ color: item.strike ? "#94a3b8" : "#22c55e" }}>{item.valor}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 13. SEGURANÇA */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "64px 24px", background: "#ffffff" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" }}>🔒 Seus dados protegidos</h2>
          <p style={{ margin: "0 0 40px", fontSize: 15, color: "#64748b", lineHeight: 1.6 }}>
            Segurança não é diferencial. É obrigação.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
            {[
              { icon: "🔐", texto: "Criptografia ponta a ponta" },
              { icon: "📜", texto: "LGPD compliant" },
              { icon: "🚫", texto: "Nunca vendemos seus dados" },
              { icon: "🏦", texto: "Servidores certificados" },
              { icon: "👤", texto: "Sem acesso bancário" },
              { icon: "🗑️", texto: "Exclusão de dados a pedido" },
            ].map((item) => (
              <div key={item.texto} style={{
                background: "#f8fafc", border: "1px solid #e2e8f0",
                borderRadius: 12, padding: "18px 14px",
                display: "flex", flexDirection: "column" as const,
                alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <span style={{ fontSize: 12, color: "#374151", fontWeight: 600, textAlign: "center", lineHeight: 1.4 }}>{item.texto}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 14. FAQ */}
      {/* ══════════════════════════════════════ */}
      <section id="faq" style={{ padding: "96px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>DÚVIDAS</p>
            <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-1px" }}>
              Perguntas frequentes
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
            {faq.map((item, i) => (
              <details key={i} style={{
                background: i % 2 === 0 ? "#fff" : "#fafafa",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                overflow: "hidden",
              }}>
                <summary style={{
                  padding: "18px 20px",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#0f172a",
                  cursor: "pointer",
                  listStyle: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  {item.p}
                  <span style={{ fontSize: 18, color: "#94a3b8", flexShrink: 0, marginLeft: 12 }}>+</span>
                </summary>
                <div style={{
                  padding: "0 20px 18px",
                  fontSize: 14,
                  color: "#64748b",
                  lineHeight: 1.65,
                }}>
                  {item.r}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 15. CTA FINAL */}
      {/* ══════════════════════════════════════ */}
      <section style={{
        padding: "96px 24px",
        background: "linear-gradient(160deg, #020d06 0%, #041a0c 50%, #0a2e18 100%)",
        position: "relative", overflow: "hidden",
        textAlign: "center",
      }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "600px", height: "400px",
          background: "radial-gradient(ellipse, rgba(34,197,94,0.1) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <h2 style={{
            margin: "0 0 20px",
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.1,
            letterSpacing: "-1.5px",
          }}>
            Chega de noites perdidas<br />pensando em dívida.
          </h2>
          <p style={{ margin: "0 0 12px", fontSize: 17, color: "#94a3b8", lineHeight: 1.6 }}>
            Você merece saber exatamente onde está e o que fazer. O QuitaZAP te dá esse mapa.
          </p>
          <p style={{ margin: "0 0 40px", fontSize: 14, color: "#4ade80" }}>
            Plano em minutos · 7 dias de garantia · Cancele quando quiser
          </p>

          <a href={CAKTO_URL} style={{
            display: "inline-block",
            background: "#22c55e", color: "#000",
            fontWeight: 800, fontSize: 18,
            padding: "18px 48px", borderRadius: 12,
            textDecoration: "none",
          }}>
            Começar agora — R$ 29,90/mês
          </a>

          <p style={{ marginTop: 16, fontSize: 13, color: "#475569" }}>
            Sem taxa de adesão · Sem fidelidade · Garantia de 7 dias
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* 16. RODAPÉ */}
      {/* ══════════════════════════════════════ */}
      <footer style={{ background: "#0a0a0a", padding: "40px 24px", borderTop: "1px solid #1a1a1a" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7, background: "#22c55e",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652C8.051 23.08 9.993 23.56 12 23.56h.008c6.572 0 11.92-5.334 11.928-11.894 0-3.174-1.25-6.16-3.42-8.217M12.045 21.58h-.007c-1.784 0-3.532-.48-5.057-1.38l-.363-.215-3.76.985 1.006-3.654-.237-.374a9.814 9.814 0 0 1-1.51-5.26c.001-5.45 4.452-9.878 9.92-9.878 2.648 0 5.135 1.03 7.007 2.9a9.836 9.836 0 0 1 2.907 6.988c-.002 5.45-4.455 9.888-9.906 9.888"/>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.031-.967-.272-.099-.47-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.668-1.612-.916-2.207-.241-.579-.486-.5-.668-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
                </svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>QuitaZAP</span>
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {["Início", "Como funciona", "Preço", "FAQ"].map((link) => (
                <a key={link} href={`#${link.toLowerCase().replace(" ", "-")}`} style={{ fontSize: 13, color: "#475569", textDecoration: "none" }}>{link}</a>
              ))}
            </div>
          </div>
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 20 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
              © 2026 QuitaZAP. Todos os direitos reservados.
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
