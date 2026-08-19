// ─────────────────────────────────────────
// QuitaZAP Controle — Persistência relacional do fluxo financeiro
// controle-financeiro-flow.ts é lógica pura (sem Prisma), igual
// tarefa-flow.ts; este módulo é o equivalente do tarefa-service.ts pra ele.
//
// Roda DEPOIS que o fluxo já decidiu o que responder e já gravou o JSON de
// conversa em BotSessao.dividasTemp (que continua sendo a fonte de verdade
// pro bot conversar) — aqui só espelhamos o lançamento confirmado em
// Lancamento/Cartao pra alimentar o dashboard "Minha Conta". Qualquer erro
// aqui é só logado: nunca pode derrubar a resposta que o cliente já recebeu.
// ─────────────────────────────────────────

import { prisma } from "./prisma";
import type { ItemParaPersistirControle, CartaoParaPersistirControle } from "./controle-financeiro-flow";

export type OrigemLancamentoControle = "TEXTO" | "AUDIO" | "FOTO";

export async function persistirLancamentosControle(
  clienteId: string | null | undefined,
  itens: ItemParaPersistirControle[] | undefined,
  origem: OrigemLancamentoControle
): Promise<void> {
  if (!clienteId || !itens || itens.length === 0) return;

  try {
    for (const item of itens) {
      let cartaoId: string | undefined;
      if (item.cartaoNome) {
        const cartao = await prisma.cartao.upsert({
          where: { clienteId_nome: { clienteId, nome: item.cartaoNome } },
          update: {},
          create: { clienteId, nome: item.cartaoNome },
        });
        cartaoId = cartao.id;
      }

      await prisma.lancamento.create({
        data: {
          clienteId,
          tipo: item.tipo,
          descricao: item.descricao,
          categoria: item.categoria ?? null,
          valor: item.valor,
          data: item.data ?? new Date(),
          recorrente: item.recorrente,
          cartaoId,
          origem,
        },
      });
    }
  } catch (err) {
    console.error("[CONTROLE-FINANCEIRO] Erro ao persistir lançamento(s) em Lancamento:", err);
  }
}

export async function persistirCartaoControle(
  clienteId: string | null | undefined,
  cartao: CartaoParaPersistirControle | undefined
): Promise<void> {
  if (!clienteId || !cartao) return;

  try {
    await prisma.cartao.upsert({
      where: { clienteId_nome: { clienteId, nome: cartao.nome } },
      update: {
        ...(cartao.fechamento != null ? { diaFechamento: cartao.fechamento } : {}),
        ...(cartao.vencimento != null ? { diaVencimento: cartao.vencimento } : {}),
      },
      create: {
        clienteId,
        nome: cartao.nome,
        diaFechamento: cartao.fechamento ?? null,
        diaVencimento: cartao.vencimento ?? null,
      },
    });
  } catch (err) {
    console.error("[CONTROLE-FINANCEIRO] Erro ao persistir cartão:", err);
  }
}
