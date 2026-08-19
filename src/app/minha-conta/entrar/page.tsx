"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const cardStyle: React.CSSProperties = {
  width: "100%", maxWidth: 400, background: "#fff", borderRadius: 20, padding: 32,
  boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
};
const wrapperStyle: React.CSSProperties = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: 24,
};

function ConfirmarAcesso({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "confirmando" | "erro">("idle");

  async function confirmar() {
    setStatus("confirmando");
    try {
      const res = await fetch("/api/auth-cliente/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setStatus("erro");
        return;
      }
      router.push("/minha-conta");
    } catch {
      setStatus("erro");
    }
  }

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Confirmar entrada</h1>
        <p style={{ color: "#64748b", marginTop: 8, marginBottom: 24 }}>
          Clique abaixo pra entrar na sua conta QuitaZAP.
        </p>

        {status === "erro" && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 12, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
            Esse link expirou ou é inválido. Volte e peça um novo.
          </div>
        )}

        <button
          onClick={confirmar}
          disabled={status === "confirmando"}
          style={{
            width: "100%", padding: 12, borderRadius: 12, border: "none",
            background: status === "confirmando" ? "#94a3b8" : "#16a34a", color: "#fff",
            fontWeight: 700, fontSize: 15, cursor: status === "confirmando" ? "not-allowed" : "pointer",
          }}
        >
          {status === "confirmando" ? "Entrando..." : "Confirmar e entrar"}
        </button>

        <a href="/minha-conta/entrar" style={{ display: "block", textAlign: "center", marginTop: 16, fontSize: 13, color: "#64748b" }}>
          Pedir um novo link
        </a>
      </div>
    </div>
  );
}

function FormularioSolicitar() {
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await fetch("/api/auth-cliente/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone }),
      });
      setEnviado(true);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Minha Conta QuitaZAP</h1>
        <p style={{ color: "#64748b", marginTop: 8, marginBottom: 24 }}>
          Entre com o número de WhatsApp cadastrado. A gente manda um link de acesso por lá.
        </p>

        {enviado ? (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: 12, padding: "14px 16px", fontSize: 14 }}>
            ✅ Se esse número estiver cadastrado, você recebe um link de acesso no WhatsApp em instantes. Pode fechar essa aba e abrir o link por lá.
          </div>
        ) : (
          <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 8, textTransform: "uppercase" }}>
                WhatsApp
              </label>
              <input
                required
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(71) 99999-9999"
                style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 15, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <button
              type="submit"
              disabled={enviando}
              style={{
                padding: 12, borderRadius: 12, border: "none",
                background: enviando ? "#94a3b8" : "#16a34a", color: "#fff",
                fontWeight: 700, fontSize: 15, cursor: enviando ? "not-allowed" : "pointer",
              }}
            >
              {enviando ? "Enviando..." : "Receber link de acesso"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function EntrarConteudo() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (token) return <ConfirmarAcesso token={token} />;
  return <FormularioSolicitar />;
}

export default function EntrarPage() {
  return (
    <Suspense fallback={null}>
      <EntrarConteudo />
    </Suspense>
  );
}
