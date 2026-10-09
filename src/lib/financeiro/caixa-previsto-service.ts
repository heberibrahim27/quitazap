// Acesso ao banco da projeção de entradas previstas (a regra em si está em
// caixa-previsto.ts, pura e testada). Só LÊ — nunca cria lançamento.

import { prisma } from "@/lib/prisma";
import { inicioDeAmanhaBrasil } from "./receita-futura";
import { projetarReceitasPrevistas, type ReceitaPrevista } from "./caixa-previsto";

/** Mesma janela do cron de recorrências: fonte mais antiga considerada. */
const JANELA_FONTES_DIAS = 100;

export async function carregarReceitasPrevistas(
  clienteId: string,
  periodo: { inicio: Date; fim: Date },
  agora: Date = new Date()
): Promise<ReceitaPrevista[]> {
  const semMetas = [{ categoria: null }, { categoria: { not: "Metas" } }];
  const desde = new Date(agora.getTime() - JANELA_FONTES_DIAS * 86_400_000);

  const [agendadas, fontes, doPeriodo] = await Promise.all([
    prisma.lancamento.findMany({
      where: { clienteId, tipo: "RECEITA", data: { gte: inicioDeAmanhaBrasil(agora), lt: periodo.fim }, OR: semMetas },
      select: { descricao: true, valor: true, data: true },
    }),
    prisma.lancamento.findMany({
      where: {
        clienteId,
        tipo: "RECEITA",
        recorrente: true,
        auditoria: { none: { acao: "RECORRENCIA" } },
        data: { gte: desde, lt: agora },
        OR: semMetas,
      },
      select: { descricao: true, valor: true, data: true, tipo: true, categoria: true },
      orderBy: { data: "asc" },
    }),
    prisma.lancamento.findMany({
      where: { clienteId, tipo: "RECEITA", data: { gte: periodo.inicio, lt: periodo.fim } },
      select: { descricao: true },
    }),
  ]);

  return projetarReceitasPrevistas({
    agendadas,
    fontesRecorrentes: fontes,
    descricoesNoPeriodo: doPeriodo.map((d) => d.descricao),
    periodo,
    agora,
  });
}
