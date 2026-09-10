"use client";

import { useEffect, useState } from "react";
import { inscreverPush, removerInscricaoPush, enviarPushTeste, enviarPushDiagnostico } from "./push-actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// application server key precisa vir em Uint8Array — a PushManager API não
// aceita a string base64url direto.
function paraUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(base64);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

async function fingerprintLocal(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

type Estado = "carregando" | "suportado" | "ativo" | "nao-suportado" | "negado";

// Diagnóstico instrumentado (achado real, Ibrahim 10/09/2026): a tela
// mostrava "Ativadas neste dispositivo" e, ao testar, "Não entrou nenhum
// push" — permissão concedida, inscrição configurada e notificação
// EXIBIDA de fato são 3 coisas diferentes que um booleano só escondia.
// Cada estado abaixo corresponde a um elo real e verificável da cadeia,
// nunca um resumo otimista/pessimista de cima.
type EstadoDiagnostico =
  | "enviando"
  | "aceito-provedor"
  | "recebido-app"
  | "sem-confirmacao"
  | "falha-envio";

type Diagnostico = {
  testId: string;
  estado: EstadoDiagnostico;
  ambiente: Record<string, unknown>;
  serviceWorker: Record<string, unknown> | null;
  inscricaoLocal: { existe: boolean; fingerprint: string | null };
  bancoResultado?: { temInscricaoNoBanco: boolean; inscricaoLocalBateComBanco: boolean | null };
  provedorResultado?: unknown;
  swErro?: string | null;
};

const POLL_INTERVALO_MS = 1200;
const POLL_TENTATIVAS_MAX = 12; // ~14s de espera pela confirmação do SW

export function NotificacoesPush({ debug = false, buildId = "dev" }: { debug?: boolean; buildId?: string }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [testeMsg, setTesteMsg] = useState<string | null>(null);
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [diagnosticoErro, setDiagnosticoErro] = useState<string | null>(null);
  const [testeLocalMsg, setTesteLocalMsg] = useState<string | null>(null);

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
      // Mesmo cuidado do diagnóstico: serviceWorker.ready nunca resolve se
      // o SW não chegar a "active" — sem timeout, a tela inteira (incluindo
      // o painel de debug antes desta correção) ficava presa em
      // "carregando" pra sempre num aparelho com o SW nesse estado.
      const registro = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
      ]);
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

  async function testar() {
    setTesteMsg(null);
    setEnviandoTeste(true);
    try {
      const resultado = await enviarPushTeste();
      if ("erro" in resultado) {
        setTesteMsg(resultado.erro);
      } else {
        setTesteMsg("Teste enviado! Deve chegar no seu celular em instantes.");
      }
    } finally {
      setEnviandoTeste(false);
    }
  }

  // ── Diagnóstico completo (só em ?debug=1) ──────────────────────────
  async function coletarAmbiente() {
    const nav = navigator as Navigator & { standalone?: boolean };
    return {
      buildId,
      href: location.href,
      displayModeStandalone: typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)").matches : null,
      navigatorStandalone: nav.standalone ?? null,
      userAgent: navigator.userAgent,
      isSecureContext: window.isSecureContext,
      temNotification: typeof Notification !== "undefined",
      temPushManager: typeof PushManager !== "undefined",
      temServiceWorker: "serviceWorker" in navigator,
      // Lido AGORA, nunca uma preferência salva antes — é exatamente essa
      // confusão (permissão real vs. estado guardado desatualizado) que
      // causava a tela contraditória.
      permissaoAtual: typeof Notification !== "undefined" ? Notification.permission : "indisponivel",
    };
  }

  async function coletarServiceWorker() {
    if (!("serviceWorker" in navigator)) return null;
    const registro = await navigator.serviceWorker.getRegistration("/minha-conta/");
    if (!registro) return { encontrado: false };
    return {
      encontrado: true,
      scope: registro.scope,
      scriptURL: registro.active?.scriptURL ?? registro.waiting?.scriptURL ?? registro.installing?.scriptURL ?? null,
      activeState: registro.active?.state ?? null,
      temInstalling: Boolean(registro.installing),
      temWaiting: Boolean(registro.waiting),
    };
  }

  async function aguardarRecibo(testId: string): Promise<{ recebidoPeloSw: boolean; swErro: string | null } | null> {
    for (let i = 0; i < POLL_TENTATIVAS_MAX; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVALO_MS));
      try {
        const res = await fetch(`/api/minha-conta/push/recibo?testId=${encodeURIComponent(testId)}`);
        if (res.ok) {
          const dados = await res.json();
          if (dados.recebidoPeloSw) return { recebidoPeloSw: true, swErro: dados.swErro ?? null };
        }
      } catch {
        // segue tentando — falha de rede no polling não é falha do teste
      }
    }
    return { recebidoPeloSw: false, swErro: null };
  }

  async function rodarDiagnostico() {
    setDiagnostico(null);
    setDiagnosticoErro(null);
    const testId = crypto.randomUUID();

    let ambiente: Awaited<ReturnType<typeof coletarAmbiente>>;
    let serviceWorker: Record<string, unknown> | null;
    let endpointLocal: string | null = null;
    let fingerprintLocalStr: string | null = null;

    try {
      ambiente = await coletarAmbiente();
      serviceWorker = await coletarServiceWorker();

      // navigator.serviceWorker.ready NUNCA resolve se o SW não chegar a
      // "active" — num aparelho onde isso está travado (justamente o tipo
      // de coisa que este diagnóstico existe pra achar), o botão pareceria
      // "não fazer nada" pra sempre em vez de reportar isso. Timeout curto
      // garante que o diagnóstico sempre termina e mostra o que encontrou,
      // mesmo com o SW num estado ruim.
      try {
        const registro = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout esperando serviceWorker.ready (3s)")), 3000)),
        ]);
        const inscricao = await registro.pushManager.getSubscription();
        endpointLocal = inscricao?.endpoint ?? null;
        if (endpointLocal) fingerprintLocalStr = await fingerprintLocal(endpointLocal);
      } catch (e) {
        // segue sem inscrição local — o diagnóstico mostra isso como dado
        // (inclusive o motivo do timeout/erro), não trava o resto do teste.
        serviceWorker = { ...(serviceWorker ?? {}), erroAoLerInscricaoLocal: e instanceof Error ? e.message : String(e) };
      }
    } catch (e) {
      setDiagnosticoErro(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      return;
    }

    setDiagnostico({
      testId,
      estado: "enviando",
      ambiente,
      serviceWorker,
      inscricaoLocal: { existe: endpointLocal != null, fingerprint: fingerprintLocalStr },
    });

    let resultado: Awaited<ReturnType<typeof enviarPushDiagnostico>>;
    try {
      resultado = await enviarPushDiagnostico(testId, endpointLocal);
    } catch (e) {
      setDiagnosticoErro(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      return;
    }

    if ("erro" in resultado) {
      setDiagnostico((atual) => (atual ? { ...atual, estado: "falha-envio", swErro: resultado.erro } : atual));
      return;
    }

    const algumSucessoNoProvedor = resultado.resultadosProvedor.some((r) => r.ok);
    setDiagnostico((atual) =>
      atual
        ? {
            ...atual,
            estado: algumSucessoNoProvedor ? "aceito-provedor" : "falha-envio",
            bancoResultado: {
              temInscricaoNoBanco: resultado.temInscricaoNoBanco,
              inscricaoLocalBateComBanco: resultado.inscricaoLocalBateComBanco,
            },
            provedorResultado: resultado.resultadosProvedor,
          }
        : atual
    );

    if (!algumSucessoNoProvedor) return; // provedor recusou — não faz sentido esperar o SW confirmar

    const recibo = await aguardarRecibo(testId);
    setDiagnostico((atual) =>
      atual
        ? { ...atual, estado: recibo?.recebidoPeloSw ? "recebido-app" : "sem-confirmacao", swErro: recibo?.swErro ?? null }
        : atual
    );
  }

  // Isola exibição local (permissão + service worker) do transporte de
  // rede: chama showNotification() direto, sem passar pelo push de
  // verdade — se isso funciona mas o diagnóstico acima não confirma
  // "recebido-app", o problema é na rede/provedor, não no aparelho.
  async function testarExibicaoLocal() {
    setTesteLocalMsg(null);
    try {
      const registro = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout esperando serviceWorker.ready (3s)")), 3000)),
      ]);
      await registro.showNotification("Teste local (sem rede)", {
        body: "Se isso apareceu, a exibição local funciona — problema (se houver) está no transporte push.",
        icon: "/minha-conta/icons/icon-192.png",
      });
      setTesteLocalMsg("Chamada aceita — verifique se a notificação apareceu.");
    } catch (e) {
      setTesteLocalMsg(`Falhou: ${e instanceof Error ? e.message : String(e)}`);
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

  // Achado real, Ibrahim 10/09/2026: o painel de diagnóstico ficava
  // aninhado dentro de `estado === "ativo"` (mais embaixo) — exatamente o
  // estado que costuma estar errado/travado quando alguém PRECISA do
  // diagnóstico. Fora do modo debug o comportamento de sempre continua
  // intacto (esconde o card inteiro enquanto carrega ou se não suporta);
  // com ?debug=1 o card sempre aparece, não suportado virando só mais um
  // dado pra investigar em vez de silêncio total.
  if (!debug && (estado === "carregando" || estado === "nao-suportado")) return null;

  const LABEL_DIAGNOSTICO: Record<EstadoDiagnostico, string> = {
    enviando: "Enviando teste...",
    "aceito-provedor": "Provedor aceitou — aguardando confirmação de exibição...",
    "recebido-app": "✅ Confirmado: a notificação foi exibida neste aparelho.",
    "sem-confirmacao": "⏳ Sem confirmação de exibição em ~14s — pode ser normal (app em segundo plano nem sempre confirma rápido) ou indicar falha na exibição local.",
    "falha-envio": "❌ O provedor de push recusou o envio (ver detalhe abaixo).",
  };

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
      {estado === "ativo" && (
        <>
          <button
            type="button"
            className="mc-btn-secondary"
            style={{ marginTop: 10, width: "100%" }}
            onClick={testar}
            disabled={enviandoTeste}
          >
            {enviandoTeste ? "Enviando..." : "Enviar notificação de teste"}
          </button>
          {testeMsg && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: testeMsg.startsWith("Teste enviado") ? "var(--green)" : "var(--red)", lineHeight: 1.5 }}>
              {testeMsg}
            </p>
          )}
        </>
      )}

      {/* Fora de `estado === "ativo"` de propósito (achado real, Ibrahim
          10/09/2026): o diagnóstico precisa aparecer mesmo quando o
          estado detectado é "negado"/"suportado"/etc — é exatamente
          nesses casos que ele é mais necessário. */}
      {debug && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--mc-line)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--ink-dim)" }}>
            DIAGNÓSTICO (build {buildId.slice(0, 7)}) — estado detectado: {estado}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="mc-btn-secondary" onClick={rodarDiagnostico}>
              Rodar diagnóstico completo
            </button>
            <button type="button" className="mc-btn-secondary" onClick={testarExibicaoLocal}>
              Testar exibição local (sem rede)
            </button>
          </div>
          {testeLocalMsg && <p style={{ margin: "8px 0 0", fontSize: 12 }}>{testeLocalMsg}</p>}
          {diagnostico && (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>{LABEL_DIAGNOSTICO[diagnostico.estado]}</p>
              <textarea
                readOnly
                value={JSON.stringify(diagnostico, null, 2)}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  width: "100%", minHeight: 260, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
                  background: "#000", color: "#0f0", border: "1px solid var(--mc-line)", borderRadius: 8, padding: 8,
                }}
              />
            </div>
          )}
          {diagnosticoErro && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--red)", lineHeight: 1.5 }}>
              ⚠️ O diagnóstico não terminou: {diagnosticoErro}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
