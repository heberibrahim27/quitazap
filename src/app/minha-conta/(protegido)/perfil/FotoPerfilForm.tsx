"use client";

import { useRef, useState, useTransition } from "react";

const LADO_MAXIMO = 512;
const QUALIDADE = 0.85;

async function redimensionar(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.drawImage(bitmap, 0, 0, largura, altura);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao processar imagem."))),
      "image/jpeg",
      QUALIDADE
    );
  });
}

export function FotoPerfilForm({
  fotoAtual,
  enviarFoto,
}: {
  fotoAtual: string | null;
  enviarFoto: (formData: FormData) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(fotoAtual);
  const [pendente, setPendente] = useState<Blob | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro(null);

    if (!arquivo.type.startsWith("image/")) {
      setErro("Escolha um arquivo de imagem.");
      return;
    }
    try {
      const blob = await redimensionar(arquivo);
      setPendente(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setErro("Não consegui processar essa imagem. Tente outra.");
    }
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

  return (
    <div className="mc-card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 64,
          height: 64,
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
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
