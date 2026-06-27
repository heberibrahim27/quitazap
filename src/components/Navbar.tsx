"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/",         label: "Dashboard"   },
  { href: "/clientes", label: "Clientes"    },
  { href: "/vencidas", label: "⚠️ Vencidas" },
  { href: "/financeiro", label: "💰 Financeiro" },
  { href: "/exportar", label: "Exportar"    },
  { href: "/oferta",         label: "Oferta"        },
  { href: "/configuracoes", label: "⚙️ Config"     },
];

export function Navbar() {
  const pathname = usePathname();

  if (pathname === "/oferta" || pathname === "/login") return null;

  function ativo(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <>
      <style>{`
        #nav-toggle { display: none; }

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

        .nav-hamburger-label {
          display: none;
          background: #1e293b; border: none; border-radius: 8px;
          cursor: pointer; padding: 8px 14px; color: #fff;
          font-size: 24px; line-height: 1; flex-shrink: 0; user-select: none;
        }

        .nav-mobile-menu {
          display: none;
          position: fixed; top: 56px; left: 0; right: 0; bottom: 0;
          background: #0f172a; z-index: 299;
          padding: 16px; flex-direction: column; gap: 4px; overflow-y: auto;
        }

        #nav-toggle:checked ~ .nav-mobile-menu { display: flex; }
        #nav-toggle:checked ~ .nav-bar .nav-hamburger-label::after { content: "✕"; }
        .nav-hamburger-label::after { content: "☰"; }

        @media (max-width: 700px) {
          .nav-links  { display: none; }
          .nav-new    { display: none; }
          .nav-hamburger-label { display: flex; align-items: center; justify-content: center; }
        }
      `}</style>

      <input type="checkbox" id="nav-toggle" />

      <div className="nav-mobile-menu">
        {links.map((l) => (
          <Link key={l.href} href={l.href} style={{
            color: ativo(l.href) ? "#fff" : "#94a3b8",
            fontWeight: ativo(l.href) ? 700 : 500,
            fontSize: 17, padding: "16px", borderRadius: 12,
            background: ativo(l.href) ? "#1e293b" : "transparent", display: "block",
          }}>
            {l.label}
          </Link>
        ))}
        <div style={{ borderTop: "1px solid #1e293b", marginTop: 8, paddingTop: 8 }}>
          <Link href="/clientes/novo" style={{
            background: "#16a34a", color: "#fff", fontWeight: 700,
            fontSize: 16, padding: "16px", borderRadius: 12,
            display: "block", textAlign: "center",
          }}>
            + Novo cliente
          </Link>
        </div>
      </div>

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

        <label htmlFor="nav-toggle" className="nav-hamburger-label" />
      </nav>
    </>
  );
}
