import type { LimiteSeguro } from "@/lib/financeiro/limite-seguro";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDataDia(diaISO: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${diaISO}T12:00:00`));
}

// "Próximo salário" aqui é aproximado pelo fim do mês corrente — o app
// não tem a data exata do salário do cliente (decisão de produto: não
// adicionar esse campo por enquanto). Mesmos números do motor central
// (src/lib/financeiro/limite-seguro.ts), só reformatados pra cartão.
//
// "Livre até lá" (saldoLivre) JÁ desconta compromissosRestantes (parcelas
// de dívida que ainda vencem este mês) — não são dois valores paralelos.
// Por isso compromissosRestantes aparece como legenda explicativa embaixo
// do valor livre, nunca como um segundo número lado a lado: mostrar os
// dois como estatísticas independentes dava a entender que a dívida ainda
// seria abatida de novo mais pra frente (achado reportado com print).
//
const CABECALHO = (
  <div className="card-head">
    <p className="card-title" style={{ fontSize: 14 }}>
      <span className="title-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
      </span>
      <span className="title-label">Até o próximo salário</span>
    </p>
  </div>
);

// Título fica FORA de .card (mesmo padrão do "Resumo"/"Saúde financeira"
// na Home: card-head como irmão antes do card, não aninhado dentro dele).
export function LimiteSeguroCard({
  limite,
  entradaPrevista = null,
}: {
  limite: LimiteSeguro;
  /** Quando uma entrada prevista (salário recorrente etc.) cobre o saldo negativo do mês. */
  entradaPrevista?: { texto: string; depoisLabel: string; depoisValor: number } | null;
}) {
  // Sem renda lançada este mês nem declarada no Perfil: saldoLivre/
  // limiteSeguroDiario seriam só "0 menos despesas", não um saldo real —
  // não mostra como se fosse (achado de auditoria de edge case, mesmo
  // espírito do dadosInsuficientes do SaudeFinanceiraCard).
  if (limite.semDadosSuficientes) {
    return (
      <>
        {CABECALHO}
        <div className="card" style={{ paddingBottom: 18 }}>
          <div style={{ padding: "0 18px 14px" }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: "var(--mc-ink-dim)" }}>
              Ainda não consigo calcular seu limite seguro — cadastre sua renda no Perfil ou lance sua primeira receita do mês.
            </p>
          </div>
        </div>
      </>
    );
  }

  const negativo = limite.saldoLivre < 0;

  // Linha do mês: onde estamos (hoje, em Brasília) e, se existir, o dia que aperta.
  // Este card só aparece no mês corrente (ver page.tsx), então o mês é o de hoje.
  const [anoHoje, mesHoje, diaHoje] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .split("-")
    .map(Number);
  const diasNoMes = new Date(anoHoje, mesHoje, 0).getDate();
  const posicao = (dia: number) => `${Math.max(0, Math.min((dia - 1) / Math.max(diasNoMes - 1, 1), 1)) * 100}%`;
  const diaApertado = limite.diaApertado ? Number(limite.diaApertado.data.slice(8, 10)) : null;

  return (
    <>
      {CABECALHO}

      <div className="card limite-card">
        <div className="limite-topo">
          <div className="limite-principal">
            <p className="limite-rot">Livre até lá</p>
            <p className={`limite-valor${negativo ? " neg" : ""}`}>{fmt(limite.saldoLivre)}</p>
          </div>
          <div className="limite-dias">
            {limite.diasRestantes > 0 ? (
              <>
                <strong>{limite.diasRestantes}</strong>
                <span>dia{limite.diasRestantes !== 1 ? "s" : ""} pro fim do mês</span>
              </>
            ) : (
              <span>Último dia do mês</span>
            )}
          </div>
        </div>

        {limite.compromissosRestantes > 0 && (
          <p className="limite-nota">já descontando {fmt(limite.compromissosRestantes)} em dívidas que ainda vencem este mês</p>
        )}

        <div className="limite-linha" role="img" aria-label={`Dia ${diaHoje} de ${diasNoMes} do mês`}>
          <span className="limite-linha-trilho">
            <span className="limite-linha-preenchido" style={{ width: posicao(diaHoje) }} />
          </span>
          {diaApertado != null && (
            <span className="limite-pino aperta" style={{ left: posicao(diaApertado) }} title={`Dia ${diaApertado} aperta`} />
          )}
          <span className="limite-pino hoje" style={{ left: posicao(diaHoje) }} title="Hoje" />
        </div>
        <div className="limite-linha-legenda">
          <span>Dia 1</span>
          <span>Hoje, dia {diaHoje}</span>
          <span>Dia {diasNoMes}</span>
        </div>

        {!negativo && (
          <div className="limite-diario">
            <span className="limite-diario-icone" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="4" /><path d="M3 9.5h18" /><path d="M8 3v3M16 3v3" /></svg>
            </span>
            <span className="limite-diario-texto">
              <span>Limite seguro por dia</span>
              <strong>{fmt(Math.max(limite.limiteSeguroDiario, 0))}</strong>
            </span>
          </div>
        )}

        {(negativo || limite.diaApertado) && (
          <ul className="saude-razoes">
            {negativo && (
              entradaPrevista ? (
                <li className="saude-razao atencao">
                  <span className="saude-razao-icone" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></svg>
                  </span>
                  <span>
                    Ainda falta entrar dinheiro: {entradaPrevista.texto} cobre o mês. {entradaPrevista.depoisLabel}: {fmt(entradaPrevista.depoisValor)}.
                  </span>
                </li>
              ) : (
                <li className="saude-razao negativa">
                  <span className="saude-razao-icone" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </span>
                  <span>Seu saldo até o fim do mês já está negativo.</span>
                </li>
              )
            )}
            {limite.diaApertado && (
              <li className="saude-razao atencao">
                <span className="saude-razao-icone" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7v6" /><path d="M12 17h.01" /></svg>
                </span>
                <span>Dia {fmtDataDia(limite.diaApertado.data)} aperta: {limite.diaApertado.itens.length} {limite.diaApertado.itens.length === 1 ? "conta vence" : "contas vencem juntas"}, somando {fmt(limite.diaApertado.totalNoDia)}.</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </>
  );
}
