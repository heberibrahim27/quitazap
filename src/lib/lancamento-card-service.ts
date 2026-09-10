// ─────────────────────────────────────────
// QuitaZAP — Card de lançamento do chat nativo: editar / dividir / desfazer
// Ver docs/chat-nativo-arquitetura.md — regras vindas de revisão técnica
// (ChatGPT), aplicadas aqui:
//
// - Edição vale na data financeira do lançamento (corrige o passado) —
//   como o motor financeiro sempre lê os dados ao vivo (nunca acumula um
//   total separado), editar o Lancamento já é suficiente pra saldo/
//   gráfico/combinado refletirem a mudança automaticamente, sem job de
//   recálculo.
// - NUNCA reescreve silenciosamente: toda edição/divisão/desfazer grava
//   um registro de auditoria na MESMA transação da mudança.
// - Versionamento otimista via `atualizadoEm`: quem edita manda de volta
//   o atualizadoEm que viu no card; se não bater mais, a edição é
//   recusada (conflito — outro canal editou primeiro) em vez de
//   sobrescrever às cegas. Resolve a corrida WhatsApp × chat nativo.
// - Dividir: preserva o valor total exato (com centavos); o lançamento
//   original nunca é apagado, só marcado substituidoPorDivisao — pai e
//   filhos nunca somam juntos em lugar nenhum.
// - Desfazer: checa dependência (DepositoMeta ligado, ou já foi dividido)
//   antes de apagar — nunca remove um registro já conciliado/vinculado a
//   um aporte de meta confirmado.
// ─────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { Lancamento } from "@prisma/client";

export type CanalOperacao = "WHATSAPP" | "APP";

type ResultadoOperacao<T> = { ok: true; dado: T } | { ok: false; erro: string };

function snapshotLancamento(l: Lancamento) {
  return {
    id: l.id,
    tipo: l.tipo,
    descricao: l.descricao,
    categoria: l.categoria,
    valor: l.valor,
    data: l.data,
    cartaoId: l.cartaoId,
    substituidoPorDivisao: l.substituidoPorDivisao,
  };
}

/**
 * Edita um lançamento existente. `atualizadoEmVisto` é o carimbo que o
 * cliente viu no card — se o registro mudou desde então (outra edição,
 * em qualquer canal), recusa em vez de sobrescrever.
 */
export async function editarLancamentoCard(params: {
  clienteId: string;
  lancamentoId: string;
  atualizadoEmVisto: Date;
  canal: CanalOperacao;
  mudancas: { descricao?: string; categoria?: string | null; valor?: number; data?: Date };
}): Promise<ResultadoOperacao<Lancamento>> {
  const { clienteId, lancamentoId, atualizadoEmVisto, canal, mudancas } = params;

  const atual = await prisma.lancamento.findFirst({ where: { id: lancamentoId, clienteId } });
  if (!atual) return { ok: false, erro: "Lançamento não encontrado." };
  if (atual.atualizadoEm.getTime() !== atualizadoEmVisto.getTime()) {
    return { ok: false, erro: "Esse lançamento foi editado em outro lugar. Recarregue pra ver a versão mais recente." };
  }
  if (Object.keys(mudancas).length === 0) return { ok: false, erro: "Nada pra alterar." };
  if (mudancas.valor != null && !(mudancas.valor > 0)) return { ok: false, erro: "Valor precisa ser maior que zero." };

  const [, editado] = await prisma.$transaction([
    prisma.lancamentoAuditoria.create({
      data: {
        lancamentoId,
        clienteId,
        acao: "EDICAO",
        canal,
        antes: snapshotLancamento(atual),
        depois: { ...snapshotLancamento(atual), ...mudancas },
      },
    }),
    prisma.lancamento.update({
      where: { id: lancamentoId },
      data: mudancas,
    }),
  ]);

  return { ok: true, dado: editado };
}

/**
 * Divide um lançamento em N partes. Soma das partes precisa bater EXATO
 * (com centavos) com o valor original — sem diferença tolerada, pra não
 * inventar nem perder dinheiro na divisão.
 */
export async function dividirLancamentoCard(params: {
  clienteId: string;
  lancamentoId: string;
  canal: CanalOperacao;
  partes: { descricao: string; categoria?: string | null; valor: number }[];
}): Promise<ResultadoOperacao<Lancamento[]>> {
  const { clienteId, lancamentoId, canal, partes } = params;

  if (partes.length < 2) return { ok: false, erro: "Dividir precisa de pelo menos 2 partes." };
  if (partes.some((p) => !(p.valor > 0))) return { ok: false, erro: "Toda parte precisa ter valor maior que zero." };

  const original = await prisma.lancamento.findFirst({ where: { id: lancamentoId, clienteId } });
  if (!original) return { ok: false, erro: "Lançamento não encontrado." };
  if (original.substituidoPorDivisao) return { ok: false, erro: "Esse lançamento já foi dividido antes." };

  // Soma em centavos (inteiro) pra não sofrer com imprecisão de ponto
  // flutuante — exige bater exato, sem arredondar diferença pra ninguém.
  const centavosOriginal = Math.round(original.valor * 100);
  const centavosPartes = partes.reduce((s, p) => s + Math.round(p.valor * 100), 0);
  if (centavosPartes !== centavosOriginal) {
    return {
      ok: false,
      erro: `A soma das partes (${(centavosPartes / 100).toFixed(2)}) precisa bater exatamente com o valor original (${original.valor.toFixed(2)}).`,
    };
  }

  const divisoes = await prisma.$transaction(async (tx) => {
    await tx.lancamento.update({ where: { id: original.id }, data: { substituidoPorDivisao: true } });

    const filhos: Lancamento[] = [];
    for (const parte of partes) {
      const filho = await tx.lancamento.create({
        data: {
          clienteId,
          tipo: original.tipo,
          descricao: parte.descricao,
          categoria: parte.categoria ?? original.categoria,
          valor: parte.valor,
          data: original.data,
          cartaoId: original.cartaoId,
          origem: original.origem,
          lancamentoOrigemId: original.id,
        },
      });
      filhos.push(filho);
    }

    await tx.lancamentoAuditoria.create({
      data: {
        lancamentoId: original.id,
        clienteId,
        acao: "DIVISAO",
        canal,
        antes: snapshotLancamento(original),
        depois: { divisoes: filhos.map(snapshotLancamento) },
      },
    });

    return filhos;
  });

  return { ok: true, dado: divisoes };
}

/**
 * Desfaz (apaga) um lançamento — mesmo comportamento do comando de texto
 * DESFAZER_LANCAMENTO que já existe no WhatsApp hoje. Recusa se o
 * lançamento já foi dividido (tem filhos) ou está ligado a um aporte de
 * meta confirmado (DepositoMeta) — nesses casos há dependência real que
 * apagar às cegas quebraria.
 */
export async function desfazerLancamentoCard(params: {
  clienteId: string;
  lancamentoId: string;
  canal: CanalOperacao;
}): Promise<ResultadoOperacao<{ id: string }>> {
  const { clienteId, lancamentoId, canal } = params;

  const atual = await prisma.lancamento.findFirst({
    where: { id: lancamentoId, clienteId },
    include: { divisoes: { select: { id: true } }, depositoMeta: { select: { id: true } } },
  });
  if (!atual) return { ok: false, erro: "Lançamento não encontrado." };
  if (atual.divisoes.length > 0) {
    return { ok: false, erro: "Esse lançamento já foi dividido — desfaça as partes individualmente." };
  }
  if (atual.depositoMeta) {
    return { ok: false, erro: "Esse lançamento está ligado a um aporte de meta confirmado — não dá pra desfazer direto." };
  }

  await prisma.$transaction([
    prisma.lancamentoAuditoria.create({
      data: {
        lancamentoId,
        clienteId,
        acao: "DESFAZER",
        canal,
        antes: snapshotLancamento(atual),
        depois: Prisma.JsonNull,
      },
    }),
    prisma.lancamento.delete({ where: { id: lancamentoId } }),
  ]);

  return { ok: true, dado: { id: lancamentoId } };
}
