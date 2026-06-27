// ─────────────────────────────────────────
// QuitaZAP — Página pública de oferta
// Rota: /oferta
// Para alterar o WhatsApp, edite WHATSAPP_OFERTA no arquivo .env
// ─────────────────────────────────────────

const WHATSAPP_NUMBER = process.env.WHATSAPP_OFERTA ?? "5511999999999";
const WHATSAPP_MESSAGE = encodeURIComponent(
  "Olá! Quero organizar minhas dívidas com o QuitaZAP. Pode me ajudar?"
);
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

export const metadata = {
  title: "QuitaZAP — Organize suas dívidas pelo WhatsApp",
  description:
    "Envie suas dívidas, boletos, acordos e parcelas. O QuitaZAP organiza tudo e mostra o que pagar primeiro, quanto separar por semana e uma previsão inicial para sair do vermelho.",
};

export default function OfertaPage() {
  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", fontFamily: "Arial, Helvetica, sans-serif", color: "#0f172a" }}>

      {/* ── HERO ── */}
      <section style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", padding: "48px 24px 56px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 40 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16, background: "#16a34a",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="28" height="28" viewBox="0 0 52 52" fill="none">
                <path d="M26 6C14.95 6 6 14.95 6 26C6 37.05 14.95 46 26 46C30.2 46 34.1 44.7 37.3 42.5L44 49L49 44L42.4 37.4C44.5 34.2 46 30.3 46 26C46 14.95 37.05 6 26 6ZM26 14C31.5 14 36 18.5 36 24C36 29.5 31.5 34 26 34C20.5 34 16 29.5 16 24C16 18.5 20.5 14 26 14Z" fill="white"/>
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 28, color: "#0f172a", letterSpacing: "-0.5px" }}>QuitaZAP</span>
          </div>

          {/* Headline */}
          <h1 style={{ margin: "0 0 20px", fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 800, lineHeight: 1.15, color: "#0f172a" }}>
            Organize suas dívidas pelo WhatsApp e receba um plano claro de quitação.
          </h1>
          <p style={{ margin: "0 0 36px", fontSize: 18, color: "#64748b", lineHeight: 1.6, maxWidth: 580, marginLeft: "auto", marginRight: "auto" }}>
            Envie suas dívidas, boletos, acordos e parcelas. O QuitaZAP organiza tudo e mostra o que pagar primeiro, quanto separar por semana e uma previsão inicial para sair do vermelho.
          </p>

          {/* CTA principal */}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              background: "#16a34a",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 18,
              padding: "16px 36px",
              borderRadius: 14,
              textDecoration: "none",
              boxShadow: "0 4px 16px rgba(22,163,74,0.25)",
            }}
          >
            💬 Quero organizar minhas dívidas
          </a>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section style={{ padding: "64px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", margin: "0 0 8px", fontSize: 28, fontWeight: 800 }}>Como funciona</h2>
          <p style={{ textAlign: "center", margin: "0 0 48px", color: "#64748b", fontSize: 16 }}>Simples, rápido e sem complicação.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
            {[
              { num: "1", titulo: "Você envia suas dívidas", texto: "Manda pelo WhatsApp: nome do credor, valor, parcelas, vencimentos. Sem precisar baixar nada." },
              { num: "2", titulo: "Nós organizamos tudo", texto: "Cadastramos cada dívida, boleto e acordo no sistema e calculamos o saldo real." },
              { num: "3", titulo: "Você recebe um plano", texto: "Um resumo claro pelo WhatsApp com prioridades, quanto separar por semana e uma previsão de quitação." },
            ].map((item) => (
              <div key={item.num} style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 20,
                padding: 28,
                boxShadow: "0 4px 16px rgba(15,23,42,0.05)",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: "#ecfdf5", color: "#16a34a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 18, marginBottom: 16,
                }}>
                  {item.num}
                </div>
                <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700 }}>{item.titulo}</h3>
                <p style={{ margin: 0, color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>{item.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFÍCIOS ── */}
      <section style={{ background: "#ffffff", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", padding: "64px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", margin: "0 0 8px", fontSize: 28, fontWeight: 800 }}>O que você recebe</h2>
          <p style={{ textAlign: "center", margin: "0 0 48px", color: "#64748b", fontSize: 16 }}>Tudo que você precisa para saber onde está e o que fazer primeiro.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {[
              { icon: "📊", texto: "Levantamento do total em dívidas" },
              { icon: "📅", texto: "Alerta de vencimentos próximos" },
              { icon: "🎯", texto: "Prioridades de pagamento" },
              { icon: "💰", texto: "Quanto separar por semana" },
              { icon: "🗓️", texto: "Previsão inicial de quitação" },
              { icon: "📲", texto: "Resumo claro enviado pelo WhatsApp" },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                background: "#f8fafc", border: "1px solid #e2e8f0",
                borderRadius: 14, padding: "16px 18px",
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", lineHeight: 1.4 }}>{item.texto}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANOS ── */}
      <section style={{ padding: "64px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", margin: "0 0 8px", fontSize: 28, fontWeight: 800 }}>Planos</h2>
          <p style={{ textAlign: "center", margin: "0 0 48px", color: "#64748b", fontSize: 16 }}>Escolha o que faz sentido para você agora.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
            {[
              {
                nome: "Diagnóstico",
                preco: "R$ 19,90",
                descricao: "Uma visão geral das suas dívidas para você saber exatamente onde está.",
                itens: ["Total em dívidas", "Saldo em aberto", "Alertas de vencimento", "Resumo por WhatsApp"],
                destaque: false,
              },
              {
                nome: "Plano de Quitação",
                preco: "R$ 49,90",
                descricao: "O plano completo com prioridades, projeção e orientação clara.",
                itens: ["Tudo do Diagnóstico", "Ordem de prioridade", "Quanto separar por semana", "Previsão inicial de quitação"],
                destaque: true,
              },
              {
                nome: "Acompanhamento",
                preco: "R$ 97,00",
                descricao: "30 dias com suporte, revisões e ajustes no seu plano.",
                itens: ["Tudo do Plano", "Revisão durante 30 dias", "Lembretes manuais", "Ajustes no plano"],
                destaque: false,
              },
            ].map((plano) => (
              <div key={plano.nome} style={{
                background: plano.destaque ? "#16a34a" : "#ffffff",
                border: plano.destaque ? "none" : "1px solid #e2e8f0",
                borderRadius: 20,
                padding: 28,
                boxShadow: plano.destaque ? "0 8px 32px rgba(22,163,74,0.25)" : "0 4px 16px rgba(15,23,42,0.05)",
                color: plano.destaque ? "#ffffff" : "#0f172a",
                display: "flex",
                flexDirection: "column" as const,
                gap: 0,
              }}>
                {plano.destaque && (
                  <span style={{
                    display: "inline-block", background: "#ecfdf5", color: "#16a34a",
                    fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 8,
                    marginBottom: 14, alignSelf: "flex-start",
                  }}>Mais popular</span>
                )}
                <h3 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>{plano.nome}</h3>
                <p style={{ margin: "0 0 16px", fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>{plano.descricao}</p>
                <p style={{ margin: "0 0 20px", fontSize: 32, fontWeight: 800 }}>{plano.preco}</p>
                <ul style={{ margin: "0 0 24px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {plano.itens.map((item) => (
                    <li key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                      <span style={{ color: plano.destaque ? "#bbf7d0" : "#16a34a", fontWeight: 700 }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    background: plano.destaque ? "#ffffff" : "#16a34a",
                    color: plano.destaque ? "#16a34a" : "#ffffff",
                    fontWeight: 700,
                    fontSize: 15,
                    padding: "13px 20px",
                    borderRadius: 12,
                    textDecoration: "none",
                    textAlign: "center",
                    marginTop: "auto",
                  }}
                >
                  Quero este plano
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ background: "#0f172a", padding: "64px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 28, fontWeight: 800, color: "#ffffff" }}>
            Pronto para ter clareza sobre suas dívidas?
          </h2>
          <p style={{ margin: "0 0 36px", color: "#94a3b8", fontSize: 16, lineHeight: 1.6 }}>
            Manda uma mensagem agora. Sem compromisso, sem formulário complicado.
          </p>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              background: "#16a34a",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 18,
              padding: "16px 36px",
              borderRadius: 14,
              textDecoration: "none",
              boxShadow: "0 4px 20px rgba(22,163,74,0.35)",
            }}
          >
            💬 Falar com o QuitaZAP
          </a>
        </div>
      </section>

      {/* ── AVISO LEGAL ── */}
      <section style={{ background: "#f1f5f9", borderTop: "1px solid #e2e8f0", padding: "32px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <p style={{
            margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.7,
            textAlign: "center", padding: "0 8px",
          }}>
            ⚠️ <strong>Aviso importante:</strong> O QuitaZAP não promete limpar nome, reduzir dívida ou garantir desconto. O serviço organiza suas informações e ajuda você a montar um plano mais claro para tomar decisões com mais controle. Nenhum resultado financeiro é garantido.
          </p>
        </div>
      </section>

    </div>
  );
}
