"use client";

import { useState } from "react";

type Etapa = "inicio" | "QUALIFICACAO" | "PROVA" | "OFERTA" | "FOLLOWUP" | "fim";

const CAKTO_LINK = "https://pay.cakto.com.br/3fz3gz6_945044";
const SITE_URL   = "https://quitazap.com.br";

// ── Mensagens do funil (espelho do sales-bot.ts) ──────────────
const MSGS: Record<string, string | string[]> = {
  SAUDACAO: `Olá! 👋

Aqui é o *QuitaZAP* — o assistente que organiza suas dívidas pelo WhatsApp usando Inteligência Artificial. 🤖💚

Você chegou até aqui porque quer organizar suas finanças, certo?

*Você tem dívidas para organizar?* Responde sim ou não 👇`,

  QUALIFICACAO: `Entendi! Você não está sozinho(a) nisso. 😊

Milhares de brasileiros estão na mesma situação — e o QuitaZAP foi criado exatamente para isso.

A ideia é simples: você me conta suas dívidas aqui no WhatsApp — pode ser por texto, áudio ou até *foto do boleto* — e nossa IA cria um *plano de quitação personalizado* pra você.

Deixa eu te mostrar como funciona na prática 👇`,

  PROVA: [
    `[IMAGEM] 💬 Veja como é simples — você manda as dívidas e o bot organiza tudo automaticamente.`,
    `[IMAGEM] 📋 Plano de quitação gerado em minutos com base na sua renda.`,
    `Tudo isso disponível *24h por dia*, direto no seu WhatsApp. Sem precisar instalar nada. 📱\n\nVocê pode perguntar a qualquer hora:\n📊 "Qual meu saldo devedor total?"\n📅 "Quanto preciso pagar essa semana?"\n💰 "Quanto sobra do meu salário?"\n\n*Quer ter seu plano personalizado agora?* 👇`,
  ],

  OFERTA: `🚀 *QuitaZAP — R$ 29,90/mês*

✅ Plano de quitação personalizado por IA
✅ Funciona 24h no seu WhatsApp
✅ Manda dívidas por texto, áudio ou foto de boleto
✅ Relatórios e resumos automáticos
✅ Cancele quando quiser — sem burocracia

Por apenas *R$ 29,90 por mês* você tem um consultor financeiro no bolso.

👇 *Assine agora e comece hoje:*
${CAKTO_LINK}`,

  FOLLOWUP: `Ficou com alguma dúvida? Me conta que eu te ajudo! 😊\n\nMuita gente pensa que é complicado, mas é tudo pelo WhatsApp mesmo — igual a essa conversa aqui. 💬\n\n*O que ficou faltando saber?*`,

  CUPOM: `Espera! 🎁 Tenho uma condição especial para você.\n\nPreparamos um *cupom de desconto* exclusivo:\n\n👉 Use o cupom *[CUPOM]* na hora de assinar e garanta seu desconto!\n\n${CAKTO_LINK}\n\nOferta por tempo limitado ⏰`,

  FIM: `Aqui está o link mais uma vez, caso mude de ideia:\n\n👉 ${CAKTO_LINK}\n\nQualquer dúvida, pode me chamar! 😊`,
};

type Mensagem = { de: "bot" | "lead"; texto: string; tipo?: "imagem" };

const FLUXO: { etapa: Etapa; label: string; respostas: string[] }[] = [
  { etapa: "QUALIFICACAO", label: "Lead diz 'sim, tenho dívidas'", respostas: ["Sim", "Tenho sim", "Quero", "Claro"] },
  { etapa: "PROVA",        label: "Lead reage às imagens", respostas: ["Interessante!", "Nossa que legal", "Quero saber mais", "E o preço?"] },
  { etapa: "OFERTA",       label: "Lead responde após receber oferta", respostas: ["Que preço é esse?", "É caro", "Vou pensar", "Tem desconto?"] },
  { etapa: "FOLLOWUP",     label: "Lead responde ao follow-up", respostas: ["Ainda tô na dúvida", "Tô sem dinheiro agora", "Ok obrigado"] },
  { etapa: "fim",          label: "Encerramento", respostas: [] },
];

function formatarMensagem(texto: string) {
  return texto
    .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

export default function TestarFunilPage() {
  const [chat, setChat]   = useState<Mensagem[]>([{ de: "bot", texto: MSGS.SAUDACAO as string }]);
  const [etapa, setEtapa] = useState<Etapa>("QUALIFICACAO");
  const [digitando, setDigitando] = useState(false);
  const [enviandoReal, setEnviandoReal] = useState(false);
  const [telefoneReal, setTelefoneReal] = useState("");
  const [statusReal, setStatusReal]     = useState("");

  const etapaAtual = FLUXO.find((f) => f.etapa === etapa);

  function addMsg(msgs: Mensagem[], delay = 0) {
    setTimeout(() => {
      setChat((prev) => [...prev, ...msgs]);
      setDigitando(false);
    }, delay);
  }

  function responder(resposta: string) {
    if (digitando) return;
    setDigitando(true);

    const leadMsg: Mensagem = { de: "lead", texto: resposta };
    setChat((prev) => [...prev, leadMsg]);

    if (etapa === "QUALIFICACAO") {
      const botMsgs: Mensagem[] = [
        { de: "bot", texto: MSGS.QUALIFICACAO as string },
        { de: "bot", texto: `[IMAGEM 1] — ${SITE_URL}/api/vendas/conversa`, tipo: "imagem" },
        { de: "bot", texto: `[IMAGEM 2] — ${SITE_URL}/api/vendas/plano`, tipo: "imagem" },
        { de: "bot", texto: (MSGS.PROVA as string[])[2] },
      ];
      setEtapa("PROVA");
      addMsg(botMsgs, 800);
    } else if (etapa === "PROVA") {
      setEtapa("OFERTA");
      addMsg([{ de: "bot", texto: MSGS.OFERTA as string }], 800);
    } else if (etapa === "OFERTA") {
      setEtapa("FOLLOWUP");
      addMsg([
        { de: "bot", texto: MSGS.FOLLOWUP as string },
      ], 800);
    } else if (etapa === "FOLLOWUP") {
      setEtapa("fim");
      addMsg([{ de: "bot", texto: MSGS.FIM as string }], 800);
    }
  }

  async function enviarParaNumeroReal() {
    if (!telefoneReal || telefoneReal.length < 10) {
      setStatusReal("Número inválido.");
      return;
    }
    setEnviandoReal(true);
    setStatusReal("Enviando...");
    try {
      const res = await fetch("/api/test/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: telefoneReal }),
      });
      const data = await res.json();
      setStatusReal(data.ok ? "✅ Mensagem enviada! Verifique o WhatsApp." : `Erro: ${data.error}`);
    } catch {
      setStatusReal("Erro ao chamar API.");
    }
    setEnviandoReal(false);
  }

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 740, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">🧪 Simulador — Funil de Vendas</h1>
          <p className="page-subtitle">Teste como o lead experiencia o bot do QuitaZAP</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
          {/* Chat simulado */}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{
              background: "#ECE5DD",
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid #d1d5db",
            }}>
              {/* Header WA */}
              <div style={{ background: "#075E54", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 19, background: "#25D366",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 13, color: "#fff",
                }}>QZ</div>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>QuitaZAP</div>
                  <div style={{ color: "#B2DFDB", fontSize: 12 }}>{digitando ? "digitando..." : "online"}</div>
                </div>
              </div>

              {/* Mensagens */}
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 10, minHeight: 340, maxHeight: 420, overflowY: "auto" }}>
                {chat.map((msg, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: msg.de === "lead" ? "flex-end" : "flex-start" }}>
                    <div style={{
                      background: msg.de === "lead" ? "#DCF8C6" : "#fff",
                      borderRadius: msg.de === "lead" ? "12px 0 12px 12px" : "0 12px 12px 12px",
                      padding: "9px 13px",
                      maxWidth: "78%",
                      fontSize: 13,
                      color: "#111",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                    }}>
                      {msg.tipo === "imagem" ? (
                        <div style={{
                          background: "#e0f2fe", border: "1px solid #bae6fd",
                          borderRadius: 8, padding: "8px 12px",
                          fontSize: 12, color: "#0369a1",
                        }}>
                          📷 <strong>IMAGEM ENVIADA</strong>
                          <div style={{ fontSize: 11, marginTop: 2, color: "#0284c7" }}>{msg.texto.split(" — ")[1]}</div>
                        </div>
                      ) : (
                        <span dangerouslySetInnerHTML={{ __html: formatarMensagem(msg.texto) }} />
                      )}
                    </div>
                  </div>
                ))}
                {digitando && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div style={{ background: "#fff", borderRadius: "0 12px 12px 12px", padding: "10px 16px", fontSize: 20 }}>
                      ···
                    </div>
                  </div>
                )}
              </div>

              {/* Botões de resposta */}
              {etapaAtual && etapaAtual.respostas.length > 0 && !digitando && (
                <div style={{ borderTop: "1px solid #d1fae5", background: "#f0fdf4", padding: "12px 16px" }}>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px", fontWeight: 600 }}>
                    SIMULAR RESPOSTA DO LEAD:
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {etapaAtual.respostas.map((r) => (
                      <button
                        key={r}
                        onClick={() => responder(r)}
                        style={{
                          background: "#DCF8C6", border: "1px solid #86efac",
                          borderRadius: 20, padding: "6px 14px",
                          fontSize: 13, cursor: "pointer", color: "#166534", fontWeight: 600,
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {etapa === "fim" && (
                <div style={{ background: "#f0fdf4", padding: "12px 16px", borderTop: "1px solid #d1fae5", textAlign: "center" }}>
                  <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 700 }}>✅ Funil concluído!</span>
                  <button
                    onClick={() => { setChat([{ de: "bot", texto: MSGS.SAUDACAO as string }]); setEtapa("QUALIFICACAO"); }}
                    style={{ marginLeft: 16, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}
                  >
                    ↺ Reiniciar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Enviar para número real */}
          <div style={{
            gridColumn: "1 / -1",
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20,
          }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#0f172a" }}>
              📱 Testar no WhatsApp real
            </h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>
              Insira um número não cadastrado para receber a mensagem de boas-vindas do funil agora.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                type="tel"
                placeholder="5511999999999 (com DDI)"
                value={telefoneReal}
                onChange={(e) => setTelefoneReal(e.target.value.replace(/\D/g, ""))}
                style={{
                  flex: 1, minWidth: 200,
                  border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 14px", fontSize: 14,
                }}
              />
              <button
                onClick={enviarParaNumeroReal}
                disabled={enviandoReal}
                style={{
                  background: "#075E54", color: "#fff", border: "none",
                  borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}
              >
                {enviandoReal ? "Enviando..." : "Enviar boas-vindas"}
              </button>
            </div>
            {statusReal && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: statusReal.startsWith("✅") ? "#16a34a" : "#dc2626" }}>
                {statusReal}
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
