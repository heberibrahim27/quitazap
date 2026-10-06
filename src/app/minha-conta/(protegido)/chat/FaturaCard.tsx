"use client";

import { useState } from "react";

export type FaturaDado = {
  tipo: "fatura_detectada";
  cartao: string;
  vencimento: string; // YYYY-MM-DD
  proximaParcela: string; // YYYY-MM-DD
  ignoradas: number;
  itens: {
    descricao: string;
    parcelaAtual: number;
    totalParcelas: number;
    valorParcela: number;
    dataCompra: string | null;
  }[];
};

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
}

function fmtMes(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
}

/**
 * Card de confirmação da "Fatura Inteligente" (print da fatura do cartão).
 * Nada é gravado antes do cliente confirmar aqui (ver
 * /api/minha-conta/fatura/confirmar).
 */
export function FaturaCard({
  dado,
  onResolvido,
}: {
  dado: FaturaDado;
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
      const res = await fetch("/api/minha-conta/fatura/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
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

  return (
    <div className="mc-comprovante-card">
      <p className="mc-comprovante-titulo">
        💳 Fatura {dado.cartao} — vence {fmtData(dado.vencimento)}
      </p>
      {dado.itens.map((i, idx) => (
        <div key={idx} className="mc-comprovante-topo">
          <span>
            <strong>{i.descricao}</strong>
            <br />
            <small>
              parcela {i.parcelaAtual} de {i.totalParcelas}
              {i.dataCompra ? ` · compra em ${fmtData(i.dataCompra)}` : ""}
            </small>
          </span>
          <span className="mc-comprovante-valor">{fmtValor(i.valorParcela)}</span>
        </div>
      ))}
      <p>
        <small>
          Próximas parcelas a partir de {fmtMes(dado.proximaParcela)}.
          {dado.ignoradas > 0 ? ` ${dado.ignoradas} compra(s) já cadastrada(s) ficaram de fora, sem duplicar.` : ""}
        </small>
      </p>
      {erro && <p className="mc-lancamento-card-erro">{erro}</p>}
      <div className="mc-lancamento-card-acoes">
        <button type="button" onClick={() => responder("confirmar")} disabled={resolvendo !== null}>
          {resolvendo === "confirmar" ? "Salvando..." : "Salvar no Controle"}
        </button>
        <button type="button" onClick={() => responder("negar")} disabled={resolvendo !== null}>
          {resolvendo === "negar" ? "..." : "Não salvar"}
        </button>
      </div>
    </div>
  );
}
