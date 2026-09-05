import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { calcularPlanoPagamento, type ItemPlano } from "@/lib/plano-pagamento-motor";
import { ValorLista } from "../ValorLista";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Tela "Plano de pagamento": número de sobra (real desde sempre) + ordem
// recomendada de pagamento (motor determinístico — ver
// plano-pagamento-motor.ts, consenso de arquitetura fechado em
// 2026-09-05). Substitui o antigo texto fixo "a recomendação completa
// ainda está sendo construída" pela recomendação de verdade.
export default async function PlanoPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const plano = await calcularPlanoPagamento(cliente.id);
  const totalPagarAgora = plano.pagarAgora.reduce((soma, i) => soma + i.valor, 0);
  const livreDepois = plano.orcamentoParaDividas - totalPagarAgora;
  const semDividasAtivas = plano.pagarAgora.length === 0 && plano.negociarRever.length === 0 && plano.podeEsperar.length === 0;

  return (
    <div>
      <div className="mc-hero">
        <div className="mc-hero-top">
          <div>
            <p className="mc-hero-greeting">Plano de pagamento</p>
          </div>
        </div>

        <div className="mc-hero-body">
          <div>
            <p className="mc-hero-label">{!plano.calculavel || plano.orcamentoParaDividas >= 0 ? "Disponível pra dívidas este mês" : "Déficit já nas despesas fixas, antes das dívidas"}</p>
            <p className="mc-hero-amount" style={{ color: !plano.calculavel || plano.orcamentoParaDividas >= 0 ? "#fff" : "#fca5a5" }}>
              {!plano.calculavel && "— "}
              {plano.calculavel ? fmtValor(Math.abs(plano.orcamentoParaDividas)) : "cadastre sua renda mensal"}
            </p>
            <p className="mc-hero-caption">
              {plano.calculavel
                ? `${fmtValor(plano.rendaDisponivel)} de renda − ${fmtValor(plano.totalDespesasNaoDivida)} em despesas fixas e variáveis`
                : "Sem renda mensal cadastrada não dá pra calcular sobra ou déficit."}
            </p>
          </div>
        </div>
      </div>

      {!plano.calculavel ? (
        <section className="mc-section">
          <div className="mc-card">
            <p className="mc-empty">Cadastre sua renda mensal no Perfil pra ver a ordem recomendada de pagamento.</p>
          </div>
        </section>
      ) : semDividasAtivas ? (
        <section className="mc-section">
          <div className="mc-card">
            <p className="mc-empty">Nenhuma dívida ativa registrada. 🎉</p>
          </div>
        </section>
      ) : (
        <>
          <div className="card-head" style={{ marginTop: 4 }}>
            <p className="card-title" style={{ fontSize: 13.5 }}>
              <span className="title-label">Pague nesta ordem</span>
            </p>
          </div>
          <section className="mc-section" style={{ paddingTop: 0 }}>
            <div className="mc-card">
              {plano.pagarAgora.length === 0 ? (
                <p className="mc-empty">Nada obrigatório este mês — veja "Pode esperar" abaixo.</p>
              ) : (
                <div className="mc-list">
                  {plano.pagarAgora.map((item, i) => (
                    <ItemLista key={item.dividaId} item={item} posicao={i + 1} />
                  ))}
                </div>
              )}
            </div>
            {plano.pagarAgora.length > 0 && (
              <p style={{ margin: "10px 2px 0", fontSize: 12.5, color: "var(--ink-dim)" }}>
                Depois desses pagamentos: <strong style={{ color: livreDepois >= 0 ? "var(--ink)" : "var(--red)" }}>{fmtValor(livreDepois)}</strong> {livreDepois >= 0 ? "livres" : "faltando"} este mês.
              </p>
            )}
          </section>

          {plano.negociarRever.length > 0 && (
            <>
              <div className="card-head">
                <p className="alerta-title">
                  <span className="title-icon red">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>
                  </span>
                  Não fecha esse mês
                </p>
              </div>
              <div className="alerta-card" style={{ marginBottom: 20 }}>
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ink-dim)" }}>
                  Faltam {fmtValor(Math.abs(plano.faltaParaFechar))} pra cobrir os compromissos prioritários abaixo — considere negociar prazo ou valor com o credor.
                </p>
                <div className="mc-list">
                  {plano.negociarRever.map((item) => (
                    <ItemLista key={item.dividaId} item={item} />
                  ))}
                </div>
              </div>
            </>
          )}

          {plano.podeEsperar.length > 0 && (
            <>
              <div className="card-head">
                <p className="card-title" style={{ fontSize: 13.5 }}>
                  <span className="title-label">Pode esperar</span>
                </p>
              </div>
              <section className="mc-section" style={{ paddingTop: 0 }}>
                <div className="mc-card" style={{ opacity: 0.75 }}>
                  <div className="mc-list">
                    {plano.podeEsperar.map((item) => (
                      <ItemLista key={item.dividaId} item={item} />
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          <p style={{ margin: "4px 2px 0", fontSize: 11, color: "var(--ink-faint)" }}>
            Ordem calculada a partir dos dados registrados no QuitaZap — não é consultoria financeira regulamentada.
          </p>
        </>
      )}
    </div>
  );
}

function ItemLista({ item, posicao }: { item: ItemPlano; posicao?: number }) {
  return (
    <div className="mc-list-row">
      {posicao != null && (
        <div className="mc-list-icon" style={{ background: "rgba(30,99,233,0.1)", color: "var(--blue)", fontWeight: 800, fontSize: 13 }}>
          {posicao}
        </div>
      )}
      <div className="mc-list-body">
        <div className="mc-list-desc">{item.credor}</div>
        <div className="mc-list-meta">{item.justificativa}</div>
      </div>
      <div className="mc-list-side">
        <ValorLista valor={item.valor} />
      </div>
    </div>
  );
}
