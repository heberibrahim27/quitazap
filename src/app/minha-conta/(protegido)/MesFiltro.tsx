import Link from "next/link";

// O swipe lateral (MesSwipe) já troca o mês, mas é um gesto invisível — sem
// nenhuma pista visual, o cliente não tinha como saber que dava pra arrastar.
// Isso aqui é só a parte visível: duas setas + o mês atual, reaproveitando os
// mesmos hrefs que o MesSwipe já calcula.
//
// hrefSeguinte aceita null (mesmo padrão do MesSwipe) pra telas que não
// deixam navegar além do mês atual (ex: a Home, onde "próximo mês" não faz
// sentido nenhum) — nesse caso a seta fica desabilitada em vez de virar um
// link morto.
export function MesFiltro({
  hrefAnterior,
  hrefSeguinte,
  label,
}: {
  hrefAnterior: string;
  hrefSeguinte: string | null;
  label: string;
}) {
  return (
    <div className="mc-mes-filtro">
      <Link href={hrefAnterior} className="mc-mes-seta" aria-label="Mês anterior">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </Link>
      <span className="mc-mes-label">{label}</span>
      {hrefSeguinte ? (
        <Link href={hrefSeguinte} className="mc-mes-seta" aria-label="Próximo mês">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      ) : (
        <span className="mc-mes-seta" aria-disabled="true" aria-label="Próximo mês (indisponível)" style={{ opacity: 0.3, cursor: "default" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </span>
      )}
    </div>
  );
}
