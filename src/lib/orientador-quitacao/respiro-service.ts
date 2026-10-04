// ─────────────────────────────────────────
// Meta "Respiro" — criação (escrita determinística, a pedido do cliente)
// ─────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { criarMetaTyped } from "@/lib/meta-service";
import { calcularRespiro, brl, DIAS_RESPIRO_INICIAL } from "./motor";
import { carregarEntradaOrientacao, NOME_META_RESPIRO } from "./service";
import { arredondarAlvoRespiro } from "./respiro";

export type ResultadoCriarRespiro = { ok: true; texto: string; criada: boolean } | { ok: false; code: string; userMessage: string };

export async function criarMetaRespiro(clienteId: string, agora: Date = new Date()): Promise<ResultadoCriarRespiro> {
  const existente = await prisma.meta.findFirst({
    where: { clienteId, nome: { contains: "respiro", mode: "insensitive" } },
    include: { depositos: { select: { valor: true } } },
  });
  if (existente) {
    const guardado = existente.depositos.reduce((s, d) => s + d.valor, 0);
    return {
      ok: true,
      criada: false,
      texto: `Você já tem a meta *${existente.nome}*: ${brl(Math.max(guardado, 0))} guardados de ${brl(existente.valorAlvo)}. Para guardar mais, mande por exemplo: *guardei 100 na meta respiro*.`,
    };
  }

  const entrada = await carregarEntradaOrientacao(clienteId, agora);
  const respiro = calcularRespiro(entrada.custoDeVidaMensal, 0, false);
  if (respiro.alvo == null || respiro.alvo <= 0) {
    return {
      ok: false,
      code: "SEM_BASE",
      userMessage: "Ainda não tenho gastos suficientes registrados para calcular o seu Respiro. Registre alguns gastos do dia a dia (mercado, transporte, contas) e peça de novo.",
    };
  }

  const alvo = arredondarAlvoRespiro(respiro.alvo);
  const r = await criarMetaTyped(clienteId, NOME_META_RESPIRO, alvo);
  if (!r.ok) return { ok: false, code: "FALHOU", userMessage: r.erro };

  return {
    ok: true,
    criada: true,
    texto: [
      `✅ Criei a meta *${NOME_META_RESPIRO}* de ${brl(alvo)} (${DIAS_RESPIRO_INICIAL} dias do seu dia a dia).`,
      "É o seu colchão para um imprevisto não virar dívida de novo.",
      "Para guardar, mande por exemplo: *guardei 100 na meta respiro* — o valor sai do disponível do mês.",
    ].join("\n"),
  };
}
