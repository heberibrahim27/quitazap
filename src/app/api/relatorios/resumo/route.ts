import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioId, erroNaoAutenticado } from "@/lib/get-usuario";

export async function GET(req: NextRequest) {
  const usuarioId = getUsuarioId(req);
  if (!usuarioId) return erroNaoAutenticado();

  const agora    = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimMes    = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);
  const hoje      = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const amanha    = new Date(hoje.getTime() + 86400000);

  const [todasPendencias, enviosTotal, enviosLidos] = await Promise.all([
    prisma.pendencia.findMany({
      where: { usuarioId },
      select: { status: true, valor: true, valorPago: true, vencimento: true, pagoEm: true },
    }),
    prisma.envioBot.count({ where: { usuarioId } }),
    prisma.envioBot.count({ where: { usuarioId, status: { in: ["LIDO", "RESPONDIDO"] } } }),
  ]);

  // Valor recuperado no mês corrente (pagas neste mês)
  const valorRecuperado = todasPendencias
    .filter((p) => {
      if (!["PAGA", "PARCIALMENTE_PAGA"].includes(p.status)) return false;
      if (!p.pagoEm) return true; // confirmação manual sem data
      const pago = new Date(p.pagoEm);
      return pago >= inicioMes && pago <= fimMes;
    })
    .reduce((s, p) => s + (p.valorPago ?? p.valor), 0);

  // Em aberto (não pagas, não canceladas)
  const valorAberto = todasPendencias
    .filter((p) => !["PAGA", "PARCIALMENTE_PAGA", "CANCELADA"].includes(p.status))
    .reduce((s, p) => s + p.valor, 0);

  // Vencendo hoje
  const pendentesHoje = todasPendencias.filter((p) => {
    if (["PAGA", "PARCIALMENTE_PAGA", "CANCELADA"].includes(p.status)) return false;
    const venc = new Date(p.vencimento);
    return venc >= hoje && venc < amanha;
  }).length;

  // Taxa de leitura
  const taxaLeitura = enviosTotal > 0 ? Math.round((enviosLidos / enviosTotal) * 100) : 0;

  // Tempo economizado: estimativa de 5 min por lembrete enviado
  const tempoEconomizado = enviosTotal * 5;

  return NextResponse.json({
    resumo: {
      totalPendencias:  todasPendencias.length,
      pendentesHoje,
      valorAberto:      Math.round(valorAberto * 100) / 100,
      valorRecuperado:  Math.round(valorRecuperado * 100) / 100,
      lembretesEnviados: enviosTotal,
      taxaLeitura,
      tempoEconomizado,
    },
  });
}
