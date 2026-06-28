"use client";

// ─────────────────────────────────────────
// QuitaZAP — Cobrador Automático (painel)
// /cobrador — redesign moderno v2
// ─────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";

interface Cobranca {
  id: string;
  credorNome: string;
  devedorNome: string;
  devedorFone: string;
  valor: number;
  vencimento: string;
  mensagem: string | null;
  pixChave: string | null;
  status: "PENDENTE" | "ENVIADA" | "PAGA" | "CANCELADA";
  etapa: number;
  tentativas: number;
  ultimoEnvio: string | null;
  criadoEm: string;
}

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDataCurta(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function diasRestantes(vencimento: string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const venc = new Date(vencimento); venc.setHours(0, 0, 0, 0);
  return Math.round((venc.getTime() - hoje.getTime()) / 86_400_000);
}

const STATUS_DOT: Record<string, string> = {
  PENDENTE:  "bg-amber-400",
  ENVIADA:   "bg-blue-400",
  PAGA:      "bg-emerald-400",
  CANCELADA: "bg-gray-300",
};
const STATUS_PILL: Record<string, string> = {
  PENDENTE:  "bg-amber-100 text-amber-800",
  ENVIADA:   "bg-blue-100 text-blue-800",
  PAGA:      "bg-emerald-100 text-emerald-800",
  CANCELADA: "bg-gray-100 text-gray-500",
};
const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente", ENVIADA: "Enviada", PAGA: "Paga", CANCELADA: "Cancelada",
};
const ETAPA_PILL: Record<number, string> = {
  1: "bg-sky-100 text-sky-700",
  2: "bg-orange-100 text-orange-700",
  3: "bg-red-100 text-red-700",
};
const ETAPA_LABEL: Record<number, string> = {
  1: "Amigável", 2: "Firme", 3: "Última chance",
};

export default function CobradorPage() {
  const [cobrancas, setCobrancas]     = useState<Cobranca[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [filtro, setFiltro]           = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [criando, setCriando]         = useState(false);
  const [disparando, setDisparando]   = useState<string | null>(null);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [form, setForm]               = useState({
    devedorNome: "", devedorFone: "", valor: "", diaVencimento: "", mensagem: "", pixChave: "",
  });

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    const qs = filtro ? `&status=${filtro}` : "";
    const res = await fetch(`/api/cobrador?limit=100${qs}`);
    if (res.ok) {
      const d = await res.json();
      setCobrancas(d.cobrancas ?? []);
      setTotal(d.total ?? 0);
    }
    setLoading(false);
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  async function marcarPaga(id: string) {
    const res = await fetch("/api/cobrador", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "PAGA" }),
    });
    if (res.ok) {
      setCobrancas((prev) => prev.map((c) => c.id === id ? { ...c, status: "PAGA" } : c));
      showToast("✅ Marcada como paga!");
    } else showToast("Erro ao atualizar.", false);
  }

  async function cancelarCobranca(id: string) {
    const res = await fetch("/api/cobrador", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "CANCELADA" }),
    });
    if (res.ok) {
      setCobrancas((prev) => prev.map((c) => c.id === id ? { ...c, status: "CANCELADA" } : c));
      showToast("Cobrança cancelada.");
    } else showToast("Erro ao cancelar.", false);
  }

  async function dispararTodas() {
    setDisparando("all");
    const res = await fetch("/api/cobrador/disparar", { method: "POST" });
    const d   = await res.json();
    setDisparando(null);
    if (res.ok) {
      showToast(d.disparadas > 0 ? `🚀 ${d.disparadas} mensagem(ns) enviada(s)!` : "Nenhuma pendente para hoje.");
      carregar();
    } else showToast(`Erro: ${d.error ?? "desconhecido"}`, false);
  }

  async function enviarAgora() {
    setDisparando("now");
    const res = await fetch("/api/cobrador/disparar", { method: "POST" });
    const d   = await res.json();
    setDisparando(null);
    if (res.ok) { showToast(`📤 ${d.disparadas ?? 0} enviada(s)!`); carregar(); }
    else showToast("Erro ao disparar.", false);
  }

  async function criarCobranca(e: React.FormEvent) {
    e.preventDefault(); setCriando(true);
    const res = await fetch("/api/cobrador", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        devedorNome:   form.devedorNome.trim(),
        devedorFone:   form.devedorFone.trim(),
        valor:         parseFloat(form.valor.replace(",", ".")),
        diaVencimento: parseInt(form.diaVencimento),
        mensagem:      form.mensagem.trim() || undefined,
        pixChave:      form.pixChave.trim() || undefined,
      }),
    });
    setCriando(false);
    if (res.ok) {
      showToast("✅ Cobrança criada!");
      setForm({ devedorNome: "", devedorFone: "", valor: "", diaVencimento: "", mensagem: "", pixChave: "" });
      setMostrarForm(false); carregar();
    } else {
      const err = await res.json();
      showToast(`Erro: ${err.error ?? "desconhecido"}`, false);
    }
  }

  // KPIs
  const pendentes     = cobrancas.filter((c) => c.status === "PENDENTE").length;
  const enviadas      = cobrancas.filter((c) => c.status === "ENVIADA").length;
  const pagas         = cobrancas.filter((c) => c.status === "PAGA").length;
  const valorAberto   = cobrancas.filter((c) => c.status !== "PAGA" && c.status !== "CANCELADA").reduce((s, c) => s + c.valor, 0);
  const valorRecebido = cobrancas.filter((c) => c.status === "PAGA").reduce((s, c) => s + c.valor, 0);

  return (
    <div className="min-h-screen bg-[#f4f6fb]">

      {/* ── Hero header ─────────────────────── */}
      <div className="bg-gradient-to-br from-[#1a1f36] to-[#2e3a6e] text-white">
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-300 mb-1">QuitaZAP</p>
              <h1 className="text-2xl sm:text-3xl font-bold">💸 Cobrador Automático</h1>
              <p className="text-sm text-blue-200 mt-1">{total} cobrança{total !== 1 ? "s" : ""} registradas</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setMostrarForm(!mostrarForm)}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition backdrop-blur"
              >
                + Nova cobrança
              </button>
              <button
                onClick={dispararTodas}
                disabled={disparando === "all"}
                className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-blue-900/40 transition"
              >
                {disparando === "all" ? "⏳ Enviando..." : "🚀 Disparar pendentes"}
              </button>
            </div>
          </div>

          {/* KPI cards inside hero */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
            {[
              { label: "Pendentes",  val: pendentes,            icon: "⏳", color: "bg-amber-500/20 border-amber-400/30  text-amber-300"  },
              { label: "Enviadas",   val: enviadas,             icon: "📤", color: "bg-blue-500/20  border-blue-400/30   text-blue-300"   },
              { label: "Pagas",      val: pagas,                icon: "✅", color: "bg-emerald-500/20 border-emerald-400/30 text-emerald-300" },
              { label: "Em aberto",  val: fmtValor(valorAberto),  icon: "💰", color: "bg-orange-500/20 border-orange-400/30 text-orange-300" },
              { label: "Recebido",   val: fmtValor(valorRecebido),icon: "🏆", color: "bg-green-500/20  border-green-400/30  text-green-300"  },
            ].map((k) => (
              <div key={k.label} className={`${k.color} border rounded-2xl p-3 backdrop-blur`}>
                <div className="text-xl mb-0.5">{k.icon}</div>
                <div className="text-lg sm:text-xl font-bold leading-tight">{k.val}</div>
                <div className="text-xs font-medium opacity-80 mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Conteúdo ─────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium text-white transition-all ${
            toast.ok ? "bg-emerald-600" : "bg-red-600"
          }`}>
            {toast.msg}
          </div>
        )}

        {/* ── Formulário ─── */}
        {mostrarForm && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800">Nova cobrança</h2>
                <p className="text-xs text-gray-400 mt-0.5">Ou no WhatsApp: <em>Cobrar João, 71999..., R$500, dia 20</em></p>
              </div>
              <button onClick={() => setMostrarForm(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <form onSubmit={criarCobranca} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { field: "devedorNome",   label: "Nome do devedor",      placeholder: "João Silva",         req: true  },
                { field: "devedorFone",   label: "WhatsApp do devedor",   placeholder: "71999999999",        req: true  },
                { field: "valor",         label: "Valor (R$)",            placeholder: "500,00",             req: true  },
                { field: "diaVencimento", label: "Dia do vencimento",     placeholder: "20",                 req: true  },
                { field: "pixChave",      label: "Chave Pix (opcional)",  placeholder: "CPF, e-mail, etc.", req: false },
                { field: "mensagem",      label: "Mensagem personalizada",placeholder: "João, combinamos…",  req: false },
              ].map(({ field, label, placeholder, req }) => (
                <div key={field}>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {label}{req && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <input
                    required={req}
                    value={form[field as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition"
                  />
                </div>
              ))}
              <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setMostrarForm(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl transition">
                  Cancelar
                </button>
                <button type="submit" disabled={criando}
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 disabled:opacity-50 text-white text-sm font-bold px-7 py-2.5 rounded-xl shadow-md shadow-green-200 transition">
                  {criando ? "Salvando..." : "Criar cobrança"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Filtros ─── */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { v: "",          label: "Todas"      },
            { v: "PENDENTE",  label: "⏳ Pendentes" },
            { v: "ENVIADA",   label: "📤 Enviadas"  },
            { v: "PAGA",      label: "✅ Pagas"     },
            { v: "CANCELADA", label: "Canceladas"  },
          ].map((f) => (
            <button key={f.v} onClick={() => setFiltro(f.v)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition border ${
                filtro === f.v
                  ? "bg-[#1a1f36] text-white border-[#1a1f36] shadow"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}>
              {f.label}
            </button>
          ))}
          <button onClick={carregar}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-200 px-3 py-2 rounded-full transition">
            ↺ Atualizar
          </button>
        </div>

        {/* ── Lista ─── */}
        {loading ? (
          <div className="text-center py-20 text-4xl animate-pulse">⏳</div>
        ) : cobrancas.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-14 text-center">
            <div className="text-6xl mb-4">💸</div>
            <p className="font-bold text-gray-700 text-lg mb-1">Nenhuma cobrança ainda</p>
            <p className="text-sm text-gray-400 mb-5">Crie uma acima ou mande no WhatsApp:</p>
            <code className="inline-block bg-gray-50 border border-gray-200 text-gray-600 text-xs px-4 py-2 rounded-xl">
              Cobrar João Silva, 71999999999, R$500, dia 20
            </code>
          </div>
        ) : (
          <div className="space-y-3">
            {cobrancas.map((c) => {
              const dias   = diasRestantes(c.vencimento);
              const atrasada = dias < 0 && c.status !== "PAGA" && c.status !== "CANCELADA";
              const urgente  = !atrasada && dias <= 3 && dias >= 0 && c.status === "PENDENTE";

              return (
                <div key={c.id}
                  className={`bg-white rounded-2xl border shadow-sm transition hover:shadow-md ${
                    atrasada ? "border-red-200" : urgente ? "border-amber-200" : "border-gray-100"
                  }`}>
                  {/* Linha colorida no topo para status */}
                  <div className={`h-1 rounded-t-2xl ${STATUS_DOT[c.status]}`} />

                  <div className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      {/* Avatar inicial */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 mt-0.5">
                        {c.devedorNome.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {/* Linha 1: Nome + badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-gray-900">{c.devedorNome}</span>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${STATUS_PILL[c.status]}`}>
                            {STATUS_LABEL[c.status]}
                          </span>
                          {c.status === "ENVIADA" && (
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${ETAPA_PILL[c.etapa] ?? "bg-gray-100 text-gray-600"}`}>
                              {ETAPA_LABEL[c.etapa]}
                            </span>
                          )}
                          {atrasada && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                              🚨 {Math.abs(dias)}d atraso
                            </span>
                          )}
                          {urgente && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                              ⚡ vence {dias === 0 ? "hoje" : `em ${dias}d`}
                            </span>
                          )}
                        </div>

                        {/* Linha 2: Detalhes */}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                          <span>{c.devedorFone}</span>
                          <span className="font-bold text-gray-800 text-sm">{fmtValor(c.valor)}</span>
                          <span>📅 {fmtDataCurta(c.vencimento)}</span>
                          {c.pixChave && <span>🔑 Pix: {c.pixChave}</span>}
                          {c.ultimoEnvio && <span>📤 {fmtDataCurta(c.ultimoEnvio)} ({c.tentativas}×)</span>}
                        </div>

                        {c.mensagem && (
                          <p className="mt-1.5 text-xs text-gray-400 italic">"{c.mensagem}"</p>
                        )}
                      </div>

                      {/* Ações — desktop: coluna vertical */}
                      <div className="hidden sm:flex flex-col gap-1.5 flex-shrink-0 items-end">
                        {(c.status === "PENDENTE" || c.status === "ENVIADA") && (
                          <button onClick={() => marcarPaga(c.id)}
                            className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-xl shadow-sm transition whitespace-nowrap">
                            ✅ Paga
                          </button>
                        )}
                        {c.status === "PENDENTE" && (
                          <button onClick={enviarAgora} disabled={!!disparando}
                            className="text-xs font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl shadow-sm transition whitespace-nowrap">
                            {disparando === "now" ? "⏳" : "📤 Enviar agora"}
                          </button>
                        )}
                        {c.status !== "CANCELADA" && c.status !== "PAGA" && (
                          <button onClick={() => cancelarCobranca(c.id)}
                            className="text-xs text-gray-400 hover:text-red-500 transition px-2">
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Ações — mobile: linha horizontal */}
                    <div className="flex sm:hidden gap-2 mt-3 pt-3 border-t border-gray-50">
                      {(c.status === "PENDENTE" || c.status === "ENVIADA") && (
                        <button onClick={() => marcarPaga(c.id)}
                          className="flex-1 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-xl transition">
                          ✅ Paga
                        </button>
                      )}
                      {c.status === "PENDENTE" && (
                        <button onClick={enviarAgora} disabled={!!disparando}
                          className="flex-1 text-xs font-bold bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-2 rounded-xl transition">
                          📤 Enviar agora
                        </button>
                      )}
                      {c.status !== "CANCELADA" && c.status !== "PAGA" && (
                        <button onClick={() => cancelarCobranca(c.id)}
                          className="text-xs text-gray-400 hover:text-red-500 px-3 py-2 rounded-xl transition">
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Como usar ─── */}
        <div className="bg-gradient-to-br from-[#1a1f36] to-[#2e3a6e] text-white rounded-3xl p-6 mt-4">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-3">Como cobrar</p>
          <div className="space-y-3">
            {[
              { emoji: "💬", title: "Agendar cobrança",      text: 'Cobrar João, 71999999999, R$500, dia 20' },
              { emoji: "⚡", title: "Enviar imediatamente",  text: 'Cobrar Maria, 71988887777, R$200, manda agora' },
              { emoji: "🔑", title: "Com chave Pix",         text: 'Cobrar Ana, 71977776666, R$300, dia 15, pix: 071.234.567-00' },
              { emoji: "🎤", title: "Por áudio",             text: "Fale a cobrança no áudio — o bot transcreve e processa igual" },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 items-start">
                <span className="text-xl mt-0.5">{item.emoji}</span>
                <div>
                  <p className="text-xs font-semibold text-blue-200 mb-0.5">{item.title}</p>
                  <code className="text-xs bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-blue-100 block">
                    {item.text}
                  </code>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-300 mt-5 border-t border-white/10 pt-4">
            Régua automática: <strong>Amigável</strong> no vencimento → <strong>Firme</strong> em +3 dias → <strong>Última chance</strong> em +7 dias 🔄
          </p>
        </div>
      </div>
    </div>
  );
}
