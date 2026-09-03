"use client";

import { useRef, useState, useTransition } from "react";

const CAIXA = 220; // tamanho (px) da área de enquadramento na tela
const SAIDA = 512; // tamanho (px) da imagem final exportada
const QUALIDADE = 0.85;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

function clamp(valor: number, min: number, max: number) {
  return Math.min(max, Math.max(min, valor));
}

type Ajuste = { zoom: number; panX: number; panY: number };

// Quanto o usuário pode arrastar a imagem sem deixar espaço vazio na
// caixa: a imagem sempre cobre a caixa inteira (mesma ideia do
// object-fit: cover), só que aqui o "corte" fica sob controle do
// usuário em vez de ser automático.
function limitesPan(escalaBase: number, naturalW: number, naturalH: number, zoom: number) {
  const dW = naturalW * escalaBase * zoom;
  const dH = naturalH * escalaBase * zoom;
  return { maxX: Math.max(0, (dW - CAIXA) / 2), maxY: Math.max(0, (dH - CAIXA) / 2) };
}

export function FotoPerfilForm({
  fotoAtual,
  enviarFoto,
}: {
  fotoAtual: string | null;
  enviarFoto: (formData: FormData) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [preview, setPreview] = useState<string | null>(fotoAtual);
  const [pendente, setPendente] = useState<Blob | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  // Estado do editor de enquadramento — só existe enquanto o usuário
  // está ajustando uma foto recém-selecionada, antes de confirmar.
  const [editando, setEditando] = useState<{ src: string; naturalW: number; naturalH: number; escalaBase: number } | null>(null);
  const [ajuste, setAjuste] = useState<Ajuste>({ zoom: 1, panX: 0, panY: 0 });
  const arrastoRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro(null);

    if (!arquivo.type.startsWith("image/")) {
      setErro("Escolha um arquivo de imagem.");
      return;
    }
    setEditando({ src: URL.createObjectURL(arquivo), naturalW: 0, naturalH: 0, escalaBase: 0 });
    setAjuste({ zoom: 1, panX: 0, panY: 0 });
  }

  function aoCarregarImagem() {
    const img = imgRef.current;
    if (!img || !editando) return;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const escalaBase = Math.max(CAIXA / naturalW, CAIXA / naturalH);
    setEditando({ ...editando, naturalW, naturalH, escalaBase });
  }

  function aoComecarArrasto(x: number, y: number) {
    arrastoRef.current = { x, y, panX: ajuste.panX, panY: ajuste.panY };
  }

  function aoMoverArrasto(x: number, y: number) {
    const inicio = arrastoRef.current;
    if (!inicio || !editando?.naturalW) return;
    const { maxX, maxY } = limitesPan(editando.escalaBase, editando.naturalW, editando.naturalH, ajuste.zoom);
    setAjuste((atual) => ({
      ...atual,
      panX: clamp(inicio.panX + (x - inicio.x), -maxX, maxX),
      panY: clamp(inicio.panY + (y - inicio.y), -maxY, maxY),
    }));
  }

  function aoMudarZoom(novoZoom: number) {
    if (!editando?.naturalW) {
      setAjuste((a) => ({ ...a, zoom: novoZoom }));
      return;
    }
    const { maxX, maxY } = limitesPan(editando.escalaBase, editando.naturalW, editando.naturalH, novoZoom);
    setAjuste((atual) => ({ zoom: novoZoom, panX: clamp(atual.panX, -maxX, maxX), panY: clamp(atual.panY, -maxY, maxY) }));
  }

  async function confirmarEnquadramento() {
    if (!editando?.naturalW || !imgRef.current) return;
    const { naturalW, naturalH, escalaBase } = editando;
    const s = escalaBase * ajuste.zoom;
    const dW = naturalW * s;
    const dH = naturalH * s;
    const left = (CAIXA - dW) / 2 + ajuste.panX;
    const top = (CAIXA - dH) / 2 + ajuste.panY;

    // Mapeia a janela visível na caixa de volta pra coordenadas da
    // imagem original, pra recortar exatamente o que o usuário viu.
    const sx = -left / s;
    const sy = -top / s;
    const sSide = CAIXA / s;

    const canvas = document.createElement("canvas");
    canvas.width = SAIDA;
    canvas.height = SAIDA;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setErro("Não consegui processar essa imagem. Tente outra.");
      return;
    }
    ctx.drawImage(imgRef.current, sx, sy, sSide, sSide, 0, 0, SAIDA, SAIDA);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErro("Não consegui processar essa imagem. Tente outra.");
          return;
        }
        setPendente(blob);
        setPreview(URL.createObjectURL(blob));
        setEditando(null);
      },
      "image/jpeg",
      QUALIDADE
    );
  }

  function salvar() {
    if (!pendente) return;
    const formData = new FormData();
    formData.set("foto", pendente, "foto.jpg");
    startTransition(async () => {
      await enviarFoto(formData);
      setPendente(null);
    });
  }

  if (editando) {
    return (
      <div className="mc-card" style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, fontWeight: 600, color: "var(--ink-dim)" }}>
          Arraste pra posicionar e use o controle pra dar zoom
        </p>
        <div
          style={{
            width: CAIXA,
            height: CAIXA,
            margin: "0 auto",
            borderRadius: "50%",
            overflow: "hidden",
            position: "relative",
            background: "var(--card-tint)",
            touchAction: "none",
            cursor: "grab",
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            aoComecarArrasto(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (arrastoRef.current) aoMoverArrasto(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            arrastoRef.current = null;
          }}
        >
          {editando.naturalW > 0 && (
            <img
              ref={imgRef}
              src={editando.src}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: (CAIXA - editando.naturalW * editando.escalaBase * ajuste.zoom) / 2 + ajuste.panX,
                top: (CAIXA - editando.naturalH * editando.escalaBase * ajuste.zoom) / 2 + ajuste.panY,
                width: editando.naturalW * editando.escalaBase * ajuste.zoom,
                height: editando.naturalH * editando.escalaBase * ajuste.zoom,
                userSelect: "none",
              }}
            />
          )}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {editando.naturalW === 0 && <img ref={imgRef} src={editando.src} alt="" onLoad={aoCarregarImagem} style={{ display: "none" }} />}
        </div>

        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.01}
          value={ajuste.zoom}
          onChange={(e) => aoMudarZoom(Number(e.target.value))}
          style={{ width: "100%", marginTop: 16 }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" className="mc-btn-primary" style={{ border: "none", flex: 1 }} onClick={confirmarEnquadramento}>
            Usar essa foto
          </button>
          <button type="button" className="mc-btn-secondary" onClick={() => setEditando(null)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          background: "var(--card-tint)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Foto de perfil" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <input ref={inputRef} type="file" accept="image/*" onChange={aoEscolherArquivo} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="mc-btn-secondary" onClick={() => inputRef.current?.click()}>
            {fotoAtual || preview ? "Trocar foto" : "Adicionar foto"}
          </button>
          {pendente && (
            <button type="button" className="mc-btn-primary" style={{ border: "none" }} onClick={salvar} disabled={enviando}>
              {enviando ? "Salvando..." : "Salvar foto"}
            </button>
          )}
        </div>
        {erro && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--red)" }}>{erro}</p>}
      </div>
    </div>
  );
}
