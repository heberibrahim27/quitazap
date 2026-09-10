"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LancamentoCard, type LancamentoCardDado } from "./LancamentoCard";
import { GraficoCategoriaCard, type GraficoCategoriaDado } from "./GraficoCategoriaCard";

type DadosEstruturados =
  | { tipo: "lancamento_criado"; lancamentos: LancamentoCardDado[] }
  | GraficoCategoriaDado
  | null
  | undefined;

type MensagemUI = { id: string; direcao: "CLIENTE" | "BOT"; texto: string; dadosEstruturados?: DadosEstruturados };

export function ChatClient({
  nome,
  mensagensIniciais,
}: {
  nome: string;
  mensagensIniciais: MensagemUI[];
}) {
  const [mensagens, setMensagens] = useState<MensagemUI[]>(mensagensIniciais);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, enviando]);

  // Tela dedicada full-screen (pedido do Ibrahim, 10/09/2026, referência:
  // o app do Claude Code no celular dele — entrar numa conversa some com a
  // navegação global, o cabeçalho vira só uma seta de voltar, e a área da
  // conversa ganha todo o espaço). Aplicado a partir da montagem (não só
  // quando o campo foca): esconde Header/BottomNav globais via classe no
  // <body> — evita tocar no layout compartilhado, que serve toda página do
  // painel — e mede a altura real visível com visualViewport (já desconta
  // teclado + input accessory view do Safari, ao contrário de 100dvh, que
  // não reage ao teclado) pra o compositor de texto subir junto com o
  // teclado sem espaço morto.
  useEffect(() => {
    document.body.classList.add("mc-chat-tela");
    return () => document.body.classList.remove("mc-chat-tela");
  }, []);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    function medir() {
      document.documentElement.style.setProperty("--mc-vvh", `${vv!.height}px`);
    }
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
      document.documentElement.style.removeProperty("--mc-vvh");
    };
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;

    setTexto("");
    setEnviando(true);
    setMensagens((atual) => [...atual, { id: `temp-${Date.now()}`, direcao: "CLIENTE", texto: conteudo }]);

    try {
      const res = await fetch("/api/minha-conta/chat/mensagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: conteudo }),
      });
      const dados = await res.json();
      setMensagens((atual) => [
        ...atual,
        {
          id: `resp-${Date.now()}`,
          direcao: "BOT",
          texto: res.ok ? dados.resposta : "Não consegui processar agora. Tenta de novo em instantes.",
          dadosEstruturados: res.ok ? dados.dadosEstruturados : undefined,
        },
      ]);
    } catch {
      setMensagens((atual) => [
        ...atual,
        { id: `erro-${Date.now()}`, direcao: "BOT", texto: "Sem conexão agora. Tenta de novo em instantes." },
      ]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mc-chat-shell">
      <div className="mc-chat-header">
        <Link href="/minha-conta" className="mc-chat-voltar" aria-label="Voltar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <span className="mc-chat-header-titulo">Chat</span>
      </div>

      <div className="mc-chat-lista">
        {mensagens.length === 0 && (
          <p className="mc-chat-vazio">
            Oi, {nome}! Me conta um gasto, uma receita, uma dívida, um cartão... eu já entendo e registro pra você.
          </p>
        )}
        {mensagens.map((m) => (
          <div key={m.id} className="mc-chat-turno">
            <div className={`mc-chat-bolha mc-chat-bolha-${m.direcao === "CLIENTE" ? "cliente" : "bot"}`}>
              {m.texto}
              {m.dadosEstruturados?.tipo === "lancamento_criado" &&
                m.dadosEstruturados.lancamentos.map((l) => <LancamentoCard key={l.id} dado={l} />)}
            </div>
            {m.dadosEstruturados?.tipo === "grafico_categoria" && (
              <GraficoCategoriaCard dado={m.dadosEstruturados} />
            )}
          </div>
        ))}
        {enviando && <div className="mc-chat-bolha mc-chat-bolha-bot mc-chat-digitando">digitando…</div>}
        <div ref={fimRef} />
      </div>

      <form className="mc-chat-composer" onSubmit={enviar}>
        <input
          className="mc-input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva aqui..."
          disabled={enviando}
        />
        <button type="submit" className="mc-btn-primary" disabled={enviando || !texto.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
