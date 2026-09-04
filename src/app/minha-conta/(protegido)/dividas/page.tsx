import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { ValorLista } from "../ValorLista";
import { calcularRotaLivreDividas } from "@/lib/financeiro/rota-livre-dividas";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ROTULO_TIPO: Record<string, string> = {
  CARTAO: "Cartão",
  EMPRESTIMO: "Empréstimo",
  BOLETO: "Boleto",
  ACORDO: "Acordo",
  OUTRO: "Outro",
};

export default async function DividasPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  // Empréstimo é um tipo de Dívida no schema, mas já tem tela própria
  // (Empréstimos, com controle de parcelas) — mostrar aqui também duplicava
  // o mesmo lançamento em duas telas diferentes.
  const dividas = await prisma.divida.findMany({
    where: { clienteId: cliente.id, tipo: { not: "EMPRESTIMO" } },
    orderBy: [{ status: "asc" }, { prioridade: "desc" }, { criadoEm: "asc" }],
  });

  const ativas = dividas.filter((d) => d.status === "ATIVA");
  const outras = dividas.filter((d) => d.status !== "ATIVA");
  const totalDevedor = ativas.reduce((soma, d) => soma + (d.valorTotal - d.valorPago), 0);

  // Rota pra ficar livre das dívidas (src/lib/financeiro/rota-livre-dividas.ts)
  // — inclui TODAS as dívidas ativas, empréstimos inclusive (que não
  // aparecem na lista abaixo, só em Empréstimos), porque a rota é sobre a
  // dívida total, não só o que esta tela mostra.
  const rota = await calcularRotaLivreDividas(cliente.id);

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>
          </span>
          <span className="title-label">Dívidas</span>
        </p>
      </div>

      {ativas.length > 0 && (
        <div className="mc-card" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink-dim)" }}>Saldo devedor total</p>
          <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 800, color: "var(--red)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtValor(totalDevedor)}
          </p>
        </div>
      )}

      {rota.porMenorSaldo.length >= 2 && (
        <div className="mc-card" style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 700 }}>Rota pra ficar livre das dívidas</p>
          <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-dim)" }}>
            Por menor saldo primeiro: comece por <strong>{rota.porMenorSaldo[0].credor}</strong> ({fmtValor(rota.porMenorSaldo[0].saldoDevedor)}).
          </p>
          {rota.prioridadeJuros ? (
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-dim)" }}>
              Por maior juros primeiro: <strong>{rota.prioridadeJuros.credor}</strong> ainda tem {fmtValor(rota.prioridadeJuros.jurosRestante ?? 0)} de juros embutido — quitando à vista, você economiza esse valor.
            </p>
          ) : (
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-dim)" }}>
              Por maior juros primeiro: nenhuma dívida com juros identificável nos dados cadastrados.
            </p>
          )}
          {rota.dataLivreDeTudo && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink-faint)" }}>
              Se nada mudar, você fica livre de tudo em {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(rota.dataLivreDeTudo)}.
            </p>
          )}
        </div>
      )}

      <div className="mc-card">
        {ativas.length === 0 ? (
          <p className="mc-empty">Nenhuma dívida ativa registrada. 🎉</p>
        ) : (
          <div className="mc-list">
            {ativas.map((d) => (
              <Link key={d.id} href={`/minha-conta/dividas/${d.id}`} className="mc-list-row" style={{ textDecoration: "none" }}>
                <div className="mc-list-icon" style={{ background: d.emAtraso ? "var(--red-soft)" : "rgba(30,99,233,0.1)", color: d.emAtraso ? "var(--red)" : "var(--blue)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>
                </div>
                <div className="mc-list-body">
                  <div className="mc-list-desc">{d.credor}</div>
                  <div className="mc-list-meta">
                    {ROTULO_TIPO[d.tipo] ?? d.tipo}
                    {d.totalParcelas ? ` · ${d.totalParcelas}x` : ""}
                    {d.diaVencimento ? ` · vence dia ${d.diaVencimento}` : ""}
                    {d.emAtraso && (
                      <span style={{ color: "var(--red)", fontWeight: 700 }}>
                        {" "}· {d.diasAtraso != null ? `${d.diasAtraso} dias em atraso` : "em atraso"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mc-list-side">
                  <ValorLista valor={d.valorTotal - d.valorPago} />
                  <div className="mc-list-sub">de {fmtValor(d.valorTotal)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {outras.length > 0 && (
        <>
          <div className="card-head" style={{ marginTop: 20 }}>
            <p className="card-title" style={{ fontSize: 13.5 }}>
              <span className="title-label">Quitadas / encerradas</span>
            </p>
          </div>
          <div className="mc-card">
            <div className="mc-list">
              {outras.map((d) => (
                <div key={d.id} className="mc-list-row">
                  <div className="mc-list-body">
                    <div className="mc-list-desc">{d.credor}</div>
                    <div className="mc-list-meta">{ROTULO_TIPO[d.tipo] ?? d.tipo} · {d.status === "QUITADA" ? "Quitada" : d.status}</div>
                  </div>
                  <div className="mc-list-side">
                    <ValorLista valor={d.valorTotal} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
