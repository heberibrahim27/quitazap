"use client";

import { useEffect, useState } from "react";
import { inscreverPush, removerInscricaoPush } from "./push-actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// application server key precisa vir em Uint8Array — a PushManager API não
// aceita a string base64url direto.
function paraUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(base64);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

type Estado = "carregando" | "suportado" | "ativo" | "nao-suportado" | "negado";

export function NotificacoesPush() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function verificar() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !VAPID_PUBLIC_KEY) {
        setEstado("nao-suportado");
        return;
      }
      if (Notification.permission === "denied") {
        setEstado("negado");
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const inscricaoAtual = await registro.pushManager.getSubscription();
      setEstado(inscricaoAtual ? "ativo" : "suportado");
    }
    verificar().catch(() => setEstado("nao-suportado"));
  }, []);

  async function ativar() {
    setErro(null);
    setProcessando(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "negado" : "suportado");
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: paraUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      });
      await inscreverPush(inscricao.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      setEstado("ativo");
    } catch {
      setErro("Não consegui ativar as notificações. Se você estiver no iPhone, adicione o QuitaZAP à Tela de Início primeiro (Compartilhar → Adicionar à Tela de Início) e tente de novo por lá.");
    } finally {
      setProcessando(false);
    }
  }

  async function desativar() {
    setProcessando(true);
    try {
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.getSubscription();
      if (inscricao) {
        await removerInscricaoPush(inscricao.endpoint);
        await inscricao.unsubscribe();
      }
      setEstado("suportado");
    } finally {
      setProcessando(false);
    }
  }

  if (estado === "carregando" || estado === "nao-suportado") return null;

  return (
    <div className="mc-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            width: 38, height: 38, borderRadius: 12, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: estado === "ativo" ? "var(--green-soft)" : "rgba(30,99,233,0.1)",
            color: estado === "ativo" ? "var(--green)" : "var(--blue)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Notificações</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-dim)" }}>
            {estado === "ativo"
              ? "Ativadas neste dispositivo."
              : estado === "negado"
                ? "Bloqueadas no navegador — ative nas permissões do site pra usar."
                : "Receba avisos de vencimento e de orçamento estourado direto aqui."}
          </p>
        </div>
        {estado !== "negado" && (
          <button
            type="button"
            className={estado === "ativo" ? "mc-btn-secondary" : "mc-btn-primary"}
            style={estado === "ativo" ? undefined : { border: "none" }}
            onClick={estado === "ativo" ? desativar : ativar}
            disabled={processando}
          >
            {processando ? "..." : estado === "ativo" ? "Desativar" : "Ativar"}
          </button>
        )}
      </div>
      {erro && <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--red)", lineHeight: 1.5 }}>{erro}</p>}
    </div>
  );
}
