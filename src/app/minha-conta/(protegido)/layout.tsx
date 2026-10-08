import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getClienteAtual, COOKIE_CLIENTE } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { assinaturaVencida, MENSAGEM_ASSINATURA_VENCIDA } from "@/lib/assinatura-acesso";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { FundoParallax } from "./FundoParallax";
import { AutoRefreshDashboard } from "./AutoRefreshDashboard";
import { AnalyticsTracker } from "./AnalyticsTracker";
import "./minha-conta.css";

export default async function MinhaContaLayout({ children }: { children: React.ReactNode }) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  // Assinatura vencida / reembolsada / cancelada: o app inteiro fica atrás de uma tela de renovação
  // (os dados NÃO são apagados — renovar pela Cakto libera na hora). Cortesia e teste nunca caem aqui.
  if (assinaturaVencida(cliente)) {
    async function sairVencido() {
      "use server";
      const jar = await cookies();
      jar.delete(COOKIE_CLIENTE);
      redirect("/minha-conta/entrar");
    }
    const linkRenovar = process.env.NEXT_PUBLIC_CAKTO_URL;
    return (
      <div className="mc-shell">
        <main className="mc-main" style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 24 }}>
          <div className="mc-card" style={{ maxWidth: 420, textAlign: "center", padding: 28 }}>
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>Sua assinatura venceu</h1>
            <p style={{ marginBottom: 20 }}>{MENSAGEM_ASSINATURA_VENCIDA}</p>
            {linkRenovar && (
              <p style={{ marginBottom: 12 }}>
                <a href={linkRenovar} className="mc-btn" style={{ display: "inline-block", padding: "12px 20px", fontWeight: 700 }}>
                  Renovar assinatura
                </a>
              </p>
            )}
            <form action={sairVencido}>
              <button type="submit" style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}>
                Sair
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

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
      <AutoRefreshDashboard />
      <AnalyticsTracker />
      <FundoParallax />
      <Header nome={cliente.nome.split(" ")[0]} fotoUrl={cliente.fotoUrl} />

      <main className="mc-main">{children}</main>

      <Suspense fallback={null}>
        <BottomNav sair={sair} cartoes={cartoes} />
      </Suspense>
    </div>
  );
}
