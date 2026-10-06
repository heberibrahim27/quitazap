import type { SaudeFinanceira } from "@/lib/financeiro/saude-financeira-contrato";

// Faixas em linguagem de bússola, não de boletim: "Prioridade agora" usa azul (foco), não vermelho (culpa).
const COR_CLASSIFICACAO: Record<SaudeFinanceira["classificacao"], string> = {
  "Bem encaminhada": "var(--green)",
  "Em organização": "var(--green)",
  Atenção: "var(--orange)",
  "Prioridade agora": "var(--blue)",
};

const SUBTITULO: Record<SaudeFinanceira["classificacao"], string> = {
  "Bem encaminhada": "Você está no caminho certo.",
  "Em organização": "Boa base, com espaço para melhorar.",
  Atenção: "Alguns pontos pedem cuidado.",
  "Prioridade agora": "Vamos focar primeiro no que traz mais respiro.",
};

const FALTA_TEXTO: Record<string, string> = {
  renda: "Sua renda (no Perfil ou lançando o salário)",
  gastos: "Seus gastos do mês (mercado, contas, transporte)",
};

// Nomes em linguagem de gente; cada um tem uma frase de explicação no "Como essa nota é calculada".
const EXPLICACAO: Array<{ nome: string; texto: string }> = [
  { nome: "Fôlego do mês", texto: "Quanto sobra da sua renda depois do que já está previsto. Mais sobra, mais pontos." },
  { nome: "Peso da dívida", texto: "Quanto ainda falta quitar em relação à sua renda. As parcelas descontadas em folha não pesam no mês, mas o saldo todo conta aqui." },
  { nome: "Contas em dia", texto: "Como estão seus vencimentos. Sem atraso você ganha todos os pontos." },
  { nome: "Respiro", texto: "Quantos dias do seu dia a dia a meta Respiro já cobre (o alvo é 7)." },
  { nome: "Avanço na quitação", texto: "Quanto da dívida que você contratou já foi paga." },
];

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

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Nota 0-100 determinística (src/lib/financeiro/saude-financeira.ts) — a IA não participa do número.
// Regra de ouro: falta de informação nunca vira nota. Sem renda ou sem gastos conhecidos o card mostra
// "Montando sua nota" e o que falta, em vez de um número enganoso.
export function SaudeFinanceiraCard({ saude }: { saude: SaudeFinanceira }) {
  if (saude.dadosInsuficientes) {
    return (
      <>
        {CABECALHO}
        <div className="card saude-card">
          <p className="saude-classe" style={{ color: "var(--blue)", margin: 0 }}>Montando sua nota</p>
          <p className="saude-sub" style={{ marginTop: 6 }}>
            Falta{saude.faltando.length === 1 ? "" : "m"} {saude.faltando.length} informaç{saude.faltando.length === 1 ? "ão" : "ões"} para mostrar uma avaliação confiável.
          </p>
          <ul className="saude-faltam">
            {saude.faltando.map((f) => (
              <li key={f}>{FALTA_TEXTO[f] ?? f}</li>
            ))}
          </ul>
          {saude.pesoDivida && (
            <p className="saude-nota-divida">
              Dívidas cadastradas: <strong>{fmtValor(saude.pesoDivida.totalDevido)}</strong>
              {saude.pesoDivida.percentualDaRendaAnual != null ? ` — ${saude.pesoDivida.percentualDaRendaAnual}% da sua renda anual.` : "."}
            </p>
          )}
          <p className="saude-proximo">
            <strong>Próximo passo:</strong> {saude.proximoPasso}
          </p>
        </div>
      </>
    );
  }

  const cor = COR_CLASSIFICACAO[saude.classificacao];

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
            <p className="saude-sub">{SUBTITULO[saude.classificacao]}</p>
          </div>
        </div>

        <div className="saude-grafico saude-grafico-5" role="img" aria-label={`Pontuação por critério: ${saude.componentes.map((c) => `${c.nome} ${Math.round(c.pontos)} de ${c.pontosMaximos}`).join(", ")}`}>
          {saude.componentes.map((comp, i) => {
            const pct = comp.pontosMaximos > 0 ? Math.max(0, Math.min(comp.pontos / comp.pontosMaximos, 1)) : 0;
            const tom = pct >= 0.7 ? "bom" : pct >= 0.4 ? "medio" : "ruim";
            return (
              <div key={comp.nome} className="saude-col">
                <span className="saude-val">{Math.round(comp.pontos)}<small>/{comp.pontosMaximos}</small></span>
                <span className="saude-trilho">
                  <span className={`saude-barra ${tom}`} style={{ "--h": `${Math.max(pct * 100, 5)}%`, "--i": i } as React.CSSProperties} />
                </span>
                <span className="saude-rot">{comp.nome}</span>
              </div>
            );
          })}
        </div>

        <p className="saude-proximo">
          <strong>Próximo passo:</strong> {saude.proximoPasso}
        </p>

        <details className="saude-como">
          <summary>Como essa nota é calculada</summary>
          <ul>
            {EXPLICACAO.map((e) => (
              <li key={e.nome}>
                <strong>{e.nome}:</strong> {e.texto}
              </li>
            ))}
          </ul>
        </details>

        {saude.razoes.length > 0 && (
          <ul className="saude-razoes">
            {saude.razoes.map((razao, i) => (
              <li key={i} className={`saude-razao ${razao.tipo}`}>
                <span className="saude-razao-icone" aria-hidden="true">
                  {razao.tipo === "positiva" ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  ) : razao.tipo === "negativa" ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7v6" /><path d="M12 17h.01" /></svg>
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
