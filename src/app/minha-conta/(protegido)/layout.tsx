import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getClienteAtual, COOKIE_CLIENTE } from "@/lib/get-cliente";

export default async function MinhaContaLayout({ children }: { children: React.ReactNode }) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  async function sair() {
    "use server";
    const jar = await cookies();
    jar.delete(COOKIE_CLIENTE);
    redirect("/minha-conta/entrar");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px", background: "#0f172a", color: "#fff",
        }}
      >
        <Link href="/minha-conta" style={{ color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: 16 }}>
          QuitaZAP — Minha Conta
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 14 }}>
          <span>{cliente.nome.split(" ")[0]}</span>
          <form action={sair}>
            <button
              type="submit"
              style={{ background: "transparent", border: "1px solid #475569", color: "#e2e8f0", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>{children}</main>
    </div>
  );
}
