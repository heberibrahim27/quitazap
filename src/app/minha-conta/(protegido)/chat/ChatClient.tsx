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

const ALTURA_COMPOSER_MAX = 116; // ~4 linhas

export function ChatClient({
  mensagensIniciais,
}: {
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

  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Cresce junto com o texto (1 a ~4 linhas) em vez de altura fixa — mede
  // o conteúdo real via scrollHeight (só funciona com altura resetada
  // antes, senão o navegador nunca reporta encolhimento ao apagar texto).
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, ALTURA_COMPOSER_MAX)}px`;
  }, [texto]);

  async function enviarMensagem(conteudo: string) {
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

  function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    enviarMensagem(texto.trim());
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia, Shift+Enter quebra linha (padrão de app de chat).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem(texto.trim());
    }
  }

  function focarComposer(prefill?: string) {
    if (prefill != null) setTexto(prefill);
    composerRef.current?.focus();
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
          <div className="mc-chat-intro">
            <p className="mc-chat-intro-texto">Vamos organizar seu dinheiro? Conte o que aconteceu ou escolha por onde começar.</p>
            <div className="mc-chat-intro-opcoes">
              <button type="button" className="mc-chat-intro-opcao" onClick={() => focarComposer()}>
                Registrar uma movimentação
              </button>
              <button type="button" className="mc-chat-intro-opcao" onClick={() => enviarMensagem("onde eu gasto mais")}>
                Ver gastos por categoria
              </button>
              <button type="button" className="mc-chat-intro-opcao" onClick={() => focarComposer("Simular compra de R$ ")}>
                Simular uma compra
              </button>
            </div>
          </div>
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

      <form className="mc-chat-composer" onSubmit={aoSubmeter}>
        <div className="mc-chat-composer-superficie">
          <textarea
            ref={composerRef}
            className="mc-chat-composer-campo"
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={aoTeclar}
            placeholder="Digite ou envie um áudio…"
            disabled={enviando}
          />
          {texto.trim() ? (
            <button type="submit" className="mc-chat-composer-acao" aria-label="Enviar" disabled={enviando}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            </button>
          ) : (
            <button type="button" className="mc-chat-composer-acao" aria-label="Gravar áudio" disabled={enviando}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" /><path d="M19 11a7 7 0 0 1-14 0" /><path d="M12 19v3" /></svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
