"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { manrope } from "../fonte";
import "../(protegido)/minha-conta.css";

const wrapperStyle: React.CSSProperties = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
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
    <div className={`mc-shell ${manrope.className}`} style={wrapperStyle}>
      <div className="mc-form-card" style={{ width: "100%", maxWidth: 400 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Confirmar entrada</h1>
          <p style={{ color: "var(--mc-ink-dim)", marginTop: 8 }}>
            Clique abaixo pra entrar na sua conta QuitaZAP.
          </p>
        </div>

        {status === "erro" && (
          <div style={{ background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.3)", color: "#fda4af", borderRadius: 12, padding: "10px 14px", fontSize: 13 }}>
            Esse link expirou ou é inválido. Volte e peça um novo.
          </div>
        )}

        <button onClick={confirmar} disabled={status === "confirmando"} className="mc-btn-primary" style={{ width: "100%", border: "none", opacity: status === "confirmando" ? 0.6 : 1 }}>
          {status === "confirmando" ? "Entrando..." : "Confirmar e entrar"}
        </button>

        <a href="/minha-conta/entrar" style={{ display: "block", textAlign: "center", fontSize: 13, color: "var(--mc-ink-dim)" }}>
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
    <div className={`mc-shell ${manrope.className}`} style={wrapperStyle}>
      <div className="mc-form-card" style={{ width: "100%", maxWidth: 400 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Minha Conta QuitaZAP</h1>
          <p style={{ color: "var(--mc-ink-dim)", marginTop: 8 }}>
            Entre com o número de WhatsApp cadastrado. A gente manda um link de acesso por lá.
          </p>
        </div>

        {enviado ? (
          <div style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", color: "#6ee7b7", borderRadius: 12, padding: "14px 16px", fontSize: 14 }}>
            ✅ Se esse número estiver cadastrado, você recebe um link de acesso no WhatsApp em instantes. Pode fechar essa aba e abrir o link por lá.
          </div>
        ) : (
          <form onSubmit={enviar} style={{ display: "grid", gap: 16 }}>
            <label className="mc-label">
              WhatsApp
              <input
                required
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(71) 99999-9999"
                className="mc-input"
              />
            </label>
            <button type="submit" disabled={enviando} className="mc-btn-primary" style={{ border: "none", opacity: enviando ? 0.6 : 1 }}>
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
