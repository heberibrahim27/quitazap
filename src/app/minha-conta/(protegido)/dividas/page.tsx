import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { adaptarRespostaParaChat } from "@/lib/canal-chat";
import { carregarEntradaOrientacao } from "@/lib/orientador-quitacao/service";
import { montarFilaConsignados, montarOrientacao } from "@/lib/orientador-quitacao/motor";
import { ValorLista } from "../ValorLista";
import { ValorAutoAjustavel } from "../ValorAutoAjustavel";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const fmtDia = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const fmtMes = (d: Date) => d.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

const ROTULO_TIPO: Record<string, string> = {
  CARTAO: "Cartão",
  EMPRESTIMO: "Empréstimo",
  BOLETO: "Boleto",
  ACORDO: "Acordo",
  OUTRO: "Outra dívida",
};

const ROTULO_QUANDO = { AGORA: "Agora", DEPOIS: "Depois", PROXIMO: "Próximo alvo" } as const;

// Tela "Dívidas" = o centro do plano de quitação. Mostra TODAS as dívidas ativas (empréstimo e
// consignado inclusive — antes ficavam de fora e a tela dizia "nenhuma dívida" mesmo com contratos
// ativos), o plano do Orientador com as dívidas citadas pelo nome e a ordem de pagamento. Nada de
// taxa de juros: o cliente não precisa informar nem enxergar isso (decisão de 05/10/2026).
export default async function DividasPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const [entrada, todas] = await Promise.all([
    carregarEntradaOrientacao(cliente.id),
    prisma.divida.findMany({
      where: { clienteId: cliente.id },
      include: { parcelas: { orderBy: { vencimento: "asc" } } },
      orderBy: { criadoEm: "asc" },
    }),
  ]);
  const o = montarOrientacao(entrada);
  const consignados = montarFilaConsignados(entrada.dividas);

  const ativas = todas.filter((d) => d.status === "ATIVA" && d.valorTotal - d.valorPago > 0.005);
  const quitadas = todas.filter((d) => d.status === "QUITADA" || (d.status === "ATIVA" && d.valorTotal - d.valorPago <= 0.005));
  const porId = new Map(ativas.map((d) => [d.id, d]));

  // Ordem: fila de ataque (atraso, vencimento perto, menor saldo) → consignados (o que mais libera salário) → resto
  const ordemIds = [...o.fila.map((f) => f.id), ...consignados.map((c) => c.id)];
  const ordenadas = [
    ...ordemIds.map((id) => porId.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d)),
    ...ativas.filter((d) => !ordemIds.includes(d.id)),
  ];

  const totalFalta = ativas.reduce((s, d) => s + (d.valorTotal - d.valorPago), 0);
  const proximaDe = (d: (typeof ativas)[number]) => d.parcelas.find((p) => p.status !== "PAGA");
  const mensal = ativas.reduce((s, d) => s + (proximaDe(d)?.valor ?? 0), 0);
  const ultimoVenc = ativas
    .flatMap((d) => d.parcelas.map((p) => p.vencimento))
    .reduce<Date | null>((mt, v) => (mt == null || v > mt ? v : mt), null);
  const pctPago = o.progresso.percentualPago;
  const liberaPor = new Map(consignados.map((c) => [c.id, c.parcelaMensal]));
  const hrefDe = (d: (typeof ativas)[number]) => (d.tipo === "EMPRESTIMO" ? `/minha-conta/emprestimos/${d.id}` : `/minha-conta/dividas/${d.id}`);

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>
          </span>
          <span className="title-label">Dívidas</span>
        </p>
        <Link href="/minha-conta/emprestimos/novo" className="card-link">
          + Adicionar
        </Link>
      </div>

      {ativas.length === 0 ? (
        <section className="card aba-destaque verde" style={{ marginBottom: 16 }}>
          <div className="aba-destaque-topo">
            <div>
              <p className="aba-destaque-rot">Dívidas ativas</p>
              <p className="aba-destaque-valor">Nenhuma</p>
            </div>
            <span className="aba-destaque-chip">🎉 Livre</span>
          </div>
          <p className="dv-nota">Você não tem dívidas ativas registradas. Cadastre uma em “+ Adicionar” se aparecer alguma.</p>
        </section>
      ) : (
        <section className="card aba-destaque azul" style={{ marginBottom: 16 }}>
          <div className="aba-destaque-topo">
            <div>
              <p className="aba-destaque-rot">Falta quitar</p>
              <ValorAutoAjustavel texto={fmtValor(totalFalta)} className="aba-destaque-valor" />
            </div>
            <span className="aba-destaque-chip">
              {ativas.length} dívida{ativas.length === 1 ? "" : "s"}
              {o.atrasadas > 0 ? ` · ${o.atrasadas} em atraso` : ""}
            </span>
          </div>

          <div className="dv-barra" role="img" aria-label={`${pctPago}% do total já foi pago`}>
            <span style={{ width: `${Math.max(pctPago, 2)}%` }} />
          </div>
          <p className="dv-barra-legenda">
            <strong>{pctPago}%</strong> do total que você contratou já foi pago
          </p>

          <div className="emp-stats">
            <div>
              <span>Parcelas por mês</span>
              <strong>{fmtValor(mensal)}</strong>
            </div>
            <div>
              <span>Já pagou</span>
              <strong>{fmtValor(entrada.totalPago)}</strong>
            </div>
            <div>
              <span>Livre em</span>
              <strong>{ultimoVenc ? fmtMes(ultimoVenc) : "—"}</strong>
            </div>
          </div>
        </section>
      )}

      {ativas.length > 0 && o.passos.length > 0 && (
        <section className="mc-card dv-plano" style={{ marginBottom: 16 }}>
          <p className="dv-titulo">Seu plano de quitação</p>
          {o.nivel != null && o.percentualComprometido != null && (
            <p className="dv-nota">
              {Math.round(o.percentualComprometido * 100)}% da sua renda do mês já está comprometida
              {!o.modoCritico && o.sobraAlocavel > 0 ? ` · dá para direcionar ${fmtValor(o.sobraAlocavel)} às dívidas` : ""}.
            </p>
          )}
          <ol className="dv-passos">
            {o.passos.map((p, i) => (
              <li key={i} className={`dv-passo ${p.quando.toLowerCase()}`}>
                <span className="dv-passo-rot">{ROTULO_QUANDO[p.quando]}</span>
                <span className="dv-passo-txt">{adaptarRespostaParaChat(p.texto)}</span>
              </li>
            ))}
          </ol>
          <Link href="/minha-conta/chat" className="mc-btn-secondary dv-chat">
            Tirar dúvidas com o Quita
          </Link>
          <p className="dv-nota" style={{ marginTop: 10 }}>
            Orientação com base no que está registrado no QuitaZAP — não é consultoria financeira regulamentada.
          </p>
        </section>
      )}

      {ordenadas.length > 0 && (
        <>
          <div className="card-head" style={{ marginTop: 4 }}>
            <p className="card-title" style={{ fontSize: 13.5 }}>
              <span className="title-label">Pague nesta ordem</span>
            </p>
          </div>
          <div className="mc-card">
            <div className="mc-list">
              {ordenadas.map((d, i) => {
                const saldo = d.valorTotal - d.valorPago;
                const pagas = d.parcelas.filter((p) => p.status === "PAGA").length;
                const total = d.totalParcelas ?? d.parcelas.length;
                const proxima = proximaDe(d);
                const termina = d.parcelas.length > 0 ? d.parcelas[d.parcelas.length - 1].vencimento : null;
                const pct = d.valorTotal > 0 ? Math.min(Math.round((d.valorPago / d.valorTotal) * 100), 100) : 0;
                const libera = liberaPor.get(d.id);
                return (
                  <Link key={d.id} href={hrefDe(d)} className="mc-list-row dv-linha" style={{ textDecoration: "none" }}>
                    <div className="dv-ordem" style={d.emAtraso ? { background: "var(--red-soft)", color: "var(--red)" } : undefined}>{i + 1}</div>
                    <div className="mc-list-body">
                      <div className="mc-list-desc">{d.credor}</div>
                      <div className="mc-list-meta">
                        {ROTULO_TIPO[d.tipo] ?? d.tipo}
                        {total > 0 ? ` · ${pagas}/${total} parcelas` : ""}
                        {proxima ? ` · vence ${fmtDia(proxima.vencimento)}` : ""}
                        {termina ? ` · termina ${fmtMes(termina)}` : ""}
                        {d.emAtraso && (
                          <span style={{ color: "var(--red)", fontWeight: 700 }}>
                            {" "}· {d.diasAtraso != null ? `${d.diasAtraso} dias em atraso` : "em atraso"}
                          </span>
                        )}
                      </div>
                      {(d.descontadoEmFolha || libera) && (
                        <div className="dv-tags">
                          {d.descontadoEmFolha && <span className="dv-tag folha">Descontado em folha</span>}
                          {libera ? <span className="dv-tag libera">Libera {fmtValor(libera)}/mês no salário</span> : null}
                        </div>
                      )}
                      <div className="dv-mini" aria-hidden="true">
                        <span style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </div>
                    <div className="mc-list-side">
                      <ValorLista valor={saldo} />
                      <div className="mc-list-sub">faltam</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      {quitadas.length > 0 && (
        <>
          <div className="card-head" style={{ marginTop: 20 }}>
            <p className="card-title" style={{ fontSize: 13.5 }}>
              <span className="title-label">Quitadas 🎉</span>
            </p>
          </div>
          <div className="mc-card">
            <div className="mc-list">
              {quitadas.map((d) => (
                <div key={d.id} className="mc-list-row">
                  <div className="mc-list-body">
                    <div className="mc-list-desc">{d.credor}</div>
                    <div className="mc-list-meta">{ROTULO_TIPO[d.tipo] ?? d.tipo} · quitada</div>
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
