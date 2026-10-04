// ─────────────────────────────────────────
// QuitaZAP Controle — resposta de "como está minha fatura?" (chat/WhatsApp)
// ─────────────────────────────────────────
// Lê os cartões e as compras DIRETO do banco (mesma fonte da tela de
// Cartões) e usa o ciclo de fechamento de cada cartão. Antes, "meus
// cartões" respondia com o estado antigo guardado na conversa: só listava
// cartões configurados pelo chat e sempre mostrava fatura R$ 0,00.

import { prisma } from "@/lib/prisma";
import { anoMesAtualBrasil, limitesDoMes } from "./motor";
import { deslocarMes, formatarRespostaFaturas, resumirFaturasDoCartao } from "./fatura-cartao";

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export async function responderConsultaFatura(clienteId: string, mensagem: string, agora: Date = new Date()): Promise<string> {
  const todos = await prisma.cartao.findMany({ where: { clienteId }, orderBy: { nome: "asc" } });

  // "fatura do nubank" → só o Nubank; sem nome de cartão → todos.
  const textoNorm = normalizar(mensagem);
  const citados = todos.filter((c) => {
    const nome = normalizar(c.nome);
    return textoNorm.includes(nome) || nome.split(/\s+/).some((p) => p.length >= 4 && textoNorm.includes(p));
  });
  const cartoes = citados.length > 0 ? citados : todos;

  const { ano, mes } = anoMesAtualBrasil(agora);
  const ini = deslocarMes(ano, mes, -3);
  const fim = deslocarMes(ano, mes, 3);
  const compras = cartoes.length
    ? await prisma.lancamento.findMany({
        where: {
          clienteId,
          tipo: "COMPRA_CARTAO",
          cartaoId: { in: cartoes.map((c) => c.id) },
          data: { gte: limitesDoMes(ini.ano, ini.mes).inicio, lt: limitesDoMes(fim.ano, fim.mes).fim },
        },
        select: { cartaoId: true, valor: true, data: true },
      })
    : [];

  const resumos = cartoes.map((c) =>
    resumirFaturasDoCartao(
      { nome: c.nome, diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento },
      compras.filter((l) => l.cartaoId === c.id),
      agora
    )
  );

  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" }).format(agora);
  return formatarRespostaFaturas(resumos, nomeMes);
}
