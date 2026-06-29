"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const links = [
  { href: "/",              label: "Dashboard"       },
  { href: "/clientes",      label: "Clientes"        },
  { href: "/vencidas",      label: "⚠️ Vencidas"    },
  { href: "/financeiro",    label: "💰 Financeiro"   },
  { href: "/cobrador",      label: "💸 Cobrador"     },
  { href: "/testar-funil",  label: "🧪 Testes"       },
  { href: "/exportar",      label: "Exportar"        },
  { href: "/oferta",        label: "Oferta"          },
  { href: "/configuracoes", label: "⚙️ Config"       },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);

  // Fecha o menu sempre que a rota mudar
  useEffect(() => { setMenuAberto(false); }, [pathname]);

  if (pathname === "/oferta" || pathname === "/login") return null;

  function ativo(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Navega e fecha o menu de forma explícita (mais confiável no mobile)
  function navegar(href: string) {
    setMenuAberto(false);
    router.push(href);
  }

  return (
    <>
      <style>{`
        .nav-bar {
          position: sticky; top: 0; z-index: 300;
          background: #0f172a; border-bottom: 1px solid #1e293b;
          padding: 0 16px; display: flex; align-items: center; height: 56px; gap: 8px;
        }

        .nav-logo {
          color: #fff; font-weight: 800; font-size: 17px;
          display: flex; align-items: center; gap: 8px; white-space: nowrap; flex: 1;
        }
        .nav-logo-icon {
          background: #16a34a; border-radius: 7px; width: 26px; height: 26px;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 900; flex-shrink: 0;
        }

        .nav-links { display: flex; align-items: center; gap: 2px; }
        .nav-new   { background: #16a34a; color: #fff; font-weight: 700; font-size: 13px;
                     padding: 7px 13px; border-radius: 8px; white-space: nowrap; margin-left: 4px; }

        .nav-hamburger-btn {
          display: none;
          background: #1e293b; border: none; border-radius: 8px;
          cursor: pointer; padding: 8px 14px; color: #fff;
          font-size: 24px; line-height: 1; flex-shrink: 0; user-select: none;
        }

        @media (max-width: 700px) {
          .nav-links  { display: none; }
          .nav-new    { display: none; }
          .nav-hamburger-btn { display: flex; align-items: center; justify-content: center; }
        }
      `}</style>

      <nav className="nav-bar">
        <Link href="/" className="nav-logo">
          <span className="nav-logo-icon">Q</span>
          QuitaZAP
        </Link>

        <div className="nav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} style={{
              color: ativo(l.href) ? "#fff" : "#94a3b8",
              fontWeight: ativo(l.href) ? 700 : 500,
              fontSize: 13, padding: "6px 10px", borderRadius: 8,
              background: ativo(l.href) ? "#1e293b" : "transparent", whiteSpace: "nowrap",
            }}>
              {l.label}
            </Link>
          ))}
        </div>

        <Link href="/clientes/novo" className="nav-new">+ Novo cliente</Link>
        <Link href="/logout" style={{
          color: "#64748b", fontSize: 12, fontWeight: 600,
          padding: "6px 10px", borderRadius: 8, whiteSpace: "nowrap",
        }} className="nav-links">Sair</Link>

        <button
          className="nav-hamburger-btn"
          onClick={() => setMenuAberto(!menuAberto)}
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
        >
          {menuAberto ? "✕" : "☰"}
        </button>
      </nav>

      {menuAberto && (
        <div style={{
          position: "fixed", top: 56, left: 0, right: 0, bottom: 0,
          background: "#0f172a", zIndex: 299,
          padding: 16, display: "flex", flexDirection: "column", gap: 4, overflowY: "auto",
        }}>
          {links.map((l) => (
            <button key={l.href} onClick={() => navegar(l.href)} style={{
              color: ativo(l.href) ? "#fff" : "#94a3b8",
              fontWeight: ativo(l.href) ? 700 : 500,
              fontSize: 17, padding: "16px", borderRadius: 12,
              background: ativo(l.href) ? "#1e293b" : "transparent",
              display: "block", width: "100%", textAlign: "left",
              border: "none", cursor: "pointer",
            }}>
              {l.label}
            </button>
          ))}
          <div style={{ borderTop: "1px solid #1e293b", marginTop: 8, paddingTop: 8 }}>
            <button onClick={() => navegar("/clientes/novo")} style={{
              background: "#16a34a", color: "#fff", fontWeight: 700,
              fontSize: 16, padding: "16px", borderRadius: 12,
              display: "block", width: "100%", textAlign: "center",
              border: "none", cursor: "pointer",
            }}>
              + Novo cliente
            </button>
          </div>
        </div>
      )}
    </>
  );
}
