"use client";

import { useState } from "react";

export type BoletoDado = {
  tipo: "boleto_detectado";
  beneficiario: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  linhaDigitavel: string | null;
};

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
}

/**
 * Card de confirmação do "Boleto Inteligente" (PDF de boleto). A leitura por IA pode
 * errar valor ou data, então nada vira compromisso antes do cliente confirmar aqui
 * (ver /api/minha-conta/boleto/confirmar).
 */
export function BoletoCard({
  dado,
  onResolvido,
}: {
  dado: BoletoDado;
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
      const res = await fetch("/api/minha-conta/boleto/confirmar", {
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
      <p className="mc-comprovante-titulo">📄 Encontrei um boleto</p>
      <div className="mc-comprovante-topo">
        <span>
          <strong>{dado.beneficiario}</strong>
          <br />
          <small>vence em {fmtData(dado.vencimento)}</small>
        </span>
        <span className="mc-comprovante-valor">{fmtValor(dado.valor)}</span>
      </div>
      {dado.linhaDigitavel && (
        <p>
          <small>Linha digitável: {dado.linhaDigitavel}</small>
        </p>
      )}
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
