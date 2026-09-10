"use client";

import { useEffect, useState } from "react";

type Movimentacao = {
  id: string;
  data: string;
  descricao: string;
  meta: string;
  categoria: string | null;
  valor: number;
  sinal: "entrada" | "saida";
};

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}
function paraInputDate(iso: string) {
  return iso.slice(0, 10);
}

export function BuscaClient({
  inicioInicial,
  fimInicial,
  categoriaInicial,
}: {
  inicioInicial: string;
  fimInicial: string;
  categoriaInicial: string;
}) {
  const [inicio, setInicio] = useState(paraInputDate(inicioInicial));
  const [fim, setFim] = useState(paraInputDate(fimInicial));
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [resultados, setResultados] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState(true);

  async function buscar() {
    setCarregando(true);
    try {
      const params = new URLSearchParams({
        inicio: new Date(`${inicio}T00:00:00Z`).toISOString(),
        fim: new Date(`${fim}T23:59:59Z`).toISOString(),
      });
      if (texto.trim()) params.set("texto", texto.trim());
      if (categoria.trim()) params.set("categoria", categoria.trim());
      if (valorMin) params.set("valorMin", valorMin);
      if (valorMax) params.set("valorMax", valorMax);
      const res = await fetch(`/api/minha-conta/movimentacoes?${params}`);
      const dados = await res.json();
      setResultados(dados.movimentacoes ?? []);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = resultados.reduce((s, m) => s + (m.sinal === "saida" ? m.valor : 0), 0);

  return (
    <div className="mc-busca">
      <h1 className="mc-busca-titulo">Buscar lançamentos</h1>

      <div className="mc-busca-filtros">
        <label className="mc-label">
          Texto
          <input className="mc-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex: mercado" />
        </label>
        <label className="mc-label">
          Categoria
          <input className="mc-input" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Alimentação" />
        </label>
        <div className="mc-busca-periodo-grid">
          <label className="mc-label">
            De
            <input className="mc-input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label className="mc-label">
            Até
            <input className="mc-input" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </label>
        </div>
        <div className="mc-busca-periodo-grid">
          <label className="mc-label">
            Valor mín.
            <input className="mc-input" value={valorMin} onChange={(e) => setValorMin(e.target.value)} inputMode="decimal" placeholder="0" />
          </label>
          <label className="mc-label">
            Valor máx.
            <input className="mc-input" value={valorMax} onChange={(e) => setValorMax(e.target.value)} inputMode="decimal" placeholder="9999" />
          </label>
        </div>
        <button type="button" className="mc-btn-primary" onClick={buscar} disabled={carregando}>
          {carregando ? "Buscando..." : "Buscar"}
        </button>
      </div>

      <p className="mc-busca-resumo">
        {resultados.length} resultado{resultados.length !== 1 ? "s" : ""} · Total de saídas: {fmtValor(total)}
      </p>

      <div className="mc-busca-lista">
        {resultados.length === 0 && !carregando && <p className="mc-hoje-vazio">Nada encontrado com esses filtros.</p>}
        {resultados.map((m) => (
          <div key={m.id} className="mc-busca-item">
            <div>
              <strong>{m.descricao}</strong>
              <span className="mc-grafico-periodo">{m.meta} · {fmtData(m.data)}</span>
            </div>
            <span className={m.sinal === "entrada" ? "mc-busca-valor-entrada" : "mc-busca-valor-saida"}>
              {m.sinal === "entrada" ? "+" : "-"}{fmtValor(m.valor)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
