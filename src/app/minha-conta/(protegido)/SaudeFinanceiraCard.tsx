import type { SaudeFinanceira } from "@/lib/financeiro/saude-financeira-contrato";

const COR_CLASSIFICACAO: Record<SaudeFinanceira["classificacao"], string> = {
  Excelente: "var(--green)",
  Boa: "var(--green)",
  Atenção: "var(--orange)",
  Crítica: "var(--red)",
};

const ROTULO_CURTO: Record<string, string> = {
  "Comprometimento da renda": "Renda",
  "Resultado do período": "Resultado",
  "Ritmo de despesas variáveis": "Ritmo",
  "Dívidas em atraso": "Atrasos",
};

const ICONE_CORACAO = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>
);

const CABECALHO = (
  <div className="card-head">
    <p className="card-title" style={{ fontSize: 14 }}>
      <span className="title-icon">{ICONE_CORACAO}</span>
      <span className="title-label">Saúde financeira</span>
    </p>
  </div>
);

// Score 0-100 determinístico (src/lib/financeiro/saude-financeira.ts) — a
// IA não participa desse número. Só é chamado quando o mês já tem algum
// lançamento (ver page.tsx); mesmo assim, `dadosInsuficientes` pode vir
// true (ex: conta nova com só um lançamento de meta, sem renda/receita
// nenhuma) — nesse caso não mostra número nenhum, pra não passar a
// impressão de um "78/100 Boa" que a conta ainda não tem dado pra sustentar.
//
// Título fica FORA de .card (mesmo padrão do "Resumo" logo abaixo na Home:
// card-head como irmão antes do card, não aninhado dentro dele).
export function SaudeFinanceiraCard({ saude }: { saude: SaudeFinanceira }) {
  if (saude.dadosInsuficientes) {
    return (
      <>
        {CABECALHO}
        <div className="card" style={{ paddingBottom: 18 }}>
          <div style={{ padding: "0 18px 14px" }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: "var(--mc-ink-dim)" }}>
              Ainda não há renda, receita ou histórico de gastos suficientes este mês pra calcular sua saúde financeira. Continue lançando por aqui que o número aparece assim que tiver o que comparar.
            </p>
          </div>
        </div>
      </>
    );
  }

  const cor = COR_CLASSIFICACAO[saude.classificacao];

  // Razões neutras sem dado ("— Ainda sem histórico…") não agregam: o gráfico
  // já mostra o componente. O símbolo ✓/✗/⚠ do texto vira ícone próprio.
  const razoes = saude.razoes
    .filter((r) => !r.texto.startsWith("—"))
    .map((r) => ({ tipo: r.tipo, texto: r.texto.replace(/^[✓✗⚠]s*/, "") }));

  return (
    <>
      {CABECALHO}
      <div className="card saude-card">
        <div className="saude-topo">
          <div className="saude-anel" style={{ "--p": `${saude.score * 3.6}deg`, "--cor": cor } as React.CSSProperties}>
            <div className="saude-anel-miolo">
              <strong>{saude.score}</strong>
              <span>de 100</span>
            </div>
          </div>
          <div className="saude-resumo">
            <p className="saude-classe" style={{ color: cor }}>{saude.classificacao}</p>
            <p className="saude-sub">Sua saúde financeira em {saude.score} pontos</p>
          </div>
        </div>

        <div className="saude-grafico" role="img" aria-label={`Pontuação por critério: ${saude.componentes.map((c) => `${c.nome} ${Math.round(c.pontos)} de ${c.pontosMaximos}`).join(", ")}`}>
          {saude.componentes.map((comp, i) => {
            const pct = comp.pontosMaximos > 0 ? Math.max(0, Math.min(comp.pontos / comp.pontosMaximos, 1)) : 0;
            const tom = pct >= 0.7 ? "bom" : pct >= 0.4 ? "medio" : "ruim";
            return (
              <div key={comp.nome} className="saude-col">
                <span className="saude-val">{Math.round(comp.pontos)}<small>/{comp.pontosMaximos}</small></span>
                <span className="saude-trilho">
                  <span className={`saude-barra ${tom}`} style={{ "--h": `${Math.max(pct * 100, 5)}%`, "--i": i } as React.CSSProperties} />
                </span>
                <span className="saude-rot">{comp.nome === "Dívidas em atraso" && pct === 1 ? "Sem atrasos" : (ROTULO_CURTO[comp.nome] ?? comp.nome)}</span>
              </div>
            );
          })}
        </div>

        {razoes.length > 0 && (
          <ul className="saude-razoes">
            {razoes.map((razao, i) => (
              <li key={i} className={`saude-razao ${razao.tipo}`}>
                <span className="saude-razao-icone" aria-hidden="true">
                  {razao.tipo === "positiva" ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  ) : razao.tipo === "negativa" ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7v6" /><path d="M12 17h.01" /></svg>
                  )}
                </span>
                <span>{razao.texto}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
