"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Inter } from "next/font/google";
import {
  IconHome, IconWallet, IconUsers, IconClock, IconDownload,
  IconFlask, IconSettings, IconLogout, IconPlus, IconMenu, IconX,
} from "./icons";
import "./admin-shell.css";

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600"] });

// Rotas que NÃO fazem parte do painel admin com menu lateral — cada uma
// já tem seu próprio layout/autenticação (painel do cliente, portal do
// QuitaZAP Receber, página de vendas pública e o redirecionamento antigo
// dela, login/cadastro). "/" não pode entrar nessa lista com startsWith
// (bateria em toda rota do site, já que toda rota começa com "/") — por
// isso tem checagem exata à parte em foraDoPainel().
const ROTAS_FORA_DO_PAINEL = ["/minha-conta", "/dashboard", "/oferta", "/login", "/cadastro", "/entrar", "/logout"];

const GRUPOS = [
  {
    rotulo: "Visão geral",
    itens: [
      { href: "/painel", label: "Dashboard", Icone: IconHome },
      { href: "/financeiro", label: "Financeiro", Icone: IconWallet },
    ],
  },
  {
    rotulo: "Clientes",
    itens: [
      { href: "/clientes", label: "Clientes", Icone: IconUsers },
      { href: "/vencidas", label: "Vencidas", Icone: IconClock },
    ],
  },
  {
    rotulo: "Sistema",
    itens: [
      { href: "/exportar", label: "Exportar dados", Icone: IconDownload },
      { href: "/testar-funil", label: "Testar bot", Icone: IconFlask },
      { href: "/configuracoes", label: "Configurações", Icone: IconSettings },
    ],
  },
];

function ehAtivo(pathname: string, href: string): boolean {
  if (href === "/painel") return pathname === "/painel";
  return pathname.startsWith(href);
}

function NavItens({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {GRUPOS.map((grupo) => (
        <div key={grupo.rotulo}>
          <div className="qa-nav-group-label">{grupo.rotulo}</div>
          {grupo.itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`qa-nav-item ${ehAtivo(pathname, item.href) ? "qa-active" : ""}`}
            >
              <span className="qa-nav-icon"><item.Icone size={17} /></span>
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = useState(false);

  useEffect(() => {
    setDrawerAberto(false);
  }, [pathname]);

  const foraDoPainel = pathname === "/" || ROTAS_FORA_DO_PAINEL.some((rota) => pathname.startsWith(rota));
  if (foraDoPainel) return <>{children}</>;

  function navegar(href: string) {
    setDrawerAberto(false);
    setTimeout(() => router.push(href), 50);
  }

  return (
    <div className={`qa-shell ${inter.className}`}>
      <aside className="qa-sidebar">
        <Link href="/painel" className="qa-brand">
          <span className="qa-brand-mark">Q</span>
          <span className="qa-brand-text">QuitaZAP</span>
        </Link>

        <NavItens pathname={pathname} />

        <div className="qa-sidebar-footer">
          <Link href="/clientes/novo" className="qa-btn-primary" style={{ width: "100%", marginBottom: 8 }}>
            <IconPlus size={15} /> Novo cliente
          </Link>
          <Link href="/logout" className="qa-nav-item">
            <span className="qa-nav-icon"><IconLogout size={17} /></span>
            Sair
          </Link>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div className="qa-topbar">
          <Link href="/painel" className="qa-brand" style={{ padding: 0 }}>
            <span className="qa-brand-mark">Q</span>
            <span className="qa-brand-text">QuitaZAP</span>
          </Link>
          <button
            className="qa-hamburger-btn"
            onClick={() => setDrawerAberto(!drawerAberto)}
            aria-label={drawerAberto ? "Fechar menu" : "Abrir menu"}
          >
            {drawerAberto ? <IconX size={18} /> : <IconMenu size={18} />}
          </button>
        </div>

        <div className={`qa-mobile-drawer ${drawerAberto ? "qa-open" : ""}`}>
          <NavItens pathname={pathname} onNavigate={() => setDrawerAberto(false)} />
          <div className="qa-sidebar-footer">
            <button onClick={() => navegar("/clientes/novo")} className="qa-btn-primary" style={{ width: "100%", marginBottom: 8 }}>
              <IconPlus size={15} /> Novo cliente
            </button>
            <button onClick={() => navegar("/logout")} className="qa-nav-item" style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <span className="qa-nav-icon"><IconLogout size={17} /></span>
              Sair
            </button>
          </div>
        </div>

        <main className="qa-content">{children}</main>
      </div>
    </div>
  );
}
