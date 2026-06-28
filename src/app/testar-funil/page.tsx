"use client";

import { useState, useRef, useEffect } from "react";

type Etapa = "inicio" | "QUALIFICACAO" | "PROVA" | "OFERTA" | "FOLLOWUP" | "fim";
type Aba = "funil" | "bot";

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

type MensagemChat = { de: "bot" | "lead"; texto: string; tipo?: "imagem" };
type MensagemIA   = { role: "user" | "assistant" | "system"; content: string };

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
    .replace(/```([\s\S]*?)```/g, '<pre style="font-family:monospace;font-size:12px;background:#f1f5f9;padding:8px;border-radius:6px;white-space:pre;overflow-x:auto;margin:4px 0">$1</pre>')
    .replace(/\n/g, "<br/>");
}

const MSG_BOAS_VINDAS = `Olá, *Ibrahim*! 👋 Seja bem-vindo(a) ao *QuitaZAP!*

Sou seu consultor financeiro pessoal. Vou te ajudar a sair das dívidas com um plano claro e direto. 💪

*Antes de começar, me conta rapidinho:*

1️⃣ Como você trabalha? CLT, servidor público, autônomo, MEI ou empresário?
2️⃣ Tem dependentes? Filhos ou alguém que depende de você financeiramente?`;

// ── Componente principal ──────────────────
export default function TestarFunilPage() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>("funil");

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 740, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 className="page-title">🧪 Simulador</h1>
          <p className="page-subtitle">Teste o funil de vendas e o bot de IA do QuitaZAP</p>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { id: "funil" as Aba, label: "📢 Funil de Vendas" },
            { id: "bot"   as Aba, label: "🤖 Bot QuitaZAP" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setAbaAtiva(id)}
              style={{
                padding: "9px 20px",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                background: abaAtiva === id ? "#075E54" : "#e2e8f0",
                color: abaAtiva === id ? "#fff" : "#374151",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {abaAtiva === "funil" ? <AbaFunil /> : <AbaBot />}
      </section>
    </main>
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
        { de: "bot", texto: `[IMAGEM 1] — ${SITE_URL}/api/vendas/conversa`, tipo: "imagem" },
        { de: "bot", texto: `[IMAGEM 2] — ${SITE_URL}/api/vendas/plano`, tipo: "imagem" },
        { de: "bot", texto: (MSGS.PROVA as string[])[2] },
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
      setStatusReal(data.ok ? "✅ Mensagem enviada! Verifique o WhatsApp." : `Erro: ${data.error}`);
    } catch {
      setStatusReal("Erro ao chamar API.");
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
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, color: "#0f172a" }}>📱 Testar no WhatsApp real</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>
          Insira um número não cadastrado para receber a mensagem de boas-vindas do funil agora.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="tel"
            placeholder="5511999999999 (com DDI)"
            value={telefoneReal}
            onChange={(e) => setTelefoneReal(e.target.value.replace(/\D/g, ""))}
            style={{ flex: 1, minWidth: 200, border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 14px", fontSize: 14 }}
          />
          <button
            onClick={enviarParaNumeroReal}
            disabled={enviandoReal}
            style={{ background: "#075E54", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >{enviandoReal ? "Enviando..." : "Enviar boas-vindas"}</button>
        </div>
        {statusReal && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: statusReal.startsWith("✅") ? "#16a34a" : "#dc2626" }}>
            {statusReal}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Respostas predefinidas por categoria ──
const RESPOSTAS_RAPIDAS: { categoria: string; emoji: string; itens: string[] }[] = [
  {
    categoria: "Perfil",
    emoji: "👤",
    itens: [
      "CLT, tenho esposa e 2 filhos",
      "Autônomo, sem dependentes",
      "Servidor público, tenho 1 filho",
      "MEI, minha esposa depende de mim",
    ],
  },
  {
    categoria: "Renda",
    emoji: "💰",
    itens: [
      "Recebo R$ 3.500 líquido por mês",
      "Meu salário é R$ 2.800, às vezes faço bicos",
      "Ganho R$ 5.200 e minha esposa ganha R$ 1.800",
      "Sou autônomo, média de R$ 4.000 por mês",
    ],
  },
  {
    categoria: "Despesas",
    emoji: "🏠",
    itens: [
      "Aluguel R$ 900, internet R$ 100, energia R$ 150, escola R$ 400, plano de saúde R$ 280",
      "Aluguel R$ 1.200, luz R$ 120, internet R$ 100, Netflix R$ 45, academia R$ 99",
      "Financiamento da casa R$ 850, condomínio R$ 300, escola R$ 500, plano R$ 350",
      "Mercado R$ 600 por mês, combustível R$ 300, farmácia R$ 80",
    ],
  },
  {
    categoria: "Dívidas",
    emoji: "💳",
    itens: [
      "Nubank cartão R$ 4.500, parcela R$ 375, 12x restantes, vence dia 10",
      "Empréstimo Banco do Brasil R$ 15.000, parcela R$ 850, faltam 18 meses, vence dia 5",
      "Casas Bahia R$ 1.800, 9x de R$ 200, vence dia 20",
      "Financiamento do carro R$ 22.000, parcela R$ 680, 32x restantes, vence dia 15",
      "Não tenho mais dívidas",
    ],
  },
  {
    categoria: "Outros",
    emoji: "💬",
    itens: [
      "Não tenho reserva de emergência",
      "Tenho R$ 500 guardado",
      "Consigo separar uns R$ 300 por mês para pagar dívidas",
      "Estou negativado no Serasa",
      "Qual meu QuitaScore?",
    ],
  },
];

// ── Aba Bot QuitaZAP ─────────────────────
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
  const [categoriaAberta, setCategoriaAberta] = useState<string | null>("Perfil");
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
        setChat((prev) => [...prev, { de: "bot", texto: `❌ Erro: ${data.error}` }]);
        return;
      }

      const novoHistorico: MensagemIA[] = [
        ...historico,
        { role: "user", content: texto },
      ];

      if (data.resposta) {
        setChat((prev) => [...prev, { de: "bot", texto: data.resposta }]);
        novoHistorico.push({ role: "assistant", content: data.resposta });
      } else if (data.diagnostico) {
        const resumo = `✅ *Diagnóstico gerado!*\n\nDados coletados com sucesso. Em produção o bot apresentaria o diagnóstico completo aqui.`;
        setChat((prev) => [...prev, { de: "bot", texto: resumo }]);
        novoHistorico.push({ role: "assistant", content: resumo });
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
    setCategoriaAberta("Perfil");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Config */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>Nome do cliente:</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 12px", fontSize: 14, width: 160 }}
        />
        <button onClick={reiniciar} style={{
          marginLeft: "auto", background: "#f1f5f9", border: "1px solid #e2e8f0",
          borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600, color: "#374151",
        }}>↺ Reiniciar conversa</button>
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
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>⚡ Respostas rápidas</span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>— clique para enviar sem digitar</span>
        </div>

        {RESPOSTAS_RAPIDAS.map(({ categoria, emoji, itens }) => (
          <div key={categoria} style={{ borderBottom: "1px solid #f1f5f9" }}>
            <button
              onClick={() => setCategoriaAberta(categoriaAberta === categoria ? null : categoria)}
              style={{
                width: "100%", textAlign: "left", background: categoriaAberta === categoria ? "#f0fdf4" : "#fff",
                border: "none", padding: "10px 16px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <span style={{ fontSize: 14 }}>{emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{categoria}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>
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

      <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", margin: 0 }}>
        💡 Este chat chama a IA diretamente — sem WhatsApp. Respostas reais do bot.
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
