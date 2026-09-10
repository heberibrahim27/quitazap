"use client";

import { useState } from "react";

export type ComprovanteDado = { tipo: "comprovante_detectado"; loja: string; valor: number };

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Card de confirmação do "Comprovante Inteligente" (foto de recibo) — a
 * extração por IA pode ler valor errado (borrão, CNPJ confundido com
 * valor etc.), então nunca lança sozinha: só depois do cliente confirmar
 * aqui é que o gasto vira Lancamento de verdade (ver
 * /api/minha-conta/comprovante/confirmar).
 */
export function ComprovanteCard({
  dado,
  onResolvido,
}: {
  dado: ComprovanteDado;
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
      const res = await fetch("/api/minha-conta/comprovante/confirmar", {
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

  if (resolvido) return null; // a resposta já virou uma mensagem nova na lista

  return (
    <div className="mc-comprovante-card">
      <p className="mc-comprovante-titulo">📷 Encontrei essa compra na foto</p>
      <div className="mc-comprovante-topo">
        <strong>{dado.loja}</strong>
        <span className="mc-comprovante-valor">{fmtValor(dado.valor)}</span>
      </div>
      {erro && <p className="mc-lancamento-card-erro">{erro}</p>}
      <div className="mc-lancamento-card-acoes">
        <button type="button" onClick={() => responder("confirmar")} disabled={resolvendo !== null}>
          {resolvendo === "confirmar" ? "Confirmando..." : "Confirmar"}
        </button>
        <button type="button" onClick={() => responder("negar")} disabled={resolvendo !== null}>
          {resolvendo === "negar" ? "..." : "Não é isso"}
        </button>
      </div>
    </div>
  );
}
