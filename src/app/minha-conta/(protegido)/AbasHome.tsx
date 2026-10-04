"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MesSwipe } from "./MesSwipe";
import { MesFiltro } from "./MesFiltro";
import { ABAS_HERO, abaDaUrl, hrefHome, type AbaHero } from "./abas-hero";

const ICONES: Record<AbaHero, React.ReactNode> = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11L12 4l8 7" /><path d="M6 9.5V20a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1V9.5" /></svg>,
  receita: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>,
  despesas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>,
  metas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>,
};
const ROTULOS: Record<AbaHero, string> = { home: "Home", receita: "Receita", despesas: "Despesas", metas: "Metas" };

// Hero + abas + conteúdo de baixo. A troca de aba é só no cliente: todos os
// painéis já vêm renderizados do servidor, então tocar numa aba não faz
// requisição nenhuma (instantâneo, a hero não pisca e o auto-refresh de 4s do
// painel não consegue atropelar a navegação). A URL acompanha por
// history.replaceState, então recarregar/compartilhar mantém a aba; o link
// real continua no href (abre normal com Ctrl/Cmd+clique ou sem JS).
export function AbasHome({
  hero,
  paineis,
  mesAnterior,
  mesSeguinte,
  mesNaUrl,
  rotuloMes,
}: {
  hero: React.ReactNode;
  paineis: Record<AbaHero, React.ReactNode>;
  mesAnterior: string;
  mesSeguinte: string | null;
  mesNaUrl: string | null;
  rotuloMes: string;
}) {
  // A aba vem da URL (useSearchParams acompanha o replaceState do Next), então
  // o botão Início do rodapé (/minha-conta) também volta pra aba Home.
  const aba = abaDaUrl(useSearchParams().get("aba"));

  function escolher(e: React.MouseEvent<HTMLAnchorElement>, alvo: AbaHero) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (alvo === aba) return;
    window.history.replaceState(null, "", hrefHome(alvo, mesNaUrl));
  }

  return (
    <>
      <MesSwipe hrefAnterior={hrefHome(aba, mesAnterior)} hrefSeguinte={mesSeguinte ? hrefHome(aba, mesSeguinte) : null}>
        <div className="hero">
          {hero}
          <nav className="hero-tabs" aria-label="Resumo por seção">
            {ABAS_HERO.map((a) => (
              <Link
                key={a}
                href={hrefHome(a, mesNaUrl)}
                onClick={(e) => escolher(e, a)}
                className={`hero-tab${a === aba ? " ativa" : ""}`}
                aria-current={a === aba ? "page" : undefined}
                prefetch={false}
              >
                {ICONES[a]}
                {ROTULOS[a]}
              </Link>
            ))}
          </nav>
        </div>
      </MesSwipe>

      <MesFiltro
        hrefAnterior={hrefHome(aba, mesAnterior)}
        hrefSeguinte={mesSeguinte ? hrefHome(aba, mesSeguinte) : null}
        label={rotuloMes}
      />

      <div key={aba}>
        {paineis[aba]}
      </div>
    </>
  );
}
