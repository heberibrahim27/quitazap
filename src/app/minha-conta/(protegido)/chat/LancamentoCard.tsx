"use client";

import { useEffect, useState } from "react";

export type LancamentoCardDado = {
  id: string;
  tipo: string;
  descricao: string;
  categoria: string | null;
  valor: number;
  data: string;
  atualizadoEm: string;
};

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

type Modo = "ver" | "editar" | "dividir" | "confirmarDesfazer";

/**
 * Card editável/divisível/desfazível — Fase 3 (docs/chat-nativo-arquitetura.md).
 * Cada operação chama a rota correspondente, que grava auditoria + checa
 * dependência/concorrência no servidor. Este componente só reflete o
 * resultado — a regra de negócio nunca vive aqui.
 */
export function LancamentoCard({ dado }: { dado: LancamentoCardDado }) {
  const [item, setItem] = useState(dado);
  const [modo, setModo] = useState<Modo>("ver");
  const [editado, setEditado] = useState(false);
  const [motivoRemocao, setMotivoRemocao] = useState<"desfeito" | "dividido" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [descricaoEdit, setDescricaoEdit] = useState(dado.descricao);
  const [categoriaEdit, setCategoriaEdit] = useState(dado.categoria ?? "");
  const [valorEdit, setValorEdit] = useState(String(dado.valor));

  const [partes, setPartes] = useState([
    { descricao: "", valor: "" },
    { descricao: "", valor: "" },
  ]);

  // Revalida contra o estado atual ao montar — o `dado` recebido é o
  // snapshot congelado no momento em que a mensagem foi criada (persistido
  // em MensagemChat.dadosEstruturados) e nunca é atualizado sozinho depois
  // disso. Sem isso, um lançamento editado/dividido/desfeito por QUALQUER
  // canal depois de a mensagem já existir continuava aparecendo como se
  // nada tivesse mudado ao recarregar a conversa (achado real do Ibrahim
  // em produção, 2026-09-10 — o dado real sempre esteve certo, só essa
  // renderização congelada mentia).
  useEffect(() => {
    let cancelado = false;
    fetch(`/api/minha-conta/lancamento/${dado.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        if (!d.existe) {
          setMotivoRemocao("desfeito");
          return;
        }
        const atual = d.lancamento;
        if (atual.substituidoPorDivisao) {
          setMotivoRemocao("dividido");
          return;
        }
        const mudou =
          atual.descricao !== dado.descricao ||
          atual.categoria !== dado.categoria ||
          atual.valor !== dado.valor ||
          atual.data !== dado.data;
        if (mudou) {
          setItem({
            id: atual.id,
            tipo: atual.tipo,
            descricao: atual.descricao,
            categoria: atual.categoria,
            valor: atual.valor,
            data: atual.data,
            atualizadoEm: atual.atualizadoEm,
          });
          setDescricaoEdit(atual.descricao);
          setCategoriaEdit(atual.categoria ?? "");
          setValorEdit(String(atual.valor));
          setEditado(true);
        } else {
          // Mesmo sem mudança visível, sincroniza atualizadoEm com o
          // servidor — garante que a concorrência otimista da próxima
          // edição compara contra o valor real, não contra o congelado.
          setItem((atualItem) => ({ ...atualItem, atualizadoEm: atual.atualizadoEm }));
        }
      })
      .catch(() => {});
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dado.id]);

  async function salvarEdicao() {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/minha-conta/lancamento/${item.id}/editar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atualizadoEmVisto: item.atualizadoEm,
          descricao: descricaoEdit,
          categoria: categoriaEdit || null,
          valor: parseFloat(valorEdit.replace(",", ".")),
        }),
      });
      const dados = await res.json();
      if (!res.ok || !dados.ok) {
        setErro(dados.erro ?? "Não consegui salvar a edição.");
        return;
      }
      setItem({
        ...item,
        descricao: dados.lancamento.descricao,
        categoria: dados.lancamento.categoria,
        valor: dados.lancamento.valor,
        atualizadoEm: dados.lancamento.atualizadoEm,
      });
      setEditado(true);
      setModo("ver");
    } catch {
      setErro("Sem conexão agora. Tenta de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarDivisao() {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/minha-conta/lancamento/${item.id}/dividir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partes: partes
            .filter((p) => p.descricao.trim() && p.valor.trim())
            .map((p) => ({ descricao: p.descricao, valor: parseFloat(p.valor.replace(",", ".")) })),
        }),
      });
      const dados = await res.json();
      if (!res.ok || !dados.ok) {
        setErro(dados.erro ?? "Não consegui dividir esse lançamento.");
        return;
      }
      setMotivoRemocao("dividido"); // o original saiu das somas
      setModo("ver");
    } catch {
      setErro("Sem conexão agora. Tenta de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarDesfazer() {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/minha-conta/lancamento/${item.id}/desfazer`, { method: "POST" });
      const dados = await res.json();
      if (!res.ok || !dados.ok) {
        setErro(dados.erro ?? "Não consegui desfazer esse lançamento.");
        setModo("ver");
        return;
      }
      setMotivoRemocao("desfeito");
    } catch {
      setErro("Sem conexão agora. Tenta de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  if (motivoRemocao) {
    return (
      <div className="mc-lancamento-card mc-lancamento-card-removido">
        <span>{item.descricao} — {fmtValor(item.valor)}</span>
        <span className="mc-lancamento-card-badge">{motivoRemocao === "desfeito" ? "Desfeito" : "Dividido"}</span>
      </div>
    );
  }

  return (
    <div className="mc-lancamento-card">
      <div className="mc-lancamento-card-topo">
        <div>
          <strong>{item.descricao}</strong>
          <span className="mc-lancamento-card-meta">
            {item.categoria ?? "Sem categoria"} · {fmtData(item.data)}
            {editado && <span className="mc-lancamento-card-badge">Editado</span>}
          </span>
        </div>
        <span className="mc-lancamento-card-valor">{fmtValor(item.valor)}</span>
      </div>

      {erro && <p className="mc-lancamento-card-erro">{erro}</p>}

      {modo === "ver" && (
        <div className="mc-lancamento-card-acoes">
          <button type="button" onClick={() => setModo("editar")}>Editar</button>
          <button type="button" onClick={() => setModo("dividir")}>Dividir</button>
          <button type="button" onClick={() => setModo("confirmarDesfazer")}>Desfazer</button>
        </div>
      )}

      {modo === "editar" && (
        <div className="mc-lancamento-card-form">
          <input className="mc-input" value={descricaoEdit} onChange={(e) => setDescricaoEdit(e.target.value)} placeholder="Descrição" />
          <input className="mc-input" value={categoriaEdit} onChange={(e) => setCategoriaEdit(e.target.value)} placeholder="Categoria" />
          <input className="mc-input" value={valorEdit} onChange={(e) => setValorEdit(e.target.value)} inputMode="decimal" placeholder="Valor" />
          <div className="mc-lancamento-card-acoes">
            <button type="button" onClick={salvarEdicao} disabled={enviando}>{enviando ? "Salvando..." : "Salvar"}</button>
            <button type="button" onClick={() => setModo("ver")}>Cancelar</button>
          </div>
        </div>
      )}

      {modo === "dividir" && (
        <div className="mc-lancamento-card-form">
          {partes.map((p, i) => (
            <div key={i} className="mc-lancamento-card-parte">
              <input
                className="mc-input"
                value={p.descricao}
                onChange={(e) => setPartes((atual) => atual.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))}
                placeholder={`Parte ${i + 1} — descrição`}
              />
              <input
                className="mc-input"
                value={p.valor}
                onChange={(e) => setPartes((atual) => atual.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                inputMode="decimal"
                placeholder="Valor"
              />
            </div>
          ))}
          <button type="button" onClick={() => setPartes((atual) => [...atual, { descricao: "", valor: "" }])}>
            + Mais uma parte
          </button>
          <p className="mc-lancamento-card-meta">Soma das partes precisa bater exato com {fmtValor(item.valor)}.</p>
          <div className="mc-lancamento-card-acoes">
            <button type="button" onClick={confirmarDivisao} disabled={enviando}>{enviando ? "Dividindo..." : "Confirmar divisão"}</button>
            <button type="button" onClick={() => setModo("ver")}>Cancelar</button>
          </div>
        </div>
      )}

      {modo === "confirmarDesfazer" && (
        <div className="mc-lancamento-card-acoes">
          <span className="mc-lancamento-card-meta">Tem certeza que quer desfazer esse lançamento?</span>
          <button type="button" onClick={confirmarDesfazer} disabled={enviando}>{enviando ? "Desfazendo..." : "Sim, desfazer"}</button>
          <button type="button" onClick={() => setModo("ver")}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
