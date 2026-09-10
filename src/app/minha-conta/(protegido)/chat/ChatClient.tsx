"use client";

import { useEffect, useRef, useState } from "react";

type MensagemUI = { id: string; direcao: "CLIENTE" | "BOT"; texto: string };

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
      <div className="mc-chat-lista">
        {mensagens.length === 0 && (
          <p className="mc-chat-vazio">
            Oi, {nome}! Me conta um gasto, uma receita, uma dívida, um cartão... eu já entendo e registro pra você.
          </p>
        )}
        {mensagens.map((m) => (
          <div key={m.id} className={`mc-chat-bolha mc-chat-bolha-${m.direcao === "CLIENTE" ? "cliente" : "bot"}`}>
            {m.texto}
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
