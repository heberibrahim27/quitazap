"use client";

import { useState, useRef, useEffect } from "react";

type Etapa = "inicio" | "QUALIFICACAO" | "PROVA" | "OFERTA" | "FOLLOWUP" | "fim";
type Aba = "funil" | "bot";

const CAKTO_LINK = "https://pay.cakto.com.br/3fz3gz6_945044";

// ── Mensagens do funil (espelho do sales-bot.ts) ──────────────
// Reposicionado (2026-09) de "quitar dívida" pra "controle financeiro
// contínuo" — 5 momentos: Dor → Demonstração → Diferencial → Objeção → CTA.
const MSGS: Record<string, string | string[]> = {
  SAUDACAO: `Olá! 👋 Aqui é o *QuitaZAP*.

Hoje, o que mais te atrapalha com seu dinheiro? Pode ser não saber pra onde ele vai, esquecer de pagar uma conta, cartão que estoura todo mês, dívida acumulando... me conta o que pesa mais pra você agora.`,

  QUALIFICACAO: `Entendi. Isso é super comum — a maioria das pessoas perde o controle do dinheiro sem nem perceber, porque fica tudo espalhado (extrato, papel, memória...). 😉

Deixa eu te mostrar rapidinho como o QuitaZAP ajuda com isso 👇`,

  PROVA: [
    `💬 *É assim que funciona:*\n\n👤 _Você manda:_ "gastei 45 no mercado"\n🤖 _QuitaZAP:_ ✅ Gasto registrado — Mercado — R$ 45,00\n\n👤 _Você manda:_ "recebi 3000 de salário"\n🤖 _QuitaZAP:_ ✅ Receita registrada — R$ 3.000,00\n\nSem formulário, sem planilha — só manda por texto, áudio ou foto que eu organizo pra você. 📲`,
    `E não é só registrar: se em algum momento eu perceber que o mês tá ficando apertado — gasto chegando perto ou passando da sua renda — eu te aviso na hora, com uma dica prática. 🔔\n\nTudo isso 24h por dia, direto no seu WhatsApp, sem precisar abrir nenhum app.\n\n*Quer começar a usar agora?* 👇`,
  ],

  OFERTA: `🚀 *QuitaZAP — R$ 14,90/mês*

✅ Registre renda, gastos, contas, cartão e dívidas direto pelo WhatsApp
✅ Aviso automático quando o mês fica apertado
✅ Funciona por texto, áudio ou foto
✅ Cancele quando quiser — sem burocracia

👇 Pra começar agora:
${CAKTO_LINK}`,

  // Objeção (preço/desconfiança/concorrente/adiar) — o bot varia o ângulo a
  // cada rodada em vez de repetir, até 3 tentativas reais (ver REBATIDAS em
  // sales-bot-objecao.ts). Aqui no simulador mostramos só a 1ª rebatida
  // (ângulo PREÇO) como exemplo.
  FOLLOWUP: `Entendo. Pensa assim: são R$ 14,90 por mês — menos de R$ 0,50 por dia, bem menos que um cafezinho. Nesse valor você tem alguém de olho na sua vida financeira 24h, todo santo dia, direto no WhatsApp.`,

  CUPOM: `Ah, e tem mais uma coisa: 🎁\n\nUse o cupom *[CUPOM]* na hora de assinar e garanta desconto na sua primeira mensalidade:\n\n${CAKTO_LINK}`,

  FIM: `Tudo bem, sem problema! Se mudar de ideia, é só me chamar aqui a qualquer hora. 😊\n\nBoa sorte com suas finanças! 🍀`,
};

type MensagemChat = { de: "bot" | "lead"; texto: string; tipo?: "imagem" };
type MensagemIA   = { role: "user" | "assistant" | "system"; content: string };

const FLUXO: { etapa: Etapa; label: string; respostas: string[] }[] = [
  { etapa: "QUALIFICACAO", label: "Lead responde à pergunta de abertura (a dor)", respostas: ["Esqueço de pagar conta e atraso", "Cartão estoura todo mês", "Não sei pra onde meu dinheiro vai", "Tenho dívida acumulada"] },
  { etapa: "PROVA",        label: "Lead reage à demonstração/diferencial", respostas: ["Interessante!", "Nossa que legal", "Quero saber mais", "E o preço?"] },
  { etapa: "OFERTA",       label: "Lead responde após receber a oferta (objeção)", respostas: ["É caro", "Não sei se confio", "Já uso outro app", "Vou pensar"] },
  { etapa: "FOLLOWUP",     label: "Lead insiste na objeção (2ª/3ª rodada)", respostas: ["Ainda acho caro", "Continuo com dúvida", "Pare de mandar mensagem", "Ok, quero sim"] },
  { etapa: "fim",          label: "Encerramento", respostas: [] },
];

function formatarMensagem(texto: string) {
  return texto
    .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    .replace(/```([\s\S]*?)```/g, '<pre style="font-family:monospace;font-size:12px;background:#f1f5f9;padding:8px;border-radius:6px;white-space:pre;overflow-x:auto;margin:4px 0">$1</pre>')
    .replace(/\n/g, "<br/>");
}

// Quem faz onboarding e registro de verdade hoje é o fluxo determinístico
// (onboarding-controle.ts, controle-financeiro-flow.ts) + o interpretador
// de linguagem natural (financeiro-intent-resolver.ts) — nenhum dos dois
// passa por aqui. Esse chat chama ai-bot.ts direto (ver /api/test/bot-chat),
// que desde 2026-09 é só o rescue parser: último recurso quando nada mais
// reconheceu a mensagem, sem fazer nenhuma pergunta de perfil/dependentes
// (isso não é mais usado pelo produto).
const MSG_BOAS_VINDAS = `Olá! 👋 Esse chat simula o *rescue parser* do QuitaZAP — o último recurso, chamado só quando o fluxo normal de registro não reconhece a mensagem.

Manda qualquer coisa que o fluxo normal (renda, gasto, dívida, meta) não entenderia, e veja a escalada de 3 tentativas até cair pra revisão humana.`;

// ── Componente principal ──────────────────
export default function TestarFunilPage() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>("funil");

  return (
    <div style={{ maxWidth: 740 }}>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Simulador</h1>
          <p className="qa-page-subtitle">Teste o funil de vendas e o rescue parser do QuitaZAP</p>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { id: "funil" as Aba, label: "Funil de vendas" },
          { id: "bot"   as Aba, label: "Rescue parser" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setAbaAtiva(id)}
            className={abaAtiva === id ? "qa-btn-primary" : "qa-btn-secondary"}
          >
            {label}
          </button>
        ))}
      </div>

      {abaAtiva === "funil" ? <AbaFunil /> : <AbaBot />}
    </div>
  );
}

// ── Aba Funil de Vendas ───────────────────
function AbaFunil() {
  const [chat, setChat]   = useState<MensagemChat[]>([{ de: "bot", texto: MSGS.SAUDACAO as string }]);
  const [etapa, setEtapa] = useState<Etapa>("QUALIFICACAO");
  const [digitando, setDigitando] = useState(false);
  const [enviandoReal, setEnviandoReal] = useState(false);
  const [telefoneReal, setTelefoneReal] = useState("");
  const [statusReal, setStatusReal]     = useState("");

  const etapaAtual = FLUXO.find((f) => f.etapa === etapa);

  function addMsg(msgs: MensagemChat[], delay = 0) {
    setTimeout(() => {
      setChat((prev) => [...prev, ...msgs]);
      setDigitando(false);
    }, delay);
  }

  function responder(resposta: string) {
    if (digitando) return;
    setDigitando(true);
    setChat((prev) => [...prev, { de: "lead", texto: resposta }]);

    if (etapa === "QUALIFICACAO") {
      setEtapa("PROVA");
      addMsg([
        { de: "bot", texto: MSGS.QUALIFICACAO as string },
        { de: "bot", texto: (MSGS.PROVA as string[])[0] },
        { de: "bot", texto: (MSGS.PROVA as string[])[1] },
      ], 800);
    } else if (etapa === "PROVA") {
      setEtapa("OFERTA");
      addMsg([{ de: "bot", texto: MSGS.OFERTA as string }], 800);
    } else if (etapa === "OFERTA") {
      setEtapa("FOLLOWUP");
      addMsg([{ de: "bot", texto: MSGS.FOLLOWUP as string }], 800);
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
      setStatusReal(data.ok ? "✅ Mensagem enviada! Verifique o WhatsApp." : (res.status >= 500 ? "Não consegui enviar agora. Tenta de novo em instantes." : (data.error ?? "Não consegui enviar.")));
    } catch {
      setStatusReal("Não consegui enviar. Verifica sua conexão e tenta de novo.");
    }
    setEnviandoReal(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Chat simulado */}
      <ChatWhatsApp
        mensagens={chat}
        digitando={digitando}
        rodape={
          etapaAtual && etapaAtual.respostas.length > 0 && !digitando ? (
            <div style={{ borderTop: "1px solid #d1fae5", background: "#f0fdf4", padding: "12px 16px" }}>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px", fontWeight: 600 }}>
                SIMULAR RESPOSTA DO LEAD:
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {etapaAtual.respostas.map((r) => (
                  <button key={r} onClick={() => responder(r)} style={{
                    background: "#DCF8C6", border: "1px solid #86efac",
                    borderRadius: 20, padding: "6px 14px",
                    fontSize: 13, cursor: "pointer", color: "#166534", fontWeight: 600,
                  }}>{r}</button>
                ))}
              </div>
            </div>
          ) : etapa === "fim" ? (
            <div style={{ background: "#f0fdf4", padding: "12px 16px", borderTop: "1px solid #d1fae5", textAlign: "center" }}>
              <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 700 }}>✅ Funil concluído!</span>
              <button
                onClick={() => { setChat([{ de: "bot", texto: MSGS.SAUDACAO as string }]); setEtapa("QUALIFICACAO"); }}
                style={{ marginLeft: 16, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}
              >↺ Reiniciar</button>
            </div>
          ) : null
        }
      />

      {/* Enviar para número real */}
      <div className="qa-card">
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Testar no WhatsApp real</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--qa-gray-400)" }}>
          Insira um número não cadastrado para receber a mensagem de boas-vindas do funil agora.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="tel"
            placeholder="5511999999999 (com DDI)"
            value={telefoneReal}
            onChange={(e) => setTelefoneReal(e.target.value.replace(/\D/g, ""))}
            className="qa-input"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            onClick={enviarParaNumeroReal}
            disabled={enviandoReal}
            className="qa-btn-primary"
          >{enviandoReal ? "Enviando..." : "Enviar boas-vindas"}</button>
        </div>
        {statusReal && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: statusReal.startsWith("✅") ? "#6ee7b7" : "#fca5a5" }}>
            {statusReal}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Mensagens de exemplo pra testar a escalada do rescue parser ──
// Esse chat chama ai-bot.ts direto (sem o fluxo determinístico nem o
// interpretador financeiro na frente) — então QUALQUER mensagem aqui vira
// a mesma escalada de 3 tentativas, independente do conteúdo. As frases
// abaixo são só exemplos realistas do tipo de mensagem ambígua que, no
// fluxo real, já teria passado pelo interpretador antes de cair aqui.
const RESPOSTAS_RAPIDAS: { categoria: string; emoji: string; itens: string[] }[] = [
  {
    categoria: "Mensagens ambíguas",
    emoji: "🤔",
    itens: [
      "isso não faz sentido pra mim",
      "e aí, como funciona esse negócio?",
      "sei lá, me explica de novo",
      "tanto faz",
    ],
  },
];

// ── Aba Rescue parser ─────────────────────
function AbaBot() {
  const [chat, setChat] = useState<MensagemChat[]>([
    { de: "bot", texto: MSG_BOAS_VINDAS },
  ]);
  const [historico, setHistorico] = useState<MensagemIA[]>([
    { role: "assistant", content: MSG_BOAS_VINDAS },
  ]);
  const [input, setInput]           = useState("");
  const [carregando, setCarregando] = useState(false);
  const [nome, setNome]             = useState("Ibrahim");
  const [categoriaAberta, setCategoriaAberta] = useState<string | null>("Mensagens ambíguas");
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(textoOverride?: string) {
    const texto = (textoOverride ?? input).trim();
    if (!texto || carregando) return;

    if (!textoOverride) setInput("");
    setChat((prev) => [...prev, { de: "lead", texto }]);
    setCarregando(true);

    try {
      const res = await fetch("/api/test/bot-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: texto, historico, nome }),
      });
      const data = await res.json();

      if (data.error) {
        const mensagemErro = res.status >= 500 ? "Não consegui responder agora. Tenta de novo em instantes." : data.error;
        setChat((prev) => [...prev, { de: "bot", texto: `❌ ${mensagemErro}` }]);
        return;
      }

      const novoHistorico: MensagemIA[] = [
        ...historico,
        { role: "user", content: texto },
      ];

      if (data.resposta) {
        setChat((prev) => [...prev, { de: "bot", texto: data.resposta }]);
        novoHistorico.push({ role: "assistant", content: data.resposta });
      }

      setHistorico(novoHistorico);
    } catch {
      setChat((prev) => [...prev, { de: "bot", texto: `❌ Erro de conexão.` }]);
    } finally {
      setCarregando(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function reiniciar() {
    setChat([{ de: "bot", texto: MSG_BOAS_VINDAS }]);
    setHistorico([{ role: "assistant", content: MSG_BOAS_VINDAS }]);
    setInput("");
    setCategoriaAberta("Mensagens ambíguas");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Config */}
      <div className="qa-card" style={{ padding: "14px 18px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: "var(--qa-gray-400)", fontWeight: 600, whiteSpace: "nowrap" }}>Nome do cliente:</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="qa-input"
          style={{ width: 160, padding: "7px 12px" }}
        />
        <button onClick={reiniciar} className="qa-btn-secondary" style={{ marginLeft: "auto", padding: "7px 14px", fontSize: 13 }}>
          Reiniciar conversa
        </button>
      </div>

      {/* Chat */}
      <ChatWhatsApp
        mensagens={chat}
        digitando={carregando}
        rodape={
          <div style={{ borderTop: "1px solid #d1d5db", background: "#f9fafb", padding: "10px 12px", display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviar()}
              placeholder="Digite ou use os atalhos abaixo..."
              disabled={carregando}
              style={{
                flex: 1, border: "1px solid #d1d5db", borderRadius: 20,
                padding: "10px 16px", fontSize: 14, outline: "none",
                background: carregando ? "#f1f5f9" : "#fff",
              }}
            />
            <button
              onClick={() => enviar()}
              disabled={carregando || !input.trim()}
              style={{
                background: carregando || !input.trim() ? "#9ca3af" : "#25D366",
                color: "#fff", border: "none", borderRadius: "50%",
                width: 42, height: 42, fontSize: 18, cursor: carregando ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >➤</button>
          </div>
        }
      />

      {/* Respostas rápidas */}
      <div className="qa-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Respostas rápidas</span>
          <span style={{ fontSize: 12, color: "var(--qa-gray-500)" }}>— clique para enviar sem digitar</span>
        </div>

        {RESPOSTAS_RAPIDAS.map(({ categoria, emoji, itens }) => (
          <div key={categoria} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              onClick={() => setCategoriaAberta(categoriaAberta === categoria ? null : categoria)}
              style={{
                width: "100%", textAlign: "left", background: categoriaAberta === categoria ? "rgba(0,123,255,0.08)" : "transparent",
                border: "none", padding: "10px 18px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8, color: "#e5e7eb",
              }}
            >
              <span style={{ fontSize: 14 }}>{emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{categoria}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--qa-gray-500)" }}>
                {categoriaAberta === categoria ? "▲" : "▼"}
              </span>
            </button>

            {categoriaAberta === categoria && (
              <div style={{ padding: "8px 16px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                {itens.map((item) => (
                  <button
                    key={item}
                    onClick={() => enviar(item)}
                    disabled={carregando}
                    style={{
                      textAlign: "left", background: "#DCF8C6", border: "1px solid #86efac",
                      borderRadius: 8, padding: "7px 12px", fontSize: 13,
                      cursor: carregando ? "not-allowed" : "pointer", color: "#166534",
                      opacity: carregando ? 0.5 : 1, lineHeight: 1.4,
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "var(--qa-gray-500)", textAlign: "center", margin: 0 }}>
        💡 Este chat chama ai-bot.ts diretamente — sem WhatsApp, sem o fluxo determinístico na frente. Respostas reais do rescue parser.
      </p>
    </div>
  );
}

// ── Componente de chat WhatsApp ───────────
function ChatWhatsApp({
  mensagens,
  digitando,
  rodape,
}: {
  mensagens: MensagemChat[];
  digitando: boolean;
  rodape?: React.ReactNode;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, digitando]);

  return (
    <div style={{ background: "#ECE5DD", borderRadius: 16, overflow: "hidden", border: "1px solid #d1d5db" }}>
      {/* Header */}
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
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, minHeight: 340, maxHeight: 460, overflowY: "auto" }}>
        {mensagens.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.de === "lead" ? "flex-end" : "flex-start" }}>
            <div style={{
              background: msg.de === "lead" ? "#DCF8C6" : "#fff",
              borderRadius: msg.de === "lead" ? "12px 0 12px 12px" : "0 12px 12px 12px",
              padding: "9px 13px",
              maxWidth: "80%",
              fontSize: 13,
              color: "#111",
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            }}>
              {msg.tipo === "imagem" ? (
                <div style={{ background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#0369a1" }}>
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
            <div style={{ background: "#fff", borderRadius: "0 12px 12px 12px", padding: "10px 16px", fontSize: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>···</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {rodape}
    </div>
  );
}
