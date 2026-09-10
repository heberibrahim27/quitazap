"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type CategoriaGraficoDado = { nome: string; valor: number; percentual: number };
export type GraficoCategoriaDado = {
  tipo: "grafico_categoria";
  periodoLabel: string;
  escopoLabel: string;
  totalLabel: string;
  totalValor: number;
  categorias: CategoriaGraficoDado[];
  outros: CategoriaGraficoDado | null;
  mapaCompleto: Record<string, number>;
  geradoEm: string;
  periodoInicio: string;
  periodoFim: string;
};

type Movimentacao = {
  id: string;
  data: string;
  descricao: string;
  meta: string;
  valor: number;
  sinal: "entrada" | "saida";
};

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Card de gráfico de categoria — largura cheia (distinto de propósito do
 * card compacto de lançamento), spec visual do Ibrahim baseada em prints
 * reais do app. "Ver lançamentos"/tap numa categoria abrem painel inline
 * (nunca navegam pra fora) — preserva a posição de scroll da conversa.
 */
export function GraficoCategoriaCard({ dado }: { dado: GraficoCategoriaDado }) {
  const [desatualizado, setDesatualizado] = useState(false);
  const [categoriaAberta, setCategoriaAberta] = useState<string | null>(null);
  const [itens, setItens] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/minha-conta/grafico-categoria/verificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapaCongelado: dado.mapaCompleto }),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelado) setDesatualizado(Boolean(d.desatualizado)); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [dado.mapaCompleto]);

  async function abrirPainel(categoria: string | null) {
    if (categoriaAberta === (categoria ?? "__todas__")) {
      setCategoriaAberta(null);
      return;
    }
    setCategoriaAberta(categoria ?? "__todas__");
    setCarregando(true);
    try {
      const params = new URLSearchParams({ inicio: dado.periodoInicio, fim: dado.periodoFim });
      if (categoria) params.set("categoria", categoria);
      const res = await fetch(`/api/minha-conta/movimentacoes?${params}`);
      const dados = await res.json();
      setItens(dados.movimentacoes ?? []);
    } finally {
      setCarregando(false);
    }
  }

  const linkExpandir = `/minha-conta/busca?inicio=${encodeURIComponent(dado.periodoInicio)}&fim=${encodeURIComponent(dado.periodoFim)}`;

  return (
    <div className="mc-grafico-card">
      <div className="mc-grafico-topo">
        <strong className="mc-grafico-titulo">Gastos por categoria</strong>
        <span className="mc-grafico-periodo">{dado.periodoLabel} · {dado.escopoLabel}</span>
      </div>

      <div className="mc-grafico-total">{dado.totalLabel}</div>

      {desatualizado && (
        <div className="mc-grafico-desatualizado">
          Registros alterados desde essa consulta
          <button type="button" onClick={() => setDesatualizado(false)}>Atualizar</button>
        </div>
      )}

      <div className="mc-grafico-lista">
        {dado.categorias.map((c) => (
          <div key={c.nome}>
            <button type="button" className="mc-grafico-linha" onClick={() => abrirPainel(c.nome)}>
              <span className="mc-grafico-linha-nome">{c.nome}</span>
              <span className="mc-grafico-linha-valor">{fmtValor(c.valor)} · {c.percentual}%</span>
              <span className="mc-grafico-barra-track">
                <span className="mc-grafico-barra-fill" style={{ width: `${c.percentual}%` }} />
              </span>
            </button>
            {categoriaAberta === c.nome && (
              <PainelLancamentos itens={itens} carregando={carregando} />
            )}
          </div>
        ))}
        {dado.outros && (
          <div>
            <button type="button" className="mc-grafico-linha" onClick={() => abrirPainel(null)}>
              <span className="mc-grafico-linha-nome">{dado.outros.nome}</span>
              <span className="mc-grafico-linha-valor">{fmtValor(dado.outros.valor)} · {dado.outros.percentual}%</span>
              <span className="mc-grafico-barra-track">
                <span className="mc-grafico-barra-fill mc-grafico-barra-outros" style={{ width: `${dado.outros.percentual}%` }} />
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="mc-grafico-acoes">
        <button type="button" onClick={() => abrirPainel(null)}>Ver lançamentos</button>
        <Link href={linkExpandir}>Expandir</Link>
      </div>
      {categoriaAberta === "__todas__" && <PainelLancamentos itens={itens} carregando={carregando} />}
    </div>
  );
}

function PainelLancamentos({ itens, carregando }: { itens: Movimentacao[]; carregando: boolean }) {
  if (carregando) return <p className="mc-grafico-painel-vazio">Carregando…</p>;
  if (itens.length === 0) return <p className="mc-grafico-painel-vazio">Nada registrado.</p>;
  return (
    <div className="mc-grafico-painel">
      {itens.map((m) => (
        <div key={m.id} className="mc-grafico-painel-item">
          <span>{m.descricao}</span>
          <span>{fmtValor(m.valor)} · {fmtData(m.data)}</span>
        </div>
      ))}
    </div>
  );
}
