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

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  PENDENTE:  { label: "⏳ Pendente",  cor: "bg-yellow-100 text-yellow-800" },
  ENVIADA:   { label: "📤 Enviada",   cor: "bg-blue-100 text-blue-800" },
  PAGA:      { label: "✅ Paga",      cor: "bg-green-100 text-green-800" },
  CANCELADA: { label: "❌ Cancelada", cor: "bg-gray-100 text-gray-500" },
};

const ETAPA_LABEL: Record<number, string> = {
  1: "Amigável",
  2: "Firme",
  3: "Última chance",
};

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function CobradorPage() {
  const [cobrancas, setCobrancas]     = useState<Cobranca[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [form, setForm]               = useState({
    devedorNome: "", devedorFone: "", valor: "", diaVencimento: "",
    mensagem: "", pixChave: "",
  });
  const [criando, setCriando]         = useState(false);
  const [feedback, setFeedback]       = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);

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
      setFeedback(`Status atualizado para ${status}.`);
      setTimeout(() => setFeedback(""), 3000);
    }
  }

  async function criarCobranca(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    setFeedback("");
    const res = await fetch("/api/cobrador", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // clienteId não é exigido aqui pois é painel admin — usamos um placeholder
        // Em produção, passar o clienteId do usuário logado
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
      setFeedback("✅ Cobrança criada com sucesso!");
      setForm({ devedorNome: "", devedorFone: "", valor: "", diaVencimento: "", mensagem: "", pixChave: "" });
      setMostrarForm(false);
      carregar();
    } else {
      const err = await res.json();
      setFeedback(`❌ Erro: ${err.error ?? "desconhecido"}`);
    }
    setTimeout(() => setFeedback(""), 5000);
  }

  async function dispararCron() {
    setFeedback("🔄 Disparando cobranças...");
    const res = await fetch("/api/cron/cobrador");
    if (res.ok) {
      const data = await res.json();
      setFeedback(`✅ Cron executado: ${data.disparadas} disparadas, ${data.canceladas} canceladas.`);
      carregar();
    } else {
      setFeedback("❌ Erro ao executar cron.");
    }
    setTimeout(() => setFeedback(""), 6000);
  }

  const pendentes  = cobrancas.filter((c) => c.status === "PENDENTE").length;
  const enviadas   = cobrancas.filter((c) => c.status === "ENVIADA").length;
  const pagas      = cobrancas.filter((c) => c.status === "PAGA").length;
  const valorTotal = cobrancas.filter((c) => c.status !== "PAGA" && c.status !== "CANCELADA")
    .reduce((s, c) => s + c.valor, 0);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💸 Cobrador Automático</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cobranças agendadas — {total} no total
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={dispararCron}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            🚀 Disparar Agora
          </button>
          <button
            onClick={() => setMostrarForm(!mostrarForm)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            + Nova Cobrança
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          {feedback}
        </div>
      )}

      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Pendentes",   valor: pendentes,      cor: "text-yellow-600", bg: "bg-yellow-50" },
          { label: "Enviadas",    valor: enviadas,       cor: "text-blue-600",   bg: "bg-blue-50" },
          { label: "Pagas",       valor: pagas,          cor: "text-green-600",  bg: "bg-green-50" },
          { label: "A receber",   valor: fmtValor(valorTotal), cor: "text-purple-700", bg: "bg-purple-50" },
        ].map((c) => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4`}>
            <div className={`text-2xl font-bold ${c.cor}`}>{c.valor}</div>
            <div className="text-xs text-gray-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Formulário nova cobrança */}
      {mostrarForm && (
        <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">Nova Cobrança</h2>
          <form onSubmit={criarCobranca} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nome do devedor *</label>
              <input
                required
                value={form.devedorNome}
                onChange={(e) => setForm({ ...form, devedorNome: e.target.value })}
                placeholder="João Silva"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">WhatsApp do devedor *</label>
              <input
                required
                value={form.devedorFone}
                onChange={(e) => setForm({ ...form, devedorFone: e.target.value })}
                placeholder="71999999999"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Valor (R$) *</label>
              <input
                required
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder="500,00"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Dia do vencimento *</label>
              <input
                required
                type="number" min="1" max="31"
                value={form.diaVencimento}
                onChange={(e) => setForm({ ...form, diaVencimento: e.target.value })}
                placeholder="20"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Mensagem personalizada</label>
              <input
                value={form.mensagem}
                onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
                placeholder="João, combinamos R$500 para o dia 20..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Chave Pix (opcional)</label>
              <input
                value={form.pixChave}
                onChange={(e) => setForm({ ...form, pixChave: e.target.value })}
                placeholder="71999999999 ou email@..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={criando}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition"
              >
                {criando ? "Salvando..." : "Criar Cobrança"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { v: "", label: "Todas" },
          { v: "PENDENTE", label: "Pendentes" },
          { v: "ENVIADA", label: "Enviadas" },
          { v: "PAGA", label: "Pagas" },
          { v: "CANCELADA", label: "Canceladas" },
        ].map((f) => (
          <button
            key={f.v}
            onClick={() => setFiltroStatus(f.v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filtroStatus === f.v
                ? "bg-green-600 text-white"
                : "bg-white border text-gray-600 hover:border-green-400"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button onClick={carregar} className="ml-auto px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          🔄 Atualizar
        </button>
      </div>

      {/* Lista de cobranças */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Carregando...</div>
      ) : cobrancas.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p className="text-4xl mb-2">📋</p>
          <p>Nenhuma cobrança encontrada.</p>
          <p className="text-sm mt-1">
            Use o QuitaZAP no WhatsApp e diga:<br />
            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">
              Cobrar João Silva, 71999999999, R$500, dia 20
            </span>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cobrancas.map((c) => {
            const st = STATUS_LABEL[c.status] ?? { label: c.status, cor: "bg-gray-100 text-gray-500" };
            return (
              <div key={c.id} className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-gray-800">{c.devedorNome}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cor}`}>
                        {st.label}
                      </span>
                      {c.etapa > 1 && c.status === "ENVIADA" && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                          {ETAPA_LABEL[c.etapa] ?? `Etapa ${c.etapa}`}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 space-y-0.5">
                      <div>📞 {c.devedorFone} &nbsp;|&nbsp; 💰 <strong className="text-gray-700">{fmtValor(c.valor)}</strong> &nbsp;|&nbsp; 📅 Vence {fmtData(c.vencimento)}</div>
                      {c.mensagem && <div>💬 <em className="text-gray-600">{c.mensagem}</em></div>}
                      {c.ultimoEnvio && <div className="text-xs text-gray-400">Último envio: {fmtData(c.ultimoEnvio)} ({c.tentativas} tentativa{c.tentativas !== 1 ? "s" : ""})</div>}
                    </div>
                  </div>
                  {/* Ações */}
                  <div className="flex gap-2 flex-shrink-0">
                    {(c.status === "PENDENTE" || c.status === "ENVIADA") && (
                      <button
                        onClick={() => atualizarStatus(c.id, "PAGA")}
                        className="bg-green-100 hover:bg-green-200 text-green-700 text-xs px-3 py-1.5 rounded-lg transition"
                      >
                        ✅ Marcar paga
                      </button>
                    )}
                    {c.status !== "CANCELADA" && c.status !== "PAGA" && (
                      <button
                        onClick={() => atualizarStatus(c.id, "CANCELADA")}
                        className="bg-red-50 hover:bg-red-100 text-red-600 text-xs px-3 py-1.5 rounded-lg transition"
                      >
                        ❌ Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Instrução do bot */}
      <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
        <p className="font-semibold mb-2">💬 Como usar pelo WhatsApp:</p>
        <p className="font-mono bg-white border rounded p-2 text-xs">
          Cobrar João Silva, 71999999999, R$500, dia 20, mensagem: &quot;João, combinamos R$500 para o dia 20&quot;
        </p>
        <p className="mt-2 text-xs text-green-700">
          O sistema envia a cobrança automaticamente no dia certo, com reenvio em +3 dias (tom mais firme) e +7 dias (última chance).
          Cada mensagem inclui o link do QuitaZAP — o devedor pode virar assinante! 🚀
        </p>
      </div>
    </div>
  );
}
