import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function EmprestimosPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const emprestimos = await prisma.divida.findMany({
    where: { clienteId: cliente.id, tipo: "EMPRESTIMO" },
    include: { parcelas: true },
    orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
  });

  const ativos = emprestimos.filter((e) => e.status === "ATIVA");
  const quitados = emprestimos.filter((e) => e.status !== "ATIVA");
  const totalDevedor = ativos.reduce((soma, e) => soma + (e.valorTotal - e.valorPago), 0);

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M4 21V10l8-6 8 6v11" /><path d="M9 21v-7h6v7" /></svg>
          </span>
          <span className="title-label">Empréstimos</span>
        </p>
        <Link href="/minha-conta/emprestimos/novo" className="card-link">
          + Adicionar
        </Link>
      </div>

      {ativos.length > 0 && (
        <div className="mc-card" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink-dim)" }}>Saldo devedor total</p>
          <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 800, color: "var(--red)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtValor(totalDevedor)}
          </p>
        </div>
      )}

      <div className="mc-card">
        {ativos.length === 0 ? (
          <p className="mc-empty">Nenhum empréstimo ativo. Toque em &ldquo;+ Adicionar&rdquo; pra registrar um.</p>
        ) : (
          <div className="mc-list">
            {ativos.map((e) => {
              const parcelasPagas = e.parcelas.filter((p) => p.status === "PAGA").length;
              const proximaParcela = e.parcelas
                .filter((p) => p.status === "PENDENTE")
                .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())[0];
              return (
                <Link key={e.id} href={`/minha-conta/emprestimos/${e.id}`} className="mc-list-row" style={{ textDecoration: "none" }}>
                  <div className="mc-list-icon" style={{ background: "rgba(30,99,233,0.1)", color: "var(--blue)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M4 21V10l8-6 8 6v11" /><path d="M9 21v-7h6v7" /></svg>
                  </div>
                  <div className="mc-list-body">
                    <div className="mc-list-desc">{e.credor}</div>
                    <div className="mc-list-meta">
                      {parcelasPagas}/{e.totalParcelas ?? e.parcelas.length} parcelas
                      {proximaParcela ? ` · próxima ${proximaParcela.vencimento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : " · quitado"}
                    </div>
                  </div>
                  <div className="mc-list-side">
                    <div className="mc-list-value">{fmtValor(e.valorTotal - e.valorPago)}</div>
                    <div className="mc-list-sub">de {fmtValor(e.valorTotal)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {quitados.length > 0 && (
        <>
          <div className="card-head" style={{ marginTop: 20 }}>
            <p className="card-title" style={{ fontSize: 13.5 }}>
              <span className="title-label">Quitados</span>
            </p>
          </div>
          <div className="mc-card">
            <div className="mc-list">
              {quitados.map((e) => (
                <Link key={e.id} href={`/minha-conta/emprestimos/${e.id}`} className="mc-list-row" style={{ textDecoration: "none" }}>
                  <div className="mc-list-body">
                    <div className="mc-list-desc">{e.credor}</div>
                    <div className="mc-list-meta">Quitado</div>
                  </div>
                  <div className="mc-list-side">
                    <div className="mc-list-value">{fmtValor(e.valorTotal)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
