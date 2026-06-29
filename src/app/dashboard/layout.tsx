"use client";

// Layout do /dashboard — sidebar + autenticação
import { useState, useEffect, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

type UsuarioCtx = {
  id: string; nome: string; email: string; plano: string;
  wpConectado: boolean; planoPago: boolean;
};
const CtxUsuario = createContext<UsuarioCtx | null>(null);
export const useUsuario = () => useContext(CtxUsuario);

const NAV = [
  { href: "/dashboard",                  icon: "🏠", label: "Início"         },
  { href: "/dashboard/receber",          icon: "💰", label: "Receber"        },
  { href: "/dashboard/contatos",         icon: "👥", label: "Contatos"       },
  { href: "/dashboard/mensagens",        icon: "💬", label: "Mensagens"      },
  { href: "/dashboard/pagamentos",       icon: "✅", label: "Pagamentos"     },
  { href: "/dashboard/relatorios",       icon: "📊", label: "Relatórios"     },
  { href: "/dashboard/whatsapp",         icon: "📱", label: "WhatsApp"       },
  { href: "/dashboard/configuracoes",    icon: "⚙️", label: "Configurações"  },
  { href: "/dashboard/plano",            icon: "⭐", label: "Meu Plano"      },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario]       = useState<UsuarioCtx | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [menuAberto, setMenuAberto] = useState(false);

  // Fecha o menu sempre que a rota mudar (mais confiável que onClick em mobile)
  useEffect(() => { setMenuAberto(false); }, [pathname]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        if (!r.ok) { router.replace("/entrar"); return; }
        const data = await r.json();
        setUsuario(data.usuario);
      })
      .catch(() => router.replace("/entrar"))
      .finally(() => setCarregando(false));
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/entrar");
  }

  if (carregando) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#64748b", fontSize: 15 }}>Carregando...</div>
      </div>
    );
  }

  if (!usuario) return null;

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <CtxUsuario.Provider value={usuario}>
      <style>{`
        .dash-sidebar {
          position: fixed; top: 0; left: 0; bottom: 0; width: 240px;
          background: #0f172a; border-right: 1px solid #1e293b;
          display: flex; flex-direction: column; z-index: 100; overflow-y: auto;
        }
        .dash-main   { margin-left: 240px; min-height: 100vh; background: #f8fafc; }
        .dash-topbar { display: none; }
        .dash-overlay { display: none; }

        @media (max-width: 768px) {
          .dash-sidebar {
            transform: translateX(-100%); transition: transform 0.25s ease;
            width: 260px;
          }
          .dash-sidebar.aberto { transform: translateX(0); }
          .dash-main   { margin-left: 0; }
          .dash-topbar {
            display: flex; position: sticky; top: 0; z-index: 90;
            background: #0f172a; border-bottom: 1px solid #1e293b;
            height: 54px; align-items: center; padding: 0 16px; gap: 12px;
          }
          .dash-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.5);
            z-index: 99; display: block;
          }
        }
      `}</style>

      {/* Overlay mobile */}
      {menuAberto && (
        <div className="dash-overlay" onClick={() => setMenuAberto(false)} />
      )}

      {/* Sidebar */}
      <aside className={`dash-sidebar${menuAberto ? " aberto" : ""}`}>
        {/* Logo */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, background: "#16a34a", borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 900, fontSize: 16, color: "white", flexShrink: 0,
            }}>Q</div>
            <div>
              <div style={{ color: "white", fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>QuitaZAP</div>
              <div style={{ color: "#22c55e", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>RECEBER</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} onClick={() => setMenuAberto(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 10, marginBottom: 2,
                  background: active ? "#1e293b" : "transparent",
                  color: active ? "white" : "#64748b",
                  fontWeight: active ? 700 : 500, fontSize: 14, textDecoration: "none",
                  transition: "all 0.15s",
                }}>
                <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{item.icon}</span>
                {item.label}
                {item.href === "/dashboard/whatsapp" && !usuario.wpConectado && (
                  <span style={{ marginLeft: "auto", fontSize: 10, background: "#f59e0b", color: "#92400e", fontWeight: 700, padding: "2px 6px", borderRadius: 6 }}>
                    Conectar
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Usuário */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b" }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: "white", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {usuario.nome}
            </div>
            <div style={{ color: "#475569", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>
              {usuario.email}
            </div>
            <div style={{
              display: "inline-block", marginTop: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              padding: "2px 8px", borderRadius: 6,
              background: usuario.planoPago ? "#14532d" : "#1e293b",
              color: usuario.planoPago ? "#4ade80" : "#64748b",
            }}>
              {usuario.plano.replace("_", " ")}
            </div>
          </div>
          <button onClick={logout} style={{
            width: "100%", padding: "8px", borderRadius: 8, border: "1px solid #1e293b",
            background: "transparent", color: "#64748b", fontSize: 12, cursor: "pointer",
            fontWeight: 600,
          }}>
            Sair
          </button>
        </div>
      </aside>

      {/* Topbar mobile */}
      <div className="dash-topbar">
        <button onClick={() => setMenuAberto(!menuAberto)} style={{
          background: "#1e293b", border: "none", color: "white", borderRadius: 8,
          padding: "8px 12px", cursor: "pointer", fontSize: 18,
        }}>☰</button>
        <div style={{ color: "white", fontWeight: 800, fontSize: 15, flex: 1 }}>
          QuitaZAP <span style={{ color: "#22c55e", fontSize: 11 }}>RECEBER</span>
        </div>
      </div>

      {/* Conteúdo */}
      <main className="dash-main">
        {children}
      </main>
    </CtxUsuario.Provider>
  );
}
