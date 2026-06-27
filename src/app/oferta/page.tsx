// ─────────────────────────────────────────
// QuitaZAP — Landing Page Premium
// Rota: /oferta
// ─────────────────────────────────────────

const CAKTO_URL = process.env.NEXT_PUBLIC_CAKTO_URL ?? "#";

export const metadata = {
  title: "QuitaZAP — Saia das dívidas com inteligência artificial pelo WhatsApp",
  description:
    "82,8 milhões de brasileiros estão endividados. O QuitaZAP organiza todas as suas dívidas pelo WhatsApp, usa IA para criar um plano real de quitação e te mostra exatamente o que fazer. Comece agora por R$29,90/mês.",
  openGraph: {
    title: "QuitaZAP — Saia das dívidas com inteligência artificial",
    description: "Organize suas dívidas pelo WhatsApp e receba um plano real de quitação em minutos.",
    type: "website",
  },
};

const conversa = [
  { lado: "bot", texto: "Olá, Marcos! 👋 Bem-vindo ao QuitaZAP.\n\nSou sua IA consultora financeira. Vou te ajudar a organizar suas dívidas e criar um plano claro de quitação.\n\nMe conta: qual é sua primeira dívida?" },
  { lado: "user", texto: "Cartão de crédito Itaú, uns R$ 4.800" },
  { lado: "bot", texto: "Anotado 📝 Cartão Itaú — R$ 4.800.\n\nEssa é parcelada ou tá acumulando juros rotativos?" },
  { lado: "user", texto: "Rotativo, pago o mínimo todo mês e não cai..." },
  { lado: "bot", texto: "Entendi. Esse é exatamente o problema do rotativo — os juros chegam a 400% ao ano, você paga mas a dívida cresce. Vamos resolver isso.\n\nTem mais dívidas?" },
  { lado: "user", texto: "Sim. Empréstimo pessoal no banco, R$ 12.000, pago R$ 480/mês" },
  { lado: "bot", texto: "✅ Plano de Quitação — Marcos\n━━━━━━━━━━━━━━━\n📊 Suas dívidas:\n• Rotativo Itaú → R$ 4.800 (PRIORIDADE)\n• Empréstimo → R$ 12.000 (R$ 480/mês)\n\nTotal: R$ 16.800\n\n🎯 Estratégia:\nZere o rotativo PRIMEIRO. A cada R$ 100 que você não paga no rotativo, perde R$ 33 em juros mensais. É o que mais te sangra.\n\n📅 Com R$ 600/mês no cartão: livre em 8 meses. Depois, todo esse valor vai pro empréstimo e você quita 14 meses antes.\n\nVocê consegue. Vamos juntos. 💪" },
];

const faq = [
  { p: "O QuitaZAP é um app que preciso baixar?", r: "Não. Tudo acontece pelo WhatsApp, que você já tem no celular. Não precisa instalar nada, criar conta em nenhum app nem aprender interface nova." },
  { p: "Como funciona na prática?", r: "Após assinar, você recebe uma mensagem no WhatsApp. Conta suas dívidas em texto natural — sem formato específico. A IA organiza tudo e envia seu plano de quitação em minutos." },
  { p: "Preciso ter conhecimento financeiro?", r: "Zero. A IA foi projetada para entender linguagem do dia a dia. Você fala como fala com um amigo — 'devo uns 3 mil no cartão' — e ela entende tudo." },
  { p: "E se eu tiver muitas dívidas?", r: "Quanto mais dívidas, mais o QuitaZAP ajuda. A IA prioriza automaticamente quais pagar primeiro para você perder menos dinheiro em juros." },
  { p: "O QuitaZAP negocia minha dívida?", r: "Não negociamos com credores. O QuitaZAP organiza suas informações e cria o plano — a decisão e execução são sempre suas." },
  { p: "Meus dados ficam seguros?", r: "Sim. Usamos criptografia de ponta a ponta, servidores com certificação internacional e seguimos rigorosamente a LGPD. Seus dados nunca são vendidos ou compartilhados." },
  { p: "O plano funciona para todo tipo de dívida?", r: "Sim — cartão de crédito, cheque especial, empréstimo pessoal, financiamento, boleto em atraso, dívida com familiar, negociação. A IA entende todos os cenários." },
  { p: "E se eu não gostar?", r: "Garantia incondicional de 7 dias. Se por qualquer motivo não gostar, devolvemos 100% do valor — sem burocracia, sem perguntas." },
  { p: "Com que frequência posso usar?", r: "Sem limites. Pode conversar com a IA sempre que precisar: atualizar dívidas, tirar dúvidas, revisar o plano, pedir nova análise." },
  { p: "O preço muda?", r: "R$ 29,90/mês é o preço fixo. Sem taxa de adesão, sem cobrança por dívida, sem surpresas na fatura." },
  { p: "Posso cancelar quando quiser?", r: "Sim. Cancela com um clique, sem multa, sem período mínimo, sem burocracia. O acesso continua até o fim do período pago." },
  { p: "E se eu pagar uma dívida — atualizo no QuitaZAP?", r: "Sim. Pode mandar a atualização pelo WhatsApp a qualquer hora e a IA recalcula o plano com os novos números." },
  { p: "Funciona para pessoa jurídica?", r: "O QuitaZAP é focado em finanças pessoais. Para dívidas empresariais, recomendamos um contador." },
  { p: "Preciso informar senha ou dados bancários?", r: "Jamais. Nunca pedimos senhas, acesso a conta bancária, CPF completo ou qualquer dado sensível além do que você escolhe compartilhar." },
  { p: "A IA substitui um consultor financeiro?", r: "Para organizar dívidas e criar um plano inicial, sim — e a uma fração do custo. Consultores humanos cobram R$ 500–800/mês. O QuitaZAP faz o mesmo por R$ 29,90." },
  { p: "O que é a estratégia Snowball?", r: "É quitar primeiro as menores dívidas para ganhar impulso psicológico. A IA analisa seu perfil e pode recomendar Snowball ou Avalanche (maior juros primeiro) — o que for melhor para você." },
  { p: "Em quanto tempo recebo meu plano?", r: "Em média, 5 a 15 minutos depois de mandar suas dívidas. A IA processa tudo em tempo real." },
  { p: "Posso usar no computador também?", r: "O QuitaZAP funciona pelo WhatsApp — seja no celular, tablet ou WhatsApp Web no computador." },
  { p: "E se eu não tiver renda fixa?", r: "A IA adapta o plano para renda variável. Você informa o mínimo mensal garantido e ela cria um plano conservador e realista." },
  { p: "O sistema funciona 24 horas?", r: "Sim. A IA não tem horário. Você pode mandar mensagem às 2h da madrugada — quando a ansiedade bate — e ela responde na hora." },
];

export default function OfertaPage() {
  return (
    <div style={{ background: "#ffffff", minHeight: "100vh", fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: "#0a0a0a", overflowX: "hidden" }}>

      {/* ══════════════════════════════════════ */}
      {/* HERO */}
      {/* ══════════════════════════════════════ */}
      <section style={{
        background: "linear-gradient(160deg, #020d06 0%, #041a0c 50%, #0a2e18 100%)",
        padding: "0 24px 80px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Grid decorativo */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.06,
          backgroundImage: "linear-gradient(#22c55e 1px, transparent 1px), linear-gradient(90deg, #22c55e 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }} />
        {/* Glow */}
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

          {/* Badge */}
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
            <span style={{ color: "#22c55e" }}>por causa de dívidas.</span>
          </h1>

          <p style={{
            margin: "0 0 16px",
            fontSize: "clamp(16px, 2vw, 20px)",
            color: "#94a3b8",
            lineHeight: 1.65,
            maxWidth: 560,
            marginLeft: "auto",
            marginRight: "auto",
          }}>
            O QuitaZAP usa inteligência artificial para organizar todas as suas dívidas pelo WhatsApp e criar um plano real e personalizado para você sair do vermelho.
          </p>

          <p style={{ margin: "0 0 40px", fontSize: 14, color: "#4ade80" }}>
            82,8 milhões de brasileiros endividados. Você não está sozinho — mas pode estar à frente.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 }}>
            <a href={CAKTO_URL} style={{
              background: "#22c55e", color: "#000",
              fontWeight: 700, fontSize: 16,
              padding: "15px 36px", borderRadius: 10,
              textDecoration: "none", display: "inline-block",
            }}>
              Quero meu plano agora
            </a>
            <a href="#como-funciona" style={{
              background: "rgba(255,255,255,0.07)", color: "#fff",
              fontWeight: 600, fontSize: 16,
              padding: "15px 28px", borderRadius: 10,
              textDecoration: "none", display: "inline-block",
              border: "1px solid rgba(255,255,255,0.1)",
            }}>
              Ver como funciona ↓
            </a>
          </div>

          {/* Trust indicators */}
          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            gap: 20, flexWrap: "wrap",
          }}>
            {["🔒 LGPD compliant", "🛡️ 7 dias de garantia", "⚡ Plano em minutos", "💬 Pelo WhatsApp"].map((item) => (
              <span key={item} style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>{item}</span>
            ))}
          </div>
        </div>

        {/* Mockup da conversa */}
        <div style={{ maxWidth: 400, margin: "56px auto 0", position: "relative", zIndex: 1 }}>
          {/* Phone frame */}
          <div style={{
            background: "#1a1a1a", borderRadius: 32, padding: "12px",
            border: "1px solid #2a2a2a",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
          }}>
            {/* Status bar */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 16px 4px", color: "#fff", fontSize: 11, fontWeight: 600,
            }}>
              <span>23:12</span>
              <span>●●●</span>
            </div>
            {/* WhatsApp header */}
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
            {/* Chat */}
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
      {/* STATS BAR */}
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
      {/* PROBLEMA */}
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
      {/* SOLUÇÃO / COMO FUNCIONA */}
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
                titulo: "Receba seu plano personalizado",
                texto: "A IA analisa seu perfil, define prioridades e envia um plano claro: o que pagar primeiro, quanto separar e quando você fica livre.",
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
      {/* SEÇÃO IA */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#020d06" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>INTELIGÊNCIA ARTIFICIAL</p>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-1px", color: "#fff" }}>
              Uma consultora financeira no seu bolso.<br />
              <span style={{ color: "#22c55e" }}>Disponível às 3h da manhã.</span>
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: "#64748b", maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
              A IA não julga. Não cobra por hora. Não tem horário. E entende exatamente o que você está passando.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {[
              { icon: "🧠", titulo: "Entende linguagem natural", texto: "Fala do jeito que você fala. 'Devo uns 4 mil no banco' já é suficiente — a IA extrai tudo o que precisa." },
              { icon: "⚡", titulo: "Prioridade inteligente", texto: "Ela compara as taxas de juros de cada dívida e define qual pagar primeiro para você perder menos dinheiro." },
              { icon: "📊", titulo: "Plano realista", texto: "Leva em conta sua renda e cria um plano que você consegue cumprir — não um que parece bonito mas é impossível na prática." },
              { icon: "🔄", titulo: "Atualiza sempre", texto: "Pagou uma dívida? Mudou a renda? Manda no WhatsApp e a IA recalcula o plano na hora." },
              { icon: "💬", titulo: "Tira dúvidas", texto: "'Vale a pena parcelar no cartão?' 'Devo quitar o cheque especial primeiro?' — perguntas reais, respostas diretas." },
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
      {/* COMPARATIVO */}
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
                  ["Plano em minutos", "❌", "❌", "❌", "✅"],
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
      {/* BENEFÍCIOS */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>O QUE VOCÊ GANHA</p>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-1px" }}>
              Não é só organização. É liberdade.
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: "#64748b", maxWidth: 480, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
              Cada funcionalidade foi pensada para devolver uma coisa que a dívida rouba: o controle.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {[
              { func: "Plano de quitação personalizado", benef: "Você sabe exatamente o que fazer. Sem achismo, sem tentativa e erro." },
              { func: "Prioridade inteligente de dívidas", benef: "Para de perder dinheiro em juros que poderiam ser evitados com a ordem certa." },
              { func: "Estratégia Snowball ou Avalanche", benef: "A IA escolhe a estratégia certa para o seu perfil — mais velocidade ou mais economia." },
              { func: "Previsão de quitação", benef: "Você vê a luz no fim do túnel. Uma data real, não uma esperança vaga." },
              { func: "Atualização em tempo real", benef: "Pagou uma conta? O plano se atualiza. Você sempre tem a versão mais precisa." },
              { func: "IA disponível 24h", benef: "A ansiedade não espera o horário comercial. A IA também não." },
            ].map((item, i) => (
              <div key={i} style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 16, padding: "24px 22px",
              }}>
                <div style={{
                  display: "inline-block",
                  background: "#f0fdf4", color: "#15803d",
                  fontSize: 11, fontWeight: 700, padding: "4px 10px",
                  borderRadius: 6, marginBottom: 12, letterSpacing: "0.03em",
                }}>
                  {item.func}
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.65, fontWeight: 500 }}>
                  {item.benef}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* PREÇO */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#ffffff" }}>
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
                "Plano de quitação personalizado",
                "IA consultora financeira 24h",
                "Estratégia Snowball ou Avalanche",
                "Previsão de quitação mês a mês",
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

            {/* Garantia */}
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

          {/* Comparação de valor */}
          <div style={{ marginTop: 32, padding: "20px 24px", background: "#f8fafc", borderRadius: 14, border: "1px solid #e2e8f0", textAlign: "left" }}>
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
      {/* SEGURANÇA */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "64px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
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
                background: "#fff", border: "1px solid #e2e8f0",
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
      {/* FAQ */}
      {/* ══════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#ffffff" }}>
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
      {/* CTA FINAL */}
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
            Você merece saber exatamente onde está e o que fazer. O QuitaZAP dá esse mapa.
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
      {/* FOOTER */}
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
            <p style={{ margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
              © 2026 QuitaZAP. Todos os direitos reservados. · O QuitaZAP não é uma consultoria financeira regulamentada. Não promete limpar nome, reduzir dívida ou garantir desconto. O serviço organiza informações e auxilia no planejamento — a decisão e execução são do usuário. Nenhum resultado financeiro é garantido. Dados: SERASA Experian, Mapa da Inadimplência 2026.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
