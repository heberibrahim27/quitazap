"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Componente à parte (client) só pra saber a rota atual — o layout continua
// Server Component.
//
// O "+" central abre um sheet — hoje só explica que lançamentos ainda são
// registrados por texto/áudio no WhatsApp (não existe formulário de "novo
// lançamento" no Controle web ainda). "Mais" abre um sheet com o resto das
// páginas (Receitas, Despesas, Dívidas, Agenda, Metas, Perfil) e o Sair, já
// que o cabeçalho não mostra mais o botão de sair.
export function BottomNav({ sair }: { sair: (fd: FormData) => Promise<void> }) {
  const pathname = usePathname();
  const naHome = pathname === "/minha-conta";
  const naMovimentacoes = pathname === "/minha-conta/movimentacoes";
  const naPlano = pathname === "/minha-conta/plano";
  const naCartoes = pathname.startsWith("/minha-conta/cartoes");

  const [fabAberto, setFabAberto] = useState(false);
  const [maisAberto, setMaisAberto] = useState(false);
  const fecharTudo = () => {
    setFabAberto(false);
    setMaisAberto(false);
  };

  return (
    <>
      <nav className="bottom-nav" aria-label="Navegação">
        <div className="bn-side">
          <Link href="/minha-conta" className={`bn-item ${naHome ? "active" : ""}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
            Início
          </Link>
          <Link href="/minha-conta/movimentacoes" className={`bn-item ${naMovimentacoes ? "active" : ""}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l3 3v15H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
            Extrato
          </Link>
        </div>

        <span className="bn-fab-wrap">
          <button type="button" className="bn-fab" aria-label="Novo lançamento" onClick={() => setFabAberto(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </span>

        <div className="bn-side">
          <Link href="/minha-conta/plano" className={`bn-item ${naPlano ? "active" : ""}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15 9l-3 6-3-2 3-6z" /></svg>
            Plano
          </Link>
          <Link href="/minha-conta/cartoes" className={`bn-item ${naCartoes ? "active" : ""}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>
            Cartões
          </Link>
          <button type="button" className="bn-item" onClick={() => setMaisAberto(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
            Mais
          </button>
        </div>
      </nav>

      <div className={`fab-backdrop ${fabAberto || maisAberto ? "open" : ""}`} onClick={fecharTudo} />

      <div className={`fab-sheet ${fabAberto ? "open" : ""}`}>
        <span className="fab-sheet-handle" />
        <p className="fab-sheet-title">Novo lançamento</p>
        <p style={{ margin: "0 0 4px", fontSize: 13.5, color: "var(--ink-dim)", lineHeight: 1.5 }}>
          Por enquanto, receitas, despesas e compras no cartão são registradas por texto ou áudio direto no
          WhatsApp — o QuitaZAP organiza tudo automaticamente aqui no Controle.
        </p>
      </div>

      <div className={`fab-sheet ${maisAberto ? "open" : ""}`} style={{ maxHeight: "80vh", overflowY: "auto" }}>
        <span className="fab-sheet-handle" />
        <p className="fab-sheet-title">Mais</p>
        <Link href="/minha-conta/receitas" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
          </span>
          Receitas
        </Link>
        <Link href="/minha-conta/despesas" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-7 9 7" /><path d="M5 9v11h14V9" /></svg>
          </span>
          Despesas
        </Link>
        <Link href="/minha-conta/dividas" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon red">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>
          </span>
          Dívidas
        </Link>
        <Link href="/minha-conta/agenda" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18" /><path d="M8 3v3M16 3v3" /></svg>
          </span>
          Agenda
        </Link>
        <Link href="/minha-conta/metas" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></svg>
          </span>
          Metas
        </Link>
        <Link href="/minha-conta/perfil" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" /></svg>
          </span>
          Perfil
        </Link>
        <form action={sair}>
          <button type="submit" className="mais-sheet-option">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
            Sair da conta
          </button>
        </form>
      </div>
    </>
  );
}
