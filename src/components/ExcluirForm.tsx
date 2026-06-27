"use client";

import { useRef } from "react";

interface ExcluirFormProps {
  action: (fd: FormData) => Promise<void>;
  mensagem: string;
  label?: string;
  tamanho?: "pequeno" | "normal";
  /** Campos hidden extras incluídos no FormData ao submeter */
  fields?: Record<string, string>;
}

export function ExcluirForm({
  action,
  mensagem,
  label = "Excluir",
  tamanho = "normal",
  fields,
}: ExcluirFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const style: React.CSSProperties =
    tamanho === "pequeno"
      ? {
          background: "none",
          border: "1px solid #fca5a5",
          color: "#dc2626",
          padding: "4px 10px",
          borderRadius: "8px",
          fontWeight: 600,
          fontSize: 12,
          cursor: "pointer",
        }
      : {
          background: "#fee2e2",
          border: "1px solid #fca5a5",
          color: "#dc2626",
          padding: "12px 18px",
          borderRadius: "12px",
          fontWeight: 700,
          fontSize: 15,
          cursor: "pointer",
        };

  return (
    <form ref={formRef} action={action} style={{ display: "inline" }}>
      {fields &&
        Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <button
        type="button"
        style={style}
        onClick={() => {
          if (window.confirm(mensagem)) {
            formRef.current?.requestSubmit();
          }
        }}
      >
        {label}
      </button>
    </form>
  );
}
