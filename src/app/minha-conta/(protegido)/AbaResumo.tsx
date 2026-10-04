import Link from "next/link";
import type { ReactNode } from "react";

// Painel que a home mostra embaixo da hero quando uma aba (Despesas, Cartões,
// Metas) está ativa: 3 métricas de relance, os itens principais (children) e o
// atalho pra página completa. A hero em si não muda de aba pra aba.
export function AbaResumo({
  titulo,
  stats,
  vazio,
  temItens,
  href,
  rotuloLink,
  children,
}: {
  titulo: string;
  stats: { rotulo: string; valor: string }[];
  vazio: string;
  temItens: boolean;
  href: string;
  rotuloLink: string;
  children: ReactNode;
}) {
  return (
    <div className="aba-panel">
      <div className="card-head">
        <p className="card-title">
          <span className="title-label">{titulo}</span>
        </p>
      </div>

      <div className="aba-stats">
        {stats.map((s) => (
          <div key={s.rotulo} className="aba-stat">
            <p className="aba-stat-label">{s.rotulo}</p>
            <p className="aba-stat-value">{s.valor}</p>
          </div>
        ))}
      </div>

      <section className="card">{temItens ? children : <p className="mc-empty">{vazio}</p>}</section>

      <Link href={href} className="aba-cta">
        {rotuloLink}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
      </Link>
    </div>
  );
}
