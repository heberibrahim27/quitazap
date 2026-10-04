import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { ValorLista } from "../ValorLista";

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

  // Somatório do que pesa todo mês: a próxima parcela em aberto de cada contrato ativo.
  const proximaDe = (e: (typeof ativos)[number]) =>
    e.parcelas.filter((p) => p.status !== "PAGA").sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())[0];
  const mensalDe = (e: (typeof ativos)[number]) => proximaDe(e)?.valor ?? 0;
  const totalMensal = ativos.reduce((soma, e) => soma + mensalDe(e), 0);
  const mensalEmFolha = ativos.filter((e) => e.descontadoEmFolha).reduce((soma, e) => soma + mensalDe(e), 0);
  const mensalFora = totalMensal - mensalEmFolha;
  const totalJaPago = ativos.reduce((soma, e) => soma + e.valorPago, 0);
  const ultimoVencimento = ativos
    .flatMap((e) => e.parcelas.map((p) => p.vencimento))
    .reduce<Date | null>((mt, v) => (mt == null || v > mt ? v : mt), null);

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
        <section className="card aba-destaque vermelho" style={{ marginBottom: 16 }}>
          <div className="aba-destaque-topo">
            <div>
              <p className="aba-destaque-rot">Você paga por mês</p>
              <p className="aba-destaque-valor">{fmtValor(totalMensal)}</p>
            </div>
            <span className="aba-destaque-chip">{ativos.length} contrato{ativos.length === 1 ? "" : "s"}</span>
          </div>

          {mensalEmFolha > 0 && mensalFora > 0 && (
            <>
              <div className="rsm-pilha" role="img" aria-label="Divisão da parcela mensal entre consignados e outros">
                <span className="rsm-seg" style={{ flexGrow: mensalEmFolha, background: "#1E63E9", "--i": 0 } as React.CSSProperties} />
                <span className="rsm-seg" style={{ flexGrow: mensalFora, background: "#F08A00", "--i": 1 } as React.CSSProperties} />
              </div>
              <ul className="aba-legenda">
                <li><i style={{ background: "#1E63E9" }} /><span>Consignados (folha)</span><strong>{fmtValor(mensalEmFolha)}</strong></li>
                <li><i style={{ background: "#F08A00" }} /><span>Outros</span><strong>{fmtValor(mensalFora)}</strong></li>
              </ul>
            </>
          )}
          {mensalEmFolha > 0 && mensalFora === 0 && (
            <p className="aba-delta bom" style={{ color: "#1E63E9", background: "rgba(30,99,233,0.12)" }}>Tudo descontado em folha</p>
          )}

          <div className="emp-stats">
            <div>
              <span>Falta pagar</span>
              <strong>{fmtValor(totalDevedor)}</strong>
            </div>
            <div>
              <span>Já pagou</span>
              <strong>{fmtValor(totalJaPago)}</strong>
            </div>
            <div>
              <span>Livre em</span>
              <strong>{ultimoVencimento ? ultimoVencimento.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "—"}</strong>
            </div>
          </div>
        </section>
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
              // Data final = vencimento da última parcela cadastrada (não
              // necessariamente a de maior "numero" — pega pelo vencimento
              // em si, pra não depender de numeração sempre sequencial).
              const ultimaParcela = e.parcelas.length > 0
                ? e.parcelas.reduce((mt, p) => (p.vencimento > mt.vencimento ? p : mt))
                : null;
              return (
                <Link key={e.id} href={`/minha-conta/emprestimos/${e.id}`} className="mc-list-row" style={{ textDecoration: "none" }}>
                  <div className="mc-list-icon" style={{ background: "rgba(30,99,233,0.1)", color: "var(--blue)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M4 21V10l8-6 8 6v11" /><path d="M9 21v-7h6v7" /></svg>
                  </div>
                  <div className="mc-list-body">
                    <div className="mc-list-desc">{e.credor}</div>
                    <div className="mc-list-meta">
                      {parcelasPagas}/{e.totalParcelas ?? e.parcelas.length} parcelas
                      {proximaParcela ? ` · vence ${proximaParcela.vencimento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : " · quitado"}
                      {ultimaParcela ? ` · termina ${ultimaParcela.vencimento.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}` : ""}
                    </div>
                  </div>
                  <div className="mc-list-side">
                    {/* Parcela mensal é o valor principal aqui — é o que
                        pesa no orçamento do mês, diferente do saldo devedor
                        (total ainda faltando pagar do empréstimo inteiro). */}
                    <ValorLista valor={proximaParcela ? proximaParcela.valor : e.valorTotal - e.valorPago} />
                    <div className="mc-list-sub">
                      {proximaParcela ? `faltam ${fmtValor(e.valorTotal - e.valorPago)}` : "quitado"}
                    </div>
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
                    <ValorLista valor={e.valorTotal} />
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
