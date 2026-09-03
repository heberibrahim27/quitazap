"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Sticky compacta ao rolar: logo grande + saudação no topo da página,
// encolhe (logo menor, saudação recolhida) depois de ~24px de scroll —
// nunca some por completo, ao contrário do header do resto do app.
//
// No Dashboard (Início), logo/saudação/avatar vivem dentro do próprio
// card da hero (ver page.tsx, .hero-header-row) — mesmo degradê, cor
// sempre idêntica. Só quando a hero rola inteira pra fora da tela é que
// este componente mostra um mini-cabeçalho fixo (cor sólida) por cima
// do resto da página — nesse ponto o degradê já não está mais visível,
// então não tem como destoar (tentamos fixar sempre visível antes, mas
// a cor sólida sempre destoava do degradê que clareia perto do topo).
export function Header({ nome, fotoUrl }: { nome: string; fotoUrl?: string | null }) {
  const [compacto, setCompacto] = useState(false);
  const [miniVisivel, setMiniVisivel] = useState(false);
  const naHome = usePathname() === "/minha-conta";

  useEffect(() => {
    if (naHome) return;
    function aoRolar() {
      setCompacto(window.scrollY > 24);
    }
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, [naHome]);

  useEffect(() => {
    if (!naHome) return;
    const hero = document.querySelector(".hero");
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) => setMiniVisivel(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, [naHome]);

  const conteudo = (
    <>
      <Link href="/minha-conta">
        <img className="brand-logo" src="/minha-conta/logo-simbolo.webp" alt="QuitaZap" />
      </Link>
      <div className="header-user">
        <span className="header-greeting">Olá, {nome}</span>
        <Link href="/minha-conta/perfil" className="avatar" aria-label="Perfil">
          {fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <svg viewBox="0 0 34 34" width="100%" height="100%">
              <defs>
                <radialGradient id="avatarGlow" cx="35%" cy="25%" r="75%">
                  <stop offset="0%" stopColor="#EAF4FF" />
                  <stop offset="100%" stopColor="#BFD9F5" />
                </radialGradient>
              </defs>
              <circle cx="17" cy="13.5" r="5.6" fill="url(#avatarGlow)" />
              <path d="M4 30c0-7.5 6-11.2 13-11.2s13 3.7 13 11.2z" fill="url(#avatarGlow)" />
            </svg>
          )}
        </Link>
      </div>
    </>
  );

  if (naHome) {
    return <div className={`header header-mini${miniVisivel ? " visible" : ""}`}>{conteudo}</div>;
  }

  return (
    <>
      <div className={`header${compacto ? " compact" : ""}`}>{conteudo}</div>
      <div className={`header-spacer${compacto ? " compact" : ""}`} />
    </>
  );
}
