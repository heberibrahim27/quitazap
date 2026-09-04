// ─────────────────────────────────────────
// QuitaZAP Controle — Cron: baixa automática de consignados
// GET /api/cron/consignados (1x por dia — mesmo padrão dos demais crons)
//
// Parcela de Divida.descontadoEmFolha=true (consignado) nunca é "paga
// ativamente" pelo cliente — o desconto já acontece direto na folha. Esse
// cron marca essas parcelas como PAGA na data de vencimento, sozinho,
// espelhando exatamente a mesma atualização que a baixa MANUAL já faz em
// emprestimos/[id]/page.tsx (status da parcela + Divida.valorPago, pra o
// "saldo devedor" continuar refletindo o quanto do empréstimo já foi
// quitado). Não mexe em Lancamento/receita nem cria Pagamento — não existe
// nenhum evento de abatimento adicional de saldo/renda aqui: motor.ts e
// plano-pagamento-service.ts já excluem toda parcela de dívida com
// descontadoEmFolha=true do cálculo mensal (ela já está refletida no
// salário líquido que o cliente lança/declara como renda).
//
// Parcelas normais (descontadoEmFolha=false) não são tocadas por este
// cron — continuam com baixa manual, como já é hoje.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  // Mesmo padrão de autenticação dos demais crons (lembretes, cobrador, tarefas).
  const isInternal = req.headers.get("x-internal-call") === "1";
  if (!isInternal) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      console.warn("[CRON CONSIGNADOS] CRON_SECRET não configurado — rota acessível sem autenticação.");
    }
  }

  const agora = new Date();
  const erros: string[] = [];
  let baixadas = 0;

  try {
    const parcelasVencidas = await prisma.parcela.findMany({
      where: {
        status: "PENDENTE",
        vencimento: { lte: agora },
        divida: { status: "ATIVA", descontadoEmFolha: true },
      },
      select: { id: true, valor: true, dividaId: true },
    });

    for (const parcela of parcelasVencidas) {
      try {
        await prisma.$transaction(async (tx) => {
          const atualizada = await tx.parcela.updateMany({
            where: { id: parcela.id, status: "PENDENTE" },
            data: { status: "PAGA" },
          });
          // updateMany.count 0 = outra execução/rota já pegou essa parcela
          // entre o findMany e aqui — não incrementa valorPago de novo.
          if (atualizada.count > 0) {
            await tx.divida.update({
              where: { id: parcela.dividaId },
              data: { valorPago: { increment: parcela.valor } },
            });
            baixadas++;
          }
        });
      } catch (err) {
        erros.push(`parcela ${parcela.id}: ${err}`);
      }
    }
  } catch (err) {
    console.error("[CRON CONSIGNADOS] Erro ao buscar parcelas vencidas:", err);
    erros.push(`busca: ${err}`);
  }

  const resumo = {
    ok: true,
    rodadoEm: agora.toISOString(),
    baixadas,
    erros: erros.length > 0 ? erros : undefined,
  };

  console.log("[CRON CONSIGNADOS]", resumo);
  return NextResponse.json(resumo);
}
