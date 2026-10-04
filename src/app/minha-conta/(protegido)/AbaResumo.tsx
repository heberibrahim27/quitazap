import Link from "next/link";
import type { ReactNode } from "react";

export interface SegmentoResumo {
  rotulo: string;
  valor: number;
  valorTxt: string;
  cor: string;
}

// Painel que a home mostra embaixo da hero quando uma aba (Receita, Despesas,
// Metas) está ativa: um bloco de destaque (valor grande, comparação com o mês
// anterior e, quando faz sentido, a divisão em barra), os itens principais
// (children) e o atalho pra página completa. A hero em si não muda de aba pra aba.
export function AbaResumo({
  titulo,
  destaque,
  delta,
  segmentos,
  vazio,
  temItens,
  href,
  rotuloLink,
  children,
}: {
  titulo: string;
  destaque: { rotulo: string; valor: string; chip?: string; tom: "verde" | "vermelho" | "azul" };
  delta?: { texto: string; bom: boolean } | null;
  segmentos?: SegmentoResumo[];
  vazio: string;
  temItens: boolean;
  href: string;
  rotuloLink: string;
  children: ReactNode;
}) {
  const comValor = (segmentos ?? []).filter((s) => s.valor > 0);
  return (
    <div className="aba-panel">
      <div className="card-head">
        <p className="card-title">
          <span className="title-label">{titulo}</span>
        </p>
      </div>

      <section className={`card aba-destaque ${destaque.tom}`}>
        <div className="aba-destaque-topo">
          <div>
            <p className="aba-destaque-rot">{destaque.rotulo}</p>
            <p className="aba-destaque-valor">{destaque.valor}</p>
          </div>
          {destaque.chip && <span className="aba-destaque-chip">{destaque.chip}</span>}
        </div>

        {delta && <p className={`aba-delta ${delta.bom ? "bom" : "ruim"}`}>{delta.texto}</p>}

        {comValor.length > 0 && (
          <>
            <div className="rsm-pilha" role="img" aria-label={`Divisão: ${comValor.map((s) => `${s.rotulo} ${s.valorTxt}`).join(", ")}`}>
              {comValor.map((s, indice) => (
                <span key={s.rotulo} className="rsm-seg" style={{ flexGrow: s.valor, background: s.cor, "--i": indice } as React.CSSProperties} />
              ))}
            </div>
            <ul className="aba-legenda">
              {(segmentos ?? []).map((s) => (
                <li key={s.rotulo}>
                  <i style={{ background: s.cor }} />
                  <span>{s.rotulo}</span>
                  <strong>{s.valorTxt}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card aba-lista">{temItens ? children : <p className="mc-empty">{vazio}</p>}</section>

      <Link href={href} className="aba-cta">
        {rotuloLink}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
      </Link>
    </div>
  );
}
