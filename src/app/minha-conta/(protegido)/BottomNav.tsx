"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Componente à parte (client) só pra saber a rota/query atual — o layout
// continua Server Component. Preserva ?mes= ao pular pra uma seção da home
// (senão "Extrato"/"Cartões" do menu inferior resetavam pro mês atual,
// diferente das mesmas ações no topo da própria página, que são âncoras
// relativas e preservam a URL).
export function BottomNav({ sair }: { sair: (fd: FormData) => Promise<void> }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const naHome = pathname === "/minha-conta";
  const mes = searchParams.get("mes");
  const sufixoMes = naHome && mes ? `?mes=${mes}` : "";

  return (
    <nav className="mc-bottom-nav" aria-label="Navegação">
      <Link href="/minha-conta" className={`mc-bottom-nav-item ${naHome && !mes ? "mc-active" : ""}`}>
        <span className="mc-bn-icon">🏠</span>
        Início
      </Link>
      <Link href={`/minha-conta${sufixoMes}#lancamentos`} className="mc-bottom-nav-item">
        <span className="mc-bn-icon">🧾</span>
        Extrato
      </Link>
      <Link href="/minha-conta/plano" className={`mc-bottom-nav-item ${pathname === "/minha-conta/plano" ? "mc-active" : ""}`}>
        <span className="mc-bn-icon">🧭</span>
        Plano
      </Link>
      <Link href={`/minha-conta${sufixoMes}#cartoes`} className="mc-bottom-nav-item">
        <span className="mc-bn-icon">💳</span>
        Cartões
      </Link>
      <form action={sair}>
        <button type="submit" className="mc-bottom-nav-item">
          <span className="mc-bn-icon">🚪</span>
          Sair
        </button>
      </form>
    </nav>
  );
}
