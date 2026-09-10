"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LancamentoCard, type LancamentoCardDado } from "./LancamentoCard";
import { GraficoCategoriaCard, type GraficoCategoriaDado } from "./GraficoCategoriaCard";
import { ComprovanteCard, type ComprovanteDado } from "./ComprovanteCard";
import { PainelDebugTeclado } from "./DebugTeclado";

type DadosEstruturados =
  | { tipo: "lancamento_criado"; lancamentos: LancamentoCardDado[] }
  | GraficoCategoriaDado
  | ComprovanteDado
  | null
  | undefined;

type MensagemUI = { id: string; direcao: "CLIENTE" | "BOT"; texto: string; dadosEstruturados?: DadosEstruturados };

const ALTURA_COMPOSER_MAX = 116; // ~4 linhas
const LADO_MAX_FOTO = 1600;
const QUALIDADE_FOTO = 0.85;

// Nunca fixa um formato de gravação — nem todo navegador suporta os
// mesmos codecs (Chrome/Android tende a webm/opus, Safari tende a mp4) —
// deixa MediaRecorder.isTypeSupported decidir, e cai pro default do
// navegador se nenhum candidato bater.
function escolherMimeTypeAudio(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidatos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
  for (const c of candidatos) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

// Converte a foto pro mesmo padrão já usado em FotoPerfilForm.tsx (JPEG,
// redimensionado) — sem UI de recorte (aqui não é avatar, o recibo
// precisa do retângulo inteiro) e respeitando a orientação EXIF original
// (senão foto tirada com o celular de lado vira ilegível).
async function converterFotoParaJpeg(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  let largura = bitmap.width;
  let altura = bitmap.height;
  if (largura > LADO_MAX_FOTO || altura > LADO_MAX_FOTO) {
    const escala = LADO_MAX_FOTO / Math.max(largura, altura);
    largura = Math.round(largura * escala);
    altura = Math.round(altura * escala);
  }
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não consegui processar essa imagem.");
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não consegui processar essa imagem."))), "image/jpeg", QUALIDADE_FOTO);
  });
}

type EnvioEmAndamento =
  | { tipo: "foto"; fase: "preparando" | "enviando" | "processando"; previewUrl: string }
  | { tipo: "audio"; fase: "enviando" | "processando" };

type ErroEnvio = { mensagem: string; tentar: () => void };

type Gravacao = "inativa" | "gravando" | "preview";

export function ChatClient({
  mensagensIniciais,
  debug = false,
  buildId = "dev",
}: {
  mensagensIniciais: MensagemUI[];
  debug?: boolean;
  buildId?: string;
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

  // Fallback via JS puro pra travar o rodapé acima do teclado (achado
  // real, Ibrahim 10/09/2026 — persistiu em iPhone real mesmo com
  // interactive-widget=resizes-content na tag de viewport). Em
  // investigação com instrumentação de geometria (?debug=1, ver
  // DebugTeclado.tsx) — não mexer nessa fórmula sem o log real.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    function medir() {
      const altura = Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop);
      document.documentElement.style.setProperty("--mc-teclado", `${altura}px`);
    }
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
      document.documentElement.style.removeProperty("--mc-teclado");
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

  // ── Anexo (foto/documento) ──────────────────────────────────────────
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false);
  const [envio, setEnvio] = useState<EnvioEmAndamento | null>(null);
  const [erroEnvio, setErroEnvio] = useState<ErroEnvio | null>(null);
  const inputCameraRef = useRef<HTMLInputElement>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);

  async function enviarFoto(arquivo: File) {
    if (envio) return;
    setErroEnvio(null);
    const previewUrl = URL.createObjectURL(arquivo);
    setEnvio({ tipo: "foto", fase: "preparando", previewUrl });

    try {
      const jpeg = await converterFotoParaJpeg(arquivo);
      setEnvio({ tipo: "foto", fase: "enviando", previewUrl });

      const formData = new FormData();
      formData.set("arquivo", jpeg, "foto.jpg");
      const res = await fetch("/api/minha-conta/chat/anexo", { method: "POST", body: formData });
      setEnvio({ tipo: "foto", fase: "processando", previewUrl });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error || "Não consegui enviar a foto.");

      setMensagens((atual) => [
        ...atual,
        { id: `foto-${Date.now()}`, direcao: "CLIENTE", texto: "📷 Foto enviada", dadosEstruturados: undefined },
        { id: `resp-${Date.now()}`, direcao: "BOT", texto: dados.resposta, dadosEstruturados: dados.dadosEstruturados },
      ]);
      setEnvio(null);
    } catch (err) {
      setEnvio(null);
      setErroEnvio({
        mensagem: err instanceof Error ? err.message : "Não consegui enviar a foto.",
        tentar: () => enviarFoto(arquivo),
      });
    }
  }

  function aoEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    setMenuAnexoAberto(false);
    if (!arquivo) return; // cancelou o seletor — texto já digitado nunca é tocado
    enviarFoto(arquivo);
  }

  function abrirCamera() {
    inputCameraRef.current?.click();
  }
  function abrirGaleria() {
    inputGaleriaRef.current?.click();
  }
  function avisarDocumentoIndisponivel() {
    setMenuAnexoAberto(false);
    setMensagens((atual) => [
      ...atual,
      {
        id: `doc-aviso-${Date.now()}`,
        direcao: "BOT",
        texto: "Documentos ainda não são lidos automaticamente por aqui — me conta o que é por texto que eu registro certinho.",
      },
    ]);
  }

  function aoResolverComprovante(resultado: { resposta: string; dadosEstruturados?: unknown }) {
    setMensagens((atual) => [
      ...atual,
      {
        id: `comprovante-resp-${Date.now()}`,
        direcao: "BOT",
        texto: resultado.resposta,
        dadosEstruturados: resultado.dadosEstruturados as DadosEstruturados,
      },
    ]);
  }

  // ── Áudio ────────────────────────────────────────────────────────────
  const [gravacao, setGravacao] = useState<Gravacao>("inativa");
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const [audioPreview, setAudioPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const descartarRef = useRef(false);

  function pararIntervalo() {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
  }

  async function iniciarGravacao() {
    if (gravacao !== "inativa" || envio) return;
    setErroEnvio(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = escolherMimeTypeAudio();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      descartarRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (descartarRef.current) {
          descartarRef.current = false;
          setGravacao("inativa");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        setAudioPreview({ blob, url: URL.createObjectURL(blob) });
        setGravacao("preview");
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setGravacao("gravando");
      setTempoGravacao(0);
      intervaloRef.current = setInterval(() => setTempoGravacao((t) => t + 1), 1000);
    } catch {
      setErroEnvio({
        mensagem: "Não consegui acessar o microfone. Verifica a permissão do QuitaZAP nas configurações do navegador.",
        tentar: iniciarGravacao,
      });
    }
  }

  function pararGravacao() {
    pararIntervalo();
    mediaRecorderRef.current?.stop();
  }

  function cancelarGravacaoAtiva() {
    descartarRef.current = true;
    pararIntervalo();
    mediaRecorderRef.current?.stop();
  }

  function descartarPreviewAudio() {
    if (audioPreview) URL.revokeObjectURL(audioPreview.url);
    setAudioPreview(null);
    setGravacao("inativa");
  }

  async function enviarAudioGravado() {
    if (!audioPreview) return;
    const { blob } = audioPreview;
    setGravacao("inativa");
    setEnvio({ tipo: "audio", fase: "enviando" });
    try {
      const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      const formData = new FormData();
      formData.set("arquivo", blob, `audio.${ext}`);
      const res = await fetch("/api/minha-conta/chat/audio", { method: "POST", body: formData });
      setEnvio({ tipo: "audio", fase: "processando" });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error || "Não consegui enviar o áudio.");

      setMensagens((atual) => [
        ...atual,
        { id: `audio-${Date.now()}`, direcao: "CLIENTE", texto: dados.textoTranscrito ? `🎤 ${dados.textoTranscrito}` : "🎤 Áudio enviado" },
        { id: `resp-${Date.now()}`, direcao: "BOT", texto: dados.resposta, dadosEstruturados: dados.dadosEstruturados },
      ]);
      URL.revokeObjectURL(audioPreview.url);
      setAudioPreview(null);
      setEnvio(null);
    } catch (err) {
      setEnvio(null);
      setErroEnvio({
        mensagem: err instanceof Error ? err.message : "Não consegui enviar o áudio.",
        tentar: () => enviarAudioGravado(),
      });
    }
  }

  // Limpeza se o cliente sair da tela com o microfone ainda ligado.
  useEffect(() => {
    return () => {
      pararIntervalo();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioPreview) URL.revokeObjectURL(audioPreview.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fmtTempo(s: number) {
    const min = Math.floor(s / 60);
    const seg = s % 60;
    return `${min}:${String(seg).padStart(2, "0")}`;
  }

  const FASE_LABEL: Record<string, string> = {
    preparando: "Preparando...",
    enviando: "Enviando...",
    processando: "Processando...",
  };

  return (
    <div className="mc-chat-shell">
      <div className="mc-chat-header">
        <Link href="/minha-conta" className="mc-chat-voltar" aria-label="Voltar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <span className="mc-chat-header-titulo">Chat</span>
      </div>

      {debug && <PainelDebugTeclado buildId={buildId} />}

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
            {m.dadosEstruturados?.tipo === "comprovante_detectado" && (
              <ComprovanteCard dado={m.dadosEstruturados} onResolvido={aoResolverComprovante} />
            )}
          </div>
        ))}

        {enviando && <div className="mc-chat-bolha mc-chat-bolha-bot mc-chat-digitando">digitando…</div>}

        {envio && (
          <div className="mc-chat-turno">
            <div className="mc-chat-bolha mc-chat-bolha-cliente mc-envio-andamento">
              {envio.tipo === "foto" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={envio.previewUrl} alt="" className="mc-envio-thumb" />
              )}
              <span>{envio.tipo === "foto" ? FASE_LABEL[envio.fase] : FASE_LABEL[envio.fase] ?? "Enviando áudio..."}</span>
            </div>
          </div>
        )}

        {erroEnvio && (
          <div className="mc-chat-turno">
            <div className="mc-chat-bolha mc-chat-bolha-bot mc-envio-erro">
              <span>⚠️ {erroEnvio.mensagem}</span>
              <button type="button" onClick={() => { const t = erroEnvio.tentar; setErroEnvio(null); t(); }}>
                Tentar de novo
              </button>
            </div>
          </div>
        )}

        <div ref={fimRef} />
      </div>

      <form className="mc-chat-composer" onSubmit={aoSubmeter}>
        {gravacao === "gravando" ? (
          <div className="mc-chat-composer-superficie mc-gravando">
            <span className="mc-gravando-ponto" />
            <span className="mc-gravando-tempo">{fmtTempo(tempoGravacao)}</span>
            <span className="mc-gravando-dica">Gravando áudio...</span>
            <button type="button" className="mc-chat-composer-acao mc-acao-cancelar" aria-label="Cancelar gravação" onClick={cancelarGravacaoAtiva}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <button type="button" className="mc-chat-composer-acao" aria-label="Parar gravação" onClick={pararGravacao}>
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          </div>
        ) : gravacao === "preview" && audioPreview ? (
          <div className="mc-chat-composer-superficie mc-audio-preview">
            <audio controls src={audioPreview.url} className="mc-audio-preview-player" />
            <button type="button" className="mc-chat-composer-acao mc-acao-cancelar" aria-label="Descartar áudio" onClick={descartarPreviewAudio}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
            </button>
            <button type="button" className="mc-chat-composer-acao" aria-label="Enviar áudio" onClick={enviarAudioGravado} disabled={envio !== null}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            </button>
          </div>
        ) : (
          <div className="mc-chat-composer-superficie">
            <button
              type="button"
              className="mc-chat-composer-clipe"
              aria-label="Anexar"
              onClick={() => setMenuAnexoAberto((v) => !v)}
              disabled={envio !== null}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <textarea
              ref={composerRef}
              className="mc-chat-composer-campo"
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={aoTeclar}
              placeholder="Digite uma mensagem…"
              disabled={enviando}
            />
            <button
              type="button"
              className="mc-chat-composer-acao"
              aria-label="Abrir câmera"
              onClick={abrirCamera}
              disabled={envio !== null}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V6a1 1 0 0 1 1-1h2l1.5-2h7L17 5h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8z" /><circle cx="12" cy="13" r="3.5" /></svg>
            </button>
            {texto.trim() ? (
              <button type="submit" className="mc-chat-composer-acao" aria-label="Enviar" disabled={enviando}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              </button>
            ) : (
              <button type="button" className="mc-chat-composer-acao" aria-label="Gravar áudio" onClick={iniciarGravacao} disabled={envio !== null}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" /><path d="M19 11a7 7 0 0 1-14 0" /><path d="M12 19v3" /></svg>
              </button>
            )}
          </div>
        )}

        {menuAnexoAberto && (
          <>
            <div className="mc-anexo-backdrop" onClick={() => setMenuAnexoAberto(false)} />
            <div className="mc-anexo-menu">
              <button type="button" onClick={abrirCamera}>
                <span className="mc-anexo-menu-icone azul">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V6a1 1 0 0 1 1-1h2l1.5-2h7L17 5h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8z" /><circle cx="12" cy="13" r="3.5" /></svg>
                </span>
                Câmera
              </button>
              <button type="button" onClick={abrirGaleria}>
                <span className="mc-anexo-menu-icone verde">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                </span>
                Galeria
              </button>
              <button type="button" onClick={avisarDocumentoIndisponivel}>
                <span className="mc-anexo-menu-icone laranja">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                </span>
                Documento
              </button>
            </div>
          </>
        )}

        <input ref={inputCameraRef} type="file" accept="image/*" capture="environment" onChange={aoEscolherFoto} style={{ display: "none" }} />
        <input ref={inputGaleriaRef} type="file" accept="image/*" onChange={aoEscolherFoto} style={{ display: "none" }} />
      </form>
    </div>
  );
}
