"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Sticky compacta ao rolar: logo grande + saudação no topo da página,
// encolhe (logo menor, saudação recolhida) depois de ~24px de scroll —
// nunca some por completo, ao contrário do header do resto do app.
//
// No Dashboard (Início), a hero já mostra "Resumo do mês" etc, então o
// cabeçalho fixo ali é só logo + avatar (sem saudação, que dependeria
// de uma cor de texto certa pro fundo por trás — variável, já que o
// cabeçalho é transparente por cima de qualquer conteúdo) — sempre
// visível, nunca aparece/desaparece ao rolar.
export function Header({ nome, fotoUrl }: { nome: string; fotoUrl?: string | null }) {
  const [compacto, setCompacto] = useState(false);
  const naHome = usePathname() === "/minha-conta";

  useEffect(() => {
    if (naHome) return;
    function aoRolar() {
      setCompacto(window.scrollY > 24);
    }
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, [naHome]);

  const avatar = (
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
  );

  if (naHome) {
    return (
      <div className="header header-transparent">
        <Link href="/minha-conta">
          <img className="brand-logo" src="/minha-conta/logo-simbolo.webp" alt="QuitaZap" />
        </Link>
        {avatar}
      </div>
    );
  }

  const conteudo = (
    <>
      <Link href="/minha-conta">
        <img className="brand-logo" src="/minha-conta/logo-simbolo.webp" alt="QuitaZap" />
      </Link>
      <div className="header-user">
        <span className="header-greeting">Olá, {nome}</span>
        {avatar}
      </div>
    </>
  );

  return (
    <>
      <div className={`header${compacto ? " compact" : ""}`}>{conteudo}</div>
      <div className={`header-spacer${compacto ? " compact" : ""}`} />
    </>
  );
}
