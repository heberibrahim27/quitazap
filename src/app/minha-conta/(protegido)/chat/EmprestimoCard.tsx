"use client";

import { useState } from "react";

export type EmprestimoDado = {
  tipo: "emprestimo_detectado";
  mensagemId: string;
  resolvido: boolean;
  credor: string;
  totalParcelas: number;
  valorParcela: number;
  primeiraData: string; // YYYY-MM-DD
  parcelasPagas: number;
  valorRestanteImpresso?: number;
};

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
}

/**
 * Card de confirmação do "Empréstimo por print". A leitura por IA pode errar parcela ou
 * data, então nada é lançado antes do cliente confirmar aqui
 * (ver /api/minha-conta/emprestimo/confirmar).
 */
export function EmprestimoCard({
  dado,
  onResolvido,
}: {
  dado: EmprestimoDado;
  onResolvido: (resultado: { resposta: string; dadosEstruturados?: unknown }) => void;
}) {
  const [resolvendo, setResolvendo] = useState<"confirmar" | "negar" | null>(null);
  const [resolvido, setResolvido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function responder(acao: "confirmar" | "negar") {
    if (resolvendo || resolvido) return;
    setResolvendo(acao);
    setErro(null);
    try {
      const res = await fetch("/api/minha-conta/emprestimo/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, mensagemId: dado.mensagemId }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setErro(dados.error ?? "Não consegui processar agora.");
        return;
      }
      setResolvido(true);
      onResolvido(dados);
    } catch {
      setErro("Sem conexão agora. Tenta de novo em instantes.");
    } finally {
      setResolvendo(null);
    }
  }

  if (resolvido) return null;

  const restantes = dado.totalParcelas - dado.parcelasPagas;
  return (
    <div className="mc-comprovante-card">
      <p className="mc-comprovante-titulo">🏦 Encontrei um empréstimo</p>
      <div className="mc-comprovante-topo">
        <span>
          <strong>{dado.credor}</strong>
          <br />
          <small>
            {dado.totalParcelas}x · {dado.parcelasPagas} paga(s) · faltam {restantes}
          </small>
        </span>
        <span className="mc-comprovante-valor">{fmtValor(dado.valorParcela)}</span>
      </div>
      <p>
        <small>
          1ª parcela em {fmtData(dado.primeiraData)}.
          {dado.valorRestanteImpresso ? ` Valor restante na tela: ${fmtValor(dado.valorRestanteImpresso)}.` : ""}
        </small>
      </p>
      {erro && <p className="mc-lancamento-card-erro">{erro}</p>}
      <div className="mc-lancamento-card-acoes">
        <button type="button" onClick={() => responder("confirmar")} disabled={resolvendo !== null}>
          {resolvendo === "confirmar" ? "Salvando..." : "Lançar empréstimo"}
        </button>
        <button type="button" onClick={() => responder("negar")} disabled={resolvendo !== null}>
          {resolvendo === "negar" ? "..." : "Não lançar"}
        </button>
      </div>
    </div>
  );
}
