// Prévia de fatura no CHAT NATIVO (print ou arquivo): guarda o pendente em
// BotSessao.faturaCartaoPendente e devolve o card pra o cliente conferir.
// Nada é gravado em Lancamento/Divida aqui — só depois do "Salvar no Controle"
// (ver /api/minha-conta/fatura/confirmar).

import { prisma } from "@/lib/prisma";
import { obterOuCriarSessaoControle } from "@/lib/controle-orquestrador";
import { faturaTemNovidade, totalNaoBate, type FaturaCartaoPendente } from "@/lib/fatura-cartao-flow";

type ClienteChat = Parameters<typeof obterOuCriarSessaoControle>[0];

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function responderNoChat(clienteId: string, texto: string, dadosEstruturados?: unknown) {
  await prisma.mensagemChat.create({
    data: { clienteId, canal: "APP", direcao: "BOT", texto, dadosEstruturados: dadosEstruturados as object | undefined },
  });
  return { resposta: texto, dadosEstruturados };
}

export async function registrarPreviaFaturaNoChat(
  cliente: ClienteChat,
  pendente: FaturaCartaoPendente
): Promise<{ resposta: string; dadosEstruturados?: unknown }> {
  // No chat, compra "parecida" com uma já cadastrada fica de fora (nunca
  // duplica); o cliente lança à parte por texto se for realmente outra.
  const parecidas = pendente.filaAmbiguos.length;
  const lote = { ...pendente, filaAmbiguos: [], indice: 0 };

  if (!faturaTemNovidade(lote)) {
    const ja = lote.jaCadastradas + parecidas + (lote.comprasJaRegistradas ?? 0);
    return responderNoChat(
      cliente.id,
      ja > 0
        ? `📄 Li a fatura ${lote.cartaoNome} — as ${ja} compra(s) já estavam no seu Controle, não lancei de novo.`
        : `📄 Li a fatura ${lote.cartaoNome}, mas não encontrei nenhuma compra pra lançar.`
    );
  }

  const sessao = await obterOuCriarSessaoControle(cliente);
  await prisma.botSessao.updateMany({
    where: { id: sessao.id },
    data: { faturaCartaoPendente: lote as unknown as object },
  });

  const venc = new Date(`${lote.vencimentoFatura}T12:00:00`);
  const proxima = new Date(venc);
  proxima.setMonth(proxima.getMonth() + 1);
  const dadosEstruturados = {
    tipo: "fatura_detectada" as const,
    cartao: lote.cartaoNome,
    vencimento: lote.vencimentoFatura,
    proximaParcela: proxima.toISOString().slice(0, 10),
    vencimentoEstimado: lote.vencimentoEstimado ?? false,
    avisoTotal: totalNaoBate(lote) ? { totalImpresso: lote.totalImpresso, somaLida: lote.somaLida } : null,
    ignoradas: lote.jaCadastradas + parecidas + (lote.comprasJaRegistradas ?? 0),
    compras: (lote.compras ?? []).map((c) => ({ descricao: c.descricao, valor: c.valor, data: c.data })),
    itens: lote.confirmados.map((i) => ({
      descricao: i.descricao,
      parcelaAtual: i.parcelaAtual,
      totalParcelas: i.totalParcelas,
      valorParcela: i.valorParcela,
      dataCompra: i.dataCompra ?? null,
    })),
  };
  const nCompras = lote.compras?.length ?? 0;
  const totalCompras = (lote.compras ?? []).reduce((s, c) => s + c.valor, 0);
  return responderNoChat(
    cliente.id,
    `Li a fatura ${lote.cartaoNome}: ${nCompras} gasto(s) no cartão (${fmt(totalCompras)}) e ${lote.confirmados.length} compra(s) parcelada(s) com parcelas futuras. Confere e confirma?`,
    dadosEstruturados
  );
}
