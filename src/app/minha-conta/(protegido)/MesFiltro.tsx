import Link from "next/link";

// O swipe lateral (MesSwipe) já troca o mês, mas é um gesto invisível — sem
// nenhuma pista visual, o cliente não tinha como saber que dava pra arrastar.
// Isso aqui é só a parte visível: duas setas + o mês atual, reaproveitando os
// mesmos hrefs que o MesSwipe já calcula.
export function MesFiltro({
  hrefAnterior,
  hrefSeguinte,
  label,
}: {
  hrefAnterior: string;
  hrefSeguinte: string;
  label: string;
}) {
  return (
    <div className="mc-mes-filtro">
      <Link href={hrefAnterior} className="mc-mes-seta" aria-label="Mês anterior">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </Link>
      <span className="mc-mes-label">{label}</span>
      <Link href={hrefSeguinte} className="mc-mes-seta" aria-label="Próximo mês">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </Link>
    </div>
  );
}
