import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getClienteAtual, COOKIE_CLIENTE } from "@/lib/get-cliente";
import { Header } from "./Header";
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

  return (
    <div className="mc-shell">
      <Header nome={cliente.nome.split(" ")[0]} fotoUrl={cliente.fotoUrl} />

      <main className="mc-main">{children}</main>

      <Suspense fallback={null}>
        <BottomNav sair={sair} />
      </Suspense>
    </div>
  );
}
