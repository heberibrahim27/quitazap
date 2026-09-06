// ─────────────────────────────────────────
// QuitaZAP — Persistência das 4 categorias novas do rescue parser
// (dívida nova, pagamento de dívida, meta) confirmadas via
// financeiro-intent-resolver.ts + salvarItensConfirmadosIA.
// ─────────────────────────────────────────
// Roda no after() do webhook, igual controle-financeiro-service.ts — a
// resposta "✅ ..." já foi mandada pro cliente antes disso. Diferença
// importante pras 2 categorias que dependem de achar um registro já
// existente por nome (pagamento de dívida, depósito em meta): se o fuzzy
// match falhar (não achou ou achou mais de um), não dá pra só logar e
// seguir — o cliente ficaria achando que deu baixa/depositou sem ter
// acontecido. Por isso mandamos uma correção por WhatsApp nesse caso,
// puxando "não invente, sempre avise quando não tiver certeza".

import { sendWhatsApp } from "./zapi";
import { criarDividaComParcelas, encontrarDividaAtivaPorCredor } from "./divida-service";
import { marcarDividaComoPaga } from "./pagamento-divida-service";
import { criarMetaTyped, criarDepositoTyped, encontrarMetaPorNome } from "./meta-service";
import type {
  DividaParaPersistirControle,
  PagamentoDividaParaPersistirControle,
  MetaParaPersistirControle,
} from "./controle-financeiro-flow";

export async function persistirDividaConfirmadaIA(
  clienteId: string | null | undefined,
  divida: DividaParaPersistirControle | undefined
): Promise<void> {
  if (!clienteId || !divida) return;

  try {
    const resultado = await criarDividaComParcelas({
      clienteId,
      credor: divida.credor,
      totalParcelas: divida.totalParcelas,
      primeiraData: new Date(),
      valorTotal: divida.valorTotal,
      valorParcela: divida.valorParcela,
      tipo: divida.tipo,
    });
    if (!resultado.ok) console.error("[RESCUE-FINANCEIRO] Falha ao cadastrar dívida via IA:", resultado.erro);
  } catch (err) {
    console.error("[RESCUE-FINANCEIRO] Erro ao cadastrar dívida via IA:", err);
  }
}

export async function persistirPagamentoDividaConfirmadoIA(
  clienteId: string | null | undefined,
  telefone: string | undefined,
  pagamento: PagamentoDividaParaPersistirControle | undefined
): Promise<void> {
  if (!clienteId || !pagamento) return;

  try {
    const divida = await encontrarDividaAtivaPorCredor(clienteId, pagamento.credorAproximado);
    if (!divida) {
      if (telefone) {
        await sendWhatsApp(
          telefone,
          `Não achei uma dívida ativa de "${pagamento.credorAproximado}" pra dar baixa. Acesse Minha Conta > Dívidas pra registrar esse pagamento certinho.`
        );
      }
      return;
    }

    const resultado = await marcarDividaComoPaga(clienteId, divida.id, pagamento.valor);
    if (!resultado.ok && telefone) {
      await sendWhatsApp(telefone, `Não consegui registrar esse pagamento: ${resultado.erro}`);
    }
  } catch (err) {
    console.error("[RESCUE-FINANCEIRO] Erro ao registrar pagamento de dívida via IA:", err);
  }
}

export async function persistirMetaConfirmadaIA(
  clienteId: string | null | undefined,
  telefone: string | undefined,
  meta: MetaParaPersistirControle | undefined
): Promise<void> {
  if (!clienteId || !meta) return;

  try {
    if (meta.acao === "criar") {
      const resultado = await criarMetaTyped(clienteId, meta.nome, meta.valorAlvo);
      if (!resultado.ok && telefone) await sendWhatsApp(telefone, `Não consegui criar essa meta: ${resultado.erro}`);
      return;
    }

    const metaEncontrada = await encontrarMetaPorNome(clienteId, meta.nomeAproximado);
    if (!metaEncontrada) {
      if (telefone) {
        await sendWhatsApp(
          telefone,
          `Não achei uma meta chamada "${meta.nomeAproximado}" pra depositar. Acesse Minha Conta > Metas pra conferir o nome certo.`
        );
      }
      return;
    }

    const resultado = await criarDepositoTyped(clienteId, metaEncontrada.id, meta.valor, "TEXTO");
    if (!resultado.ok && telefone) await sendWhatsApp(telefone, `Não consegui registrar esse depósito: ${resultado.erro}`);
  } catch (err) {
    console.error("[RESCUE-FINANCEIRO] Erro ao processar meta via IA:", err);
  }
}
