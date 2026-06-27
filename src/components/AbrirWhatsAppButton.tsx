"use client";

type AbrirWhatsAppButtonProps = {
  telefone: string;
  texto: string;
};

function limparTelefone(telefone: string) {
  return telefone.replace(/\D/g, "");
}

export function AbrirWhatsAppButton({ telefone, texto }: AbrirWhatsAppButtonProps) {
  const telefoneLimpo = limparTelefone(telefone);

  const telefoneComPais = telefoneLimpo.startsWith("55")
    ? telefoneLimpo
    : `55${telefoneLimpo}`;

  const mensagem = encodeURIComponent(texto);

  const url = `https://api.whatsapp.com/send?phone=${telefoneComPais}&text=${mensagem}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        background: "#0f172a",
        color: "#ffffff",
        border: "none",
        padding: "12px 18px",
        borderRadius: "12px",
        fontWeight: "bold",
        cursor: "pointer",
        minHeight: "46px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      Abrir WhatsApp
    </a>
  );
}