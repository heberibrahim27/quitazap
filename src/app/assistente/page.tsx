"use client";

// ─────────────────────────────────────────
// QuitaZAP — Assistente Admin (IA interna)
// /assistente
// ─────────────────────────────────────────
// Chat pra equipe interna: perguntas sobre métricas/clientes e ações
// simples (marcar pago, cadastrar contato) com fluxo propor → confirmar —
// nunca executa escrita sem clique explícito em "Confirmar" (ver
// api/assistente-admin/chat e /confirmar). Histórico vive só no browser
// (nada persistido no servidor) pra v1.

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { IconBot, IconArrowUpRight, IconAlertTriangle } from "@/components/icons";

type Mensagem =
  | { role: "user"; texto: string }
  | { role: "assistant"; texto: string }
  | { role: "confirmacao"; resumo: string; ferramenta: string; argumentos: Record<string, unknown>; status: "pendente" | "confirmada" | "cancelada" | "erro" };

const SUGESTOES = [
  "Quantos clientes pagos temos esse mês?",
  "Qual o MRR atual?",
  "Quantos cancelaram esse mês?",
  "Lista os clientes cancelados",
];

function paraHistoricoAPI(mensagens: Mensagem[]) {
  return mensagens
    .filter((m): m is Extract<Mensagem, { role: "user" | "assistant" }> => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.texto }));
}

export default function AssistentePage() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [input, setInput] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [confirmandoIdx, setConfirmandoIdx] = useState<number | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, carregando]);

  async function enviar(textoForcado?: string) {
    const texto = (textoForcado ?? input).trim();
    if (!texto || carregando) return;

    const novasMensagens: Mensagem[] = [...mensagens, { role: "user", texto }];
    setMensagens(novasMensagens);
    setInput("");
    setCarregando(true);

    try {
      const res = await fetch("/api/assistente-admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: paraHistoricoAPI(novasMensagens) }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensagens((atual) => [...atual, { role: "assistant", texto: data?.error || "Erro ao falar com o assistente." }]);
      } else if (data.tipo === "confirmacao") {
        setMensagens((atual) => [
          ...atual,
          { role: "confirmacao", resumo: data.resumo, ferramenta: data.ferramenta, argumentos: data.argumentos, status: "pendente" },
        ]);
      } else {
        setMensagens((atual) => [...atual, { role: "assistant", texto: data.texto || "Sem resposta." }]);
      }
    } catch {
      setMensagens((atual) => [...atual, { role: "assistant", texto: "Erro de conexão — tenta de novo." }]);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmar(idx: number) {
    const msg = mensagens[idx];
    if (msg.role !== "confirmacao") return;
    setConfirmandoIdx(idx);

    try {
      const res = await fetch("/api/assistente-admin/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ferramenta: msg.ferramenta, argumentos: msg.argumentos }),
      });
      const data = await res.json();

      setMensagens((atual) => {
        const copia = [...atual];
        copia[idx] = { ...msg, status: data.ok ? "confirmada" : "erro" };
        copia.splice(idx + 1, 0, {
          role: "assistant",
          texto: data.ok ? `✅ Feito. ${data.resumo}` : `❌ Não deu pra executar: ${data.erro}`,
        });
        return copia;
      });
    } catch {
      setMensagens((atual) => {
        const copia = [...atual];
        copia[idx] = { ...msg, status: "erro" };
        return copia;
      });
    } finally {
      setConfirmandoIdx(null);
    }
  }

  function cancelar(idx: number) {
    setMensagens((atual) => {
      const copia = [...atual];
      const msg = copia[idx];
      if (msg.role !== "confirmacao") return atual;
      copia[idx] = { ...msg, status: "cancelada" };
      copia.splice(idx + 1, 0, { role: "assistant", texto: "Ação cancelada." });
      return copia;
    });
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Assistente</h1>
          <p className="qa-page-subtitle">Pergunte sobre métricas e clientes, ou peça uma ação — toda ação de escrita pede confirmação antes de executar.</p>
        </div>
      </div>

      <div className="qa-alert qa-alert-amber" style={{ marginBottom: 16 }}>
        <IconAlertTriangle size={16} />
        <span>Não tem acesso a dado financeiro pessoal do cliente (renda, despesas, dívidas) — só dado de conta/assinatura/gestão.</span>
      </div>

      <div className="qa-card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: 460, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          {mensagens.length === 0 && (
            <div style={{ margin: "auto", textAlign: "center", color: "var(--qa-gray-500)" }}>
              <IconBot size={28} />
              <p style={{ marginTop: 10, fontSize: 13.5 }}>Pergunte algo ou tente uma sugestão abaixo.</p>
            </div>
          )}

          {mensagens.map((m, idx) => {
            if (m.role === "user") {
              return (
                <div key={idx} style={{ alignSelf: "flex-end", maxWidth: "80%", background: "var(--qa-gradient)", color: "#fff", borderRadius: "14px 14px 2px 14px", padding: "9px 14px", fontSize: 13.5 }}>
                  {m.texto}
                </div>
              );
            }
            if (m.role === "assistant") {
              return (
                <div key={idx} style={{ alignSelf: "flex-start", maxWidth: "85%", background: "rgba(255,255,255,0.05)", border: "1px solid var(--qa-line-soft)", borderRadius: "14px 14px 14px 2px", padding: "9px 14px", fontSize: 13.5, whiteSpace: "pre-wrap" }}>
                  {m.texto}
                </div>
              );
            }
            // confirmação
            return (
              <div key={idx} style={{ alignSelf: "flex-start", maxWidth: "90%", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 14, padding: "12px 14px" }}>
                <p style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 600 }}>{m.resumo}</p>
                {m.status === "pendente" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => confirmar(idx)}
                      disabled={confirmandoIdx === idx}
                      className="qa-btn-primary"
                      style={{ padding: "6px 14px", fontSize: 12.5 }}
                    >
                      {confirmandoIdx === idx ? "Executando..." : "Confirmar"}
                    </button>
                    <button
                      onClick={() => cancelar(idx)}
                      disabled={confirmandoIdx === idx}
                      className="qa-btn-secondary"
                      style={{ padding: "6px 14px", fontSize: 12.5 }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                {m.status !== "pendente" && (
                  <span style={{ fontSize: 12, color: "var(--qa-gray-500)" }}>
                    {m.status === "confirmada" ? "✅ confirmada" : m.status === "cancelada" ? "cancelada" : "erro ao executar"}
                  </span>
                )}
              </div>
            );
          })}

          {carregando && (
            <div style={{ alignSelf: "flex-start", fontSize: 13, color: "var(--qa-gray-500)" }}>Pensando...</div>
          )}
          <div ref={fimRef} />
        </div>

        <div style={{ borderTop: "1px solid var(--qa-line)", padding: 14, display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Pergunte ou peça uma ação..."
            disabled={carregando}
            className="qa-input"
            style={{ flex: 1 }}
          />
          <button onClick={() => enviar()} disabled={carregando || !input.trim()} className="qa-btn-primary" style={{ padding: "0 18px" }}>
            Enviar
          </button>
        </div>
      </div>

      {mensagens.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {SUGESTOES.map((s) => (
            <button key={s} onClick={() => enviar(s)} className="qa-btn-secondary" style={{ fontSize: 12.5, padding: "6px 12px" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <Link href="/painel" style={{ color: "#7dc4ff", fontWeight: 600, fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <IconArrowUpRight size={13} style={{ transform: "rotate(-135deg)" }} /> Voltar para o dashboard
      </Link>
    </div>
  );
}
