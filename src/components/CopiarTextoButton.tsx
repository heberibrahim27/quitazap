"use client";

import { useRef, useState } from "react";

type CopiarTextoButtonProps = {
  texto: string;
};

export function CopiarTextoButton({ texto }: CopiarTextoButtonProps) {
  const [copiado, setCopiado] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function copiarTexto() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
      } else {
        const textarea = textareaRef.current;

        if (!textarea) {
          throw new Error("Textarea nao encontrado");
        }

        textarea.style.display = "block";
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, texto.length);

        const copiou = document.execCommand("copy");

        textarea.blur();
        textarea.style.display = "none";

        if (!copiou) {
          throw new Error("Copia manual necessaria");
        }

        setCopiado(true);
      }

      setTimeout(() => {
        setCopiado(false);
      }, 2000);
    } catch {
      alert("No celular, toque no texto, selecione tudo e copie manualmente.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copiarTexto}
        style={{
          background: copiado ? "#0f172a" : "#16a34a",
          color: "#ffffff",
          border: "none",
          padding: "12px 18px",
          borderRadius: "12px",
          fontWeight: "bold",
          cursor: "pointer",
          minHeight: "46px",
        }}
      >
        {copiado ? "Texto copiado!" : "Copiar texto"}
      </button>

      <textarea
        ref={textareaRef}
        value={texto}
        readOnly
        style={{
          position: "fixed",
          left: "-9999px",
          top: "0",
          width: "1px",
          height: "1px",
          opacity: 0,
        }}
      />
    </>
  );
}