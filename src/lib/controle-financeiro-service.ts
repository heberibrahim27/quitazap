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

async function upsertCartao(clienteId: string, nome: string) {
  return prisma.cartao.upsert({
    where: { clienteId_nome: { clienteId, nome } },
    update: {},
    create: { clienteId, nome },
  });
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
        cartaoId = (await upsertCartao(clienteId, item.cartaoNome)).id;
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

// Espelha corrigirOrigemUltimoGastoControle: quando o cliente corrige um
// gasto recém-confirmado ("na verdade foi no Nubank"), a função pura só
// atualiza o JSON da conversa — o Lancamento já criado antes fica com o
// tipo/cartão antigo. Como o módulo puro não tem o id do Lancamento (ele
// nem existe ainda no momento em que o gasto é confirmado, porque a
// gravação roda depois da resposta via after()), a correção aqui localiza
// o lançamento pelo par descrição+valor do "último gasto" (guardado no
// estado antes da correção), mais recente, dentro de uma janela de 24h —
// tempo de sobra pra cobrir qualquer correção feita na mesma conversa, sem
// risco de acertar um lançamento antigo por coincidência de descrição.
//
// Tenta 1x, e se não achar, espera meio segundo e tenta de novo — cobre o
// caso raro de o cliente mandar a correção tão rápido que o after() do
// gasto original ainda não terminou de gravar o Lancamento (ambos os
// after() são assíncronos e não há garantia de ordem entre requisições
// diferentes).
export async function corrigirOrigemLancamentoControle(
  clienteId: string | null | undefined,
  gastoAnterior: { descricao: string; valor: number } | undefined,
  novoCartaoNome: string | undefined
): Promise<void> {
  if (!clienteId || !gastoAnterior || !novoCartaoNome) return;

  try {
    const limite = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const buscar = () =>
      prisma.lancamento.findFirst({
        where: {
          clienteId,
          descricao: gastoAnterior.descricao,
          valor: gastoAnterior.valor,
          tipo: { in: ["DESPESA_VARIAVEL", "COMPRA_CARTAO"] },
          criadoEm: { gte: limite },
        },
        orderBy: { criadoEm: "desc" },
      });

    let lancamento = await buscar();
    if (!lancamento) {
      await esperar(500);
      lancamento = await buscar();
    }
    if (!lancamento) return;

    const cartao = await upsertCartao(clienteId, novoCartaoNome);

    await prisma.lancamento.update({
      where: { id: lancamento.id },
      data: { tipo: "COMPRA_CARTAO", cartaoId: cartao.id },
    });
  } catch (err) {
    console.error("[CONTROLE-FINANCEIRO] Erro ao corrigir origem do lançamento:", err);
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
