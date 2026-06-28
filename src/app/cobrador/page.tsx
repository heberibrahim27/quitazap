"use client";

// ─────────────────────────────────────────
// QuitaZAP — Cobrador Automático (painel)
// /cobrador
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
  cliente?: { nome: string; telefone: string };
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  PENDENTE:  { label: "Pendente",  dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700 border border-amber-200"   },
  ENVIADA:   { label: "Enviada",   dot: "bg-blue-400",   badge: "bg-blue-50 text-blue-700 border border-blue-200"       },
  PAGA:      { label: "Paga",      dot: "bg-emerald-400",badge: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  CANCELADA: { label: "Cancelada", dot: "bg-gray-300",   badge: "bg-gray-50 text-gray-500 border border-gray-200"       },
};

const ETAPA_LABEL: Record<number, { label: string; cor: string }> = {
  1: { label: "Amigável",      cor: "text-blue-600 bg-blue-50"   },
  2: { label: "Firme",         cor: "text-orange-600 bg-orange-50" },
  3: { label: "Última chance", cor: "text-red-600 bg-red-50"     },
};

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDataCurta(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function diasRestantes(vencimento: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(vencimento);
  venc.setHours(0, 0, 0, 0);
  return Math.round((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

export default function CobradorPage() {
  const [cobrancas, setCobrancas]       = useState<Cobranca[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [form, setForm]                 = useState({
    devedorNome: "", devedorFone: "", valor: "", diaVencimento: "",
    mensagem: "", pixChave: "",
  });
  const [criando, setCriando]           = useState(false);
  const [disparando, setDisparando]     = useState<string | null>(null);
  const [feedback, setFeedback]         = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);
  const [mostrarForm, setMostrarForm]   = useState(false);

  const showFeedback = (msg: string, tipo: "ok" | "erro" = "ok") => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback(null), 4000);
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    const qs = filtroStatus ? `&status=${filtroStatus}` : "";
    const res = await fetch(`/api/cobrador?limit=100${qs}`);
    if (res.ok) {
      const data = await res.json();
      setCobrancas(data.cobrancas ?? []);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [filtroStatus]);

  useEffect(() => { carregar(); }, [carregar]);

  async function atualizarStatus(id: string, status: string) {
    const res = await fetch("/api/cobrador", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setCobrancas((prev) => prev.map((c) => c.id === id ? { ...c, status: status as Cobranca["status"] } : c));
      showFeedback(status === "PAGA" ? "✅ Marcada como paga!" : "Cobrança atualizada.");
    } else {
      showFeedback("Erro ao atualizar.", "erro");
    }
  }

  async function enviarCobrancaAgora(c: Cobranca) {
    setDisparando(c.id);
    // Atualiza status para ENVIADA — o cron já enviará na próxima rodada
    // Para envio imediato, chamamos o endpoint de disparar filtrando essa cobrança
    const res = await fetch("/api/cobrador/disparar", { method: "POST" });
    const data = await res.json();
    setDisparando(null);
    if (res.ok) {
      showFeedback(`📤 ${data.disparadas ?? 0} cobrança(s) disparada(s)!`);
      carregar();
    } else {
      showFeedback("Erro ao disparar.", "erro");
    }
  }

  async function dispararTodas() {
    setDisparando("all");
    const res = await fetch("/api/cobrador/disparar", { method: "POST" });
    const data = await res.json();
    setDisparando(null);
    if (res.ok) {
      const msg = data.disparadas > 0
        ? `🚀 ${data.disparadas} mensagem(ns) enviada(s)!`
        : "Nenhuma cobrança pendente para enviar hoje.";
      showFeedback(msg);
      carregar();
    } else {
      showFeedback(`Erro: ${data.error ?? "desconhecido"}`, "erro");
    }
  }

  async function criarCobranca(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    const res = await fetch("/api/cobrador", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      showFeedback("✅ Cobrança criada!");
      setForm({ devedorNome: "", devedorFone: "", valor: "", diaVencimento: "", mensagem: "", pixChave: "" });
      setMostrarForm(false);
      carregar();
    } else {
      const err = await res.json();
      showFeedback(`Erro: ${err.error ?? "desconhecido"}`, "erro");
    }
  }

  // Totalizadores
  const pendentes  = cobrancas.filter((c) => c.status === "PENDENTE").length;
  const enviadas   = cobrancas.filter((c) => c.status === "ENVIADA").length;
  const pagas      = cobrancas.filter((c) => c.status === "PAGA").length;
  const valorAberto = cobrancas
    .filter((c) => c.status !== "PAGA" && c.status !== "CANCELADA")
    .reduce((s, c) => s + c.valor, 0);
  const valorRecebido = cobrancas
    .filter((c) => c.status === "PAGA")
    .reduce((s, c) => s + c.valor, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              💸 Cobrador Automático
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">{total} cobrança{total !== 1 ? "s" : ""} no total</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={dispararTodas}
              disabled={disparando === "all"}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              {disparando === "all" ? "⏳ Enviando..." : "🚀 Disparar pendentes"}
            </button>
            <button
              onClick={() => setMostrarForm(!mostrarForm)}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              + Nova cobrança
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Feedback */}
        {feedback && (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
            feedback.tipo === "erro"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-green-50 text-green-700 border border-green-200"
          }`}>
            {feedback.msg}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Pendentes",    value: pendentes,          sub: "aguardando envio",   color: "text-amber-600",   bg: "bg-amber-50 border-amber-100"    },
            { label: "Enviadas",     value: enviadas,           sub: "aguardando pagamento",color: "text-blue-600",    bg: "bg-blue-50 border-blue-100"      },
            { label: "Pagas",        value: pagas,              sub: "confirmadas",         color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
            { label: "Em aberto",    value: fmtValor(valorAberto),  sub: "a receber",     color: "text-orange-600",  bg: "bg-orange-50 border-orange-100"   },
            { label: "Recebido",     value: fmtValor(valorRecebido),sub: "confirmado",     color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
          ].map((k) => (
            <div key={k.label} className={`${k.bg} border rounded-xl p-3`}>
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs font-medium text-gray-700 mt-0.5">{k.label}</div>
              <div className="text-xs text-gray-400">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Formulário nova cobrança */}
        {mostrarForm && (
          <div className="bg-white rounded-2xl border shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-gray-800 mb-1">Nova cobrança manual</h2>
            <p className="text-xs text-gray-400 mb-4">Pelo WhatsApp do bot, basta dizer: <em>Cobrar João, 71999..., R$500, dia 20</em></p>
            <form onSubmit={criarCobranca} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { field: "devedorNome",   label: "Nome do devedor *",     placeholder: "João Silva"            },
                { field: "devedorFone",   label: "WhatsApp do devedor *", placeholder: "71999999999"           },
                { field: "valor",         label: "Valor (R$) *",          placeholder: "500,00"                },
                { field: "diaVencimento", label: "Dia do vencimento *",   placeholder: "20"                   },
                { field: "mensagem",      label: "Mensagem personalizada", placeholder: "João, combinamos..."   },
                { field: "pixChave",      label: "Chave Pix (opcional)",  placeholder: "71999999999 ou email"  },
              ].map(({ field, label, placeholder }) => (
                <div key={field}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
                  <input
                    required={label.includes("*")}
                    value={form[field as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  />
                </div>
              ))}
              <div className="sm:col-span-2 flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setMostrarForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={criando}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition"
                >
                  {criando ? "Salvando..." : "Criar cobrança"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filtros */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {[
            { v: "",           label: "Todas"      },
            { v: "PENDENTE",   label: "Pendentes"  },
            { v: "ENVIADA",    label: "Enviadas"   },
            { v: "PAGA",       label: "Pagas"      },
            { v: "CANCELADA",  label: "Canceladas" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setFiltroStatus(f.v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                filtroStatus === f.v
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button onClick={carregar} className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2">
            ↺ Atualizar
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center text-gray-300 py-16 text-4xl">⏳</div>
        ) : cobrancas.length === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center">
            <div className="text-5xl mb-3">💸</div>
            <p className="font-medium text-gray-700 mb-1">Nenhuma cobrança encontrada</p>
            <p className="text-sm text-gray-400">
              Pelo WhatsApp do bot, diga:<br />
              <span className="font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs mt-1 inline-block">
                Cobrar João Silva, 71999999999, R$500, dia 20
              </span>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {cobrancas.map((c) => {
              const st    = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.PENDENTE;
              const etapa = ETAPA_LABEL[c.etapa];
              const dias  = diasRestantes(c.vencimento);
              const vencida = dias < 0 && c.status !== "PAGA" && c.status !== "CANCELADA";

              return (
                <div
                  key={c.id}
                  className={`bg-white rounded-xl border px-5 py-4 flex items-start gap-4 ${
                    vencida ? "border-red-200" : "border-gray-100"
                  } hover:shadow-sm transition`}
                >
                  {/* Dot status */}
                  <div className="mt-1 flex-shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full block ${st.dot}`} />
                  </div>

                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-gray-900 text-sm">{c.devedorNome}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>
                        {st.label}
                      </span>
                      {c.status === "ENVIADA" && etapa && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${etapa.cor}`}>
                          {etapa.label}
                        </span>
                      )}
                      {vencida && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium border border-red-100">
                          {Math.abs(dias)}d de atraso
                        </span>
                      )}
                      {!vencida && dias >= 0 && dias <= 3 && c.status === "PENDENTE" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium border border-amber-100">
                          vence em {dias === 0 ? "hoje" : `${dias}d`}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                      <span>📞 {c.devedorFone}</span>
                      <span>💰 <strong className="text-gray-700">{fmtValor(c.valor)}</strong></span>
                      <span>📅 vence {fmtDataCurta(c.vencimento)}</span>
                      {c.ultimoEnvio && (
                        <span>📤 último envio {fmtDataCurta(c.ultimoEnvio)} ({c.tentativas}×)</span>
                      )}
                    </div>

                    {c.mensagem && (
                      <p className="mt-1 text-xs text-gray-400 italic">"{c.mensagem}"</p>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
                    {(c.status === "PENDENTE" || c.status === "ENVIADA") && (
                      <button
                        onClick={() => atualizarStatus(c.id, "PAGA")}
                        className="text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition whitespace-nowrap"
                      >
                        ✅ Marcar paga
                      </button>
                    )}
                    {c.status === "PENDENTE" && (
                      <button
                        onClick={() => enviarCobrancaAgora(c)}
                        disabled={disparando === c.id}
                        className="text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition whitespace-nowrap disabled:opacity-50"
                      >
                        {disparando === c.id ? "⏳" : "📤 Enviar agora"}
                      </button>
                    )}
                    {c.status !== "CANCELADA" && c.status !== "PAGA" && (
                      <button
                        onClick={() => atualizarStatus(c.id, "CANCELADA")}
                        className="text-xs text-gray-400 hover:text-red-500 transition"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Instrução do bot */}
        <div className="mt-8 bg-green-50 border border-green-100 rounded-2xl p-5">
          <p className="text-sm font-semibold text-green-800 mb-2">💬 Como criar cobranças pelo WhatsApp:</p>
          <div className="font-mono bg-white border border-green-200 rounded-lg p-3 text-xs text-gray-700 mb-2">
            Cobrar João Silva, 71999999999, R$500, dia 20<br />
            mensagem: &quot;João, combinamos R$500 para o dia 20&quot;
          </div>
          <p className="text-xs text-green-700">
            O bot entende mensagem de texto ou áudio 🎤. Diga "manda agora" para envio imediato sem agendamento.
          </p>
        </div>
      </div>
    </div>
  );
}
