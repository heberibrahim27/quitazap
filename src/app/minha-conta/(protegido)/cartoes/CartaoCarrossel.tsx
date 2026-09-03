"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ValorLista } from "../ValorLista";

export type CompraCartaoView = {
  id: string;
  descricao: string;
  categoria: string | null;
  valor: number;
  dataFmt: string;
};

export type CartaoCarrosselItem = {
  id: string;
  nome: string;
  cor: [string, string];
  vencimentoTexto: string;
  limiteFmt: string | null;
  disponivelFmt: string | null;
  faturaFechada: boolean;
  compras: CompraCartaoView[];
};

function CartaoHero({ c }: { c: CartaoCarrosselItem }) {
  return (
    <div className="cartao-hero-card" style={{ background: `linear-gradient(155deg, ${c.cor[0]}, ${c.cor[1]})` }}>
      <div className="cartao-hero-top">
        <span className="cartao-hero-chip" />
        <div>
          <p className="cartao-hero-nome">{c.nome}</p>
          <p className="cartao-hero-vencimento">{c.vencimentoTexto}</p>
        </div>
      </div>
      <div className="cartao-hero-limites">
        <div>
          <p className="cartao-hero-limite-label">Limite total</p>
          <p className="cartao-hero-limite-valor">{c.limiteFmt ?? "Não definido"}</p>
        </div>
        <div>
          <p className="cartao-hero-limite-label">Disponível</p>
          <p className="cartao-hero-limite-valor">{c.disponivelFmt ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}

// Carrossel horizontal com scroll-snap: cada cartão ocupa a maior parte da
// tela e deixa uma "espiada" do próximo na borda direita. Detecta qual
// cartão está mais centralizado a cada scroll (com debounce via
// requestAnimationFrame) e troca a lista de compras exibida embaixo —
// tudo client-side, sem navegar de página a cada arrastada.
//
// Loop infinito: um clone do primeiro cartão é colocado depois do último
// na fita. Quando o scroll assenta nesse clone (visualmente idêntico ao
// primeiro cartão de verdade), pulamos a posição de volta pro início sem
// animação — o clone disfarça o "salto", dando a sensação de loop.
export function CartaoCarrossel({ cartoes }: { cartoes: CartaoCarrosselItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [ativo, setAtivo] = useState(0);
  const pendente = useRef(false);
  const assentarTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = cartoes.length > 1;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function indiceMaisProximo(): number {
      const itens = Array.from(track!.children) as HTMLElement[];
      let maisProximo = 0;
      let menorDistancia = Infinity;
      for (let i = 0; i < itens.length; i++) {
        const distancia = Math.abs(itens[i].offsetLeft - track!.scrollLeft);
        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          maisProximo = i;
        }
      }
      return maisProximo;
    }

    function aoRolar() {
      if (!pendente.current) {
        pendente.current = true;
        requestAnimationFrame(() => {
          pendente.current = false;
          if (!track) return;
          const indice = indiceMaisProximo() % cartoes.length;
          setAtivo((atual) => (atual === indice ? atual : indice));
        });
      }

      if (assentarTimeout.current) clearTimeout(assentarTimeout.current);
      assentarTimeout.current = setTimeout(() => {
        if (!track || !loop) return;
        if (indiceMaisProximo() === cartoes.length) {
          track.scrollLeft = 0;
          setAtivo(0);
        }
      }, 120);
    }

    track.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      track.removeEventListener("scroll", aoRolar);
      if (assentarTimeout.current) clearTimeout(assentarTimeout.current);
    };
  }, [cartoes.length, loop]);

  const cartaoAtivo = cartoes[ativo];

  return (
    <div>
      <div className="cartao-carrossel-track" ref={trackRef}>
        {cartoes.map((c) => (
          <CartaoHero key={c.id} c={c} />
        ))}
        {loop && <CartaoHero key="__clone-primeiro" c={cartoes[0]} />}
      </div>

      {cartoes.length > 1 && (
        <div className="cartao-dots">
          {cartoes.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={`cartao-dot ${i === ativo ? "active" : ""}`}
              aria-label={`Ver cartão ${c.nome}`}
              onClick={() => {
                const track = trackRef.current;
                const alvo = track?.children[i] as HTMLElement | undefined;
                if (track && alvo) track.scrollTo({ left: alvo.offsetLeft, behavior: "smooth" });
              }}
            />
          ))}
        </div>
      )}

      {cartaoAtivo && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Link href={`/minha-conta/cartoes/${cartaoAtivo.id}/editar`} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>
              Editar cartão
            </Link>
          </div>

          {cartaoAtivo.faturaFechada && (
            <div className="cartao-fatura-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></svg>
              <span>Fatura fechada — a partir de hoje, as próximas compras entram no mês que vem.</span>
            </div>
          )}

          <div className="card-head">
            <p className="card-title" style={{ fontSize: 14 }}>
              <span className="title-label">Últimas compras</span>
            </p>
          </div>
          <div className="mc-card">
            {cartaoAtivo.compras.length === 0 ? (
              <p className="mc-empty">Nenhuma compra registrada nesse cartão ainda.</p>
            ) : (
              <div className="mc-list">
                {cartaoAtivo.compras.map((compra) => (
                  <div key={compra.id} className="mc-list-row">
                    <div className="mc-list-icon" style={{ background: "rgba(30,99,233,0.1)", color: "var(--blue)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>
                    </div>
                    <div className="mc-list-body">
                      <div className="mc-list-desc">{compra.descricao}</div>
                      <div className="mc-list-meta">{compra.categoria ?? "Sem categoria"}</div>
                    </div>
                    <div className="mc-list-side">
                      <ValorLista valor={compra.valor} sinal="-" />
                      <div className="mc-list-sub">{compra.dataFmt}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
