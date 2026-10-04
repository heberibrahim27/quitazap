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

  // Fatura fechada que o usuário informou ("fechou em R$ 1.200"): a mais
  // recente de cada cartão, só se for dos últimos 45 dias.
  const fechadas = cartoes.length
    ? await prisma.lancamento.findMany({
        where: {
          clienteId,
          tipo: "FATURA_FECHADA",
          cartaoId: { in: cartoes.map((c) => c.id) },
          criadoEm: { gte: new Date(agora.getTime() - 45 * 86_400_000) },
        },
        orderBy: { criadoEm: "desc" },
        select: { cartaoId: true, valor: true, criadoEm: true },
      })
    : [];
  const dataCurta = (d: Date) =>
    new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);

  const resumos = cartoes.map((c) => {
    const resumo = resumirFaturasDoCartao(
      { nome: c.nome, diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento },
      compras.filter((l) => l.cartaoId === c.id),
      agora
    );
    const fechada = fechadas.find((l) => l.cartaoId === c.id);
    if (fechada) resumo.faturaFechadaInformada = { valor: fechada.valor, data: dataCurta(fechada.criadoEm) };
    return resumo;
  });

  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" }).format(agora);
  return formatarRespostaFaturas(resumos, nomeMes);
}
