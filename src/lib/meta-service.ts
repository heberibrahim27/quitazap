// ─────────────────────────────────────────
// QuitaZAP — Metas (cofrinho): núcleo tipado
// ─────────────────────────────────────────
// Extraído de minha-conta/metas/metas-actions.ts (que só tinha versão
// FormData, web-only) pra virar reaproveitável — o rescue parser do
// WhatsApp (financeiro-intent-resolver.ts, via salvarItensConfirmadosIA)
// cria/deposita numa meta pelo mesmo caminho, preservando o mesmo
// invariante: todo depósito/saque tem que espelhar um Lancamento
// (categoria "Metas"), senão o "Disponível" do app inteiro dessincroniza.

import { prisma } from "./prisma";

export type ResultadoMeta = { ok: true; metaId: string } | { ok: false; erro: string };
export type ResultadoDepositoMeta = { ok: true } | { ok: false; erro: string };
export type OrigemLancamentoMeta = "WEB" | "TEXTO" | "AUDIO" | "FOTO";

export async function criarMetaTyped(clienteId: string, nome: string, valorAlvo: number): Promise<ResultadoMeta> {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return { ok: false, erro: "Preciso do nome da meta." };
  if (!Number.isFinite(valorAlvo) || valorAlvo <= 0) return { ok: false, erro: "Valor da meta inválido." };

  const meta = await prisma.meta.create({ data: { clienteId, nome: nomeLimpo, valorAlvo } });
  return { ok: true, metaId: meta.id };
}

/** Resolve o nome de uma meta existente do cliente por correspondência
 * aproximada (case/acento-insensível) — usado quando o rescue parser só
 * tem o nome dito pelo cliente ("quero guardar mais 100 pra viagem"), não
 * o id. Retorna null se não achar exatamente uma. */
export async function encontrarMetaPorNome(clienteId: string, nomeAproximado: string) {
  const metas = await prisma.meta.findMany({ where: { clienteId } });
  const normalizar = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const alvo = normalizar(nomeAproximado);
  const encontradas = metas.filter((m) => normalizar(m.nome).includes(alvo) || alvo.includes(normalizar(m.nome)));
  return encontradas.length === 1 ? encontradas[0] : null;
}

export async function criarDepositoTyped(
  clienteId: string,
  metaId: string,
  valor: number,
  origem: OrigemLancamentoMeta = "WEB"
): Promise<ResultadoDepositoMeta> {
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: "Valor inválido." };

  const meta = await prisma.meta.findUnique({ where: { id: metaId } });
  if (!meta || meta.clienteId !== clienteId) return { ok: false, erro: "Meta não encontrada." };

  await prisma.$transaction(async (tx) => {
    const lancamento = await tx.lancamento.create({
      data: {
        clienteId,
        tipo: "DESPESA_VARIAVEL",
        descricao: `Depósito: ${meta.nome}`,
        categoria: "Metas",
        valor,
        data: new Date(),
        origem,
      },
    });
    await tx.depositoMeta.create({ data: { metaId, valor, lancamentoId: lancamento.id } });
  });

  return { ok: true };
}

export async function criarSaqueTyped(
  clienteId: string,
  metaId: string,
  valor: number,
  origem: OrigemLancamentoMeta = "WEB"
): Promise<ResultadoDepositoMeta> {
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: "Valor inválido." };

  const meta = await prisma.meta.findUnique({ where: { id: metaId }, include: { depositos: true } });
  if (!meta || meta.clienteId !== clienteId) return { ok: false, erro: "Meta não encontrada." };

  const guardado = meta.depositos.reduce((soma, d) => soma + d.valor, 0);
  if (valor > guardado) {
    return { ok: false, erro: `Só tem ${guardado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} guardado nessa meta.` };
  }

  await prisma.$transaction(async (tx) => {
    const lancamento = await tx.lancamento.create({
      data: {
        clienteId,
        tipo: "RECEITA",
        descricao: `Saque: ${meta.nome}`,
        categoria: "Metas",
        valor,
        data: new Date(),
        origem,
      },
    });
    await tx.depositoMeta.create({ data: { metaId, valor: -valor, lancamentoId: lancamento.id } });
  });

  return { ok: true };
}
