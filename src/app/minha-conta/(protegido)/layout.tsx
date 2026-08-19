import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getClienteAtual, COOKIE_CLIENTE } from "@/lib/get-cliente";
import { manrope } from "../fonte";
import { BottomNav } from "./BottomNav";
import "./minha-conta.css";

export default async function MinhaContaLayout({ children }: { children: React.ReactNode }) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  async function sair() {
    "use server";
    const jar = await cookies();
    jar.delete(COOKIE_CLIENTE);
    redirect("/minha-conta/entrar");
  }

  const inicial = cliente.nome.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={`mc-shell ${manrope.className}`}>
      <header className="mc-header">
        <Link href="/minha-conta" className="mc-brand">
          <span className="mc-brand-mark">Q</span>
          QuitaZAP
        </Link>
        <div className="mc-header-user">
          <span className="mc-avatar">{inicial}</span>
          <form action={sair}>
            <button type="submit" className="mc-logout-btn">Sair</button>
          </form>
        </div>
      </header>

      <main className="mc-main">{children}</main>

      <Suspense fallback={null}>
        <BottomNav sair={sair} />
      </Suspense>
    </div>
  );
}
