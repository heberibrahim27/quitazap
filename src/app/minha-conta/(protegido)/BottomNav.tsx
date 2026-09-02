"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

// Componente à parte (client) só pra saber a rota/query atual — o layout
// continua Server Component. Preserva ?mes= ao pular pra uma seção da home
// (senão "Extrato"/"Cartões" do menu inferior resetavam pro mês atual,
// diferente das mesmas ações no topo da própria página, que são âncoras
// relativas e preservam a URL).
//
// O "+" central abre um sheet — hoje só explica que lançamentos ainda são
// registrados por texto/áudio no WhatsApp (não existe formulário de "novo
// lançamento" no Controle web ainda). "Mais" abre um sheet com Sair, já que
// o cabeçalho não mostra mais o botão de sair.
export function BottomNav({ sair }: { sair: (fd: FormData) => Promise<void> }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const naHome = pathname === "/minha-conta";
  const mes = searchParams.get("mes");
  const sufixoMes = naHome && mes ? `?mes=${mes}` : "";
  const naPlano = pathname === "/minha-conta/plano";

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
          <Link href="/minha-conta" className={`bn-item ${naHome && !mes ? "active" : ""}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
            Início
          </Link>
          <Link href={`/minha-conta${sufixoMes}#lancamentos`} className="bn-item">
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
          <Link href={`/minha-conta${sufixoMes}#cartoes`} className="bn-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /></svg>
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

      <div className={`fab-sheet ${maisAberto ? "open" : ""}`}>
        <span className="fab-sheet-handle" />
        <p className="fab-sheet-title">Mais opções</p>
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
