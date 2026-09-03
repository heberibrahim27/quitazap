import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getClienteAtual, COOKIE_CLIENTE } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { FundoParallax } from "./FundoParallax";
import "./minha-conta.css";

export default async function MinhaContaLayout({ children }: { children: React.ReactNode }) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const cartoes = await prisma.cartao.findMany({
    where: { clienteId: cliente.id },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  async function sair() {
    "use server";
    const jar = await cookies();
    jar.delete(COOKIE_CLIENTE);
    redirect("/minha-conta/entrar");
  }

  return (
    <div className="mc-shell">
      <FundoParallax />
      <Header nome={cliente.nome.split(" ")[0]} fotoUrl={cliente.fotoUrl} />

      <main className="mc-main">{children}</main>

      <Suspense fallback={null}>
        <BottomNav sair={sair} cartoes={cartoes} />
      </Suspense>
    </div>
  );
}
