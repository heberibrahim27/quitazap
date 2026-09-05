// ─────────────────────────────────────────
// QuitaZAP Controle — Baixa de pagamento de dívida (compartilhado)
// ─────────────────────────────────────────
// Extraído do padrão já usado em emprestimos/[id]/page.tsx (mesma trava
// race-safe: updateMany com uma condição que só bate na "primeira"
// chamada, pra duplo clique/duplo submit não incrementar valorPago duas
// vezes) pra ser reaproveitado também pela tela de Plano de Pagamento —
// agora cobrindo TODOS os tipos de dívida, não só EMPRESTIMO:
// - Dívida com cronograma de parcelas cadastrado: a baixa é sempre na
//   próxima parcela PENDENTE (mesmo comportamento de sempre). Se não
//   sobrar nenhuma pendente, é erro — nunca cai pro caminho de baixo.
// - Dívida sem NENHUMA parcela cadastrada (comum em CARTAO/BOLETO/
//   ACORDO/OUTRO, que nunca tiveram baixa nenhuma na UI web antes
//   disso): baixa direto no saldo da dívida.
// A decisão de qual caminho usar é por "tem parcela cadastrada" (fato
// estrutural, não muda no meio da operação) e não por "tem parcela
// PENDENTE" — checar só a pendente teria uma janela de corrida: duas
// chamadas concorrentes quase simultâneas na ÚLTIMA parcela pendente de
// uma dívida podiam ambas verem "sem pendente" após a primeira já ter
// pago, e a segunda cairia sem querer no caminho sem trava nenhuma
// (achado em teste manual antes de subir isso).
// Diferente do fluxo antigo de Empréstimos, passa a gravar um Pagamento
// (histórico), alinhado com o padrão já usado pelo WhatsApp/painel
// legado (ver registrarPagamentoDivida em tarefa-service.ts).

import { prisma } from "@/lib/prisma";

export interface ResultadoBaixa {
  ok: boolean;
  erro?: string;
}

async function atualizarStatusSeQuitado(dividaId: string) {
  const divida = await prisma.divida.findUnique({ where: { id: dividaId }, select: { valorTotal: true, valorPago: true } });
  if (divida && divida.valorPago >= divida.valorTotal) {
    await prisma.divida.update({ where: { id: dividaId }, data: { status: "QUITADA" } });
  }
}

export async function marcarDividaComoPaga(clienteId: string, dividaId: string, valor: number): Promise<ResultadoBaixa> {
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: "Valor inválido." };

  const divida = await prisma.divida.findUnique({ where: { id: dividaId } });
  if (!divida || divida.clienteId !== clienteId) return { ok: false, erro: "Dívida não encontrada." };

  const temCronograma = (await prisma.parcela.count({ where: { dividaId } })) > 0;

  if (temCronograma) {
    const proximaParcela = await prisma.parcela.findFirst({
      where: { dividaId, status: "PENDENTE" },
      orderBy: { vencimento: "asc" },
    });
    if (!proximaParcela) return { ok: false, erro: "Não há parcela pendente pra pagar nessa dívida." };

    const jaEstavaPaga = await prisma.$transaction(async (tx) => {
      const resultado = await tx.parcela.updateMany({
        where: { id: proximaParcela.id, status: { not: "PAGA" } },
        data: { status: "PAGA", valor },
      });
      if (resultado.count === 0) return true;
      await tx.pagamento.create({ data: { clienteId, dividaId, valor, data: new Date() } });
      await tx.divida.update({ where: { id: dividaId }, data: { valorPago: { increment: valor } } });
      return false;
    });
    if (jaEstavaPaga) return { ok: false, erro: "Essa parcela já estava marcada como paga." };
  } else {
    // Sem cronograma cadastrado — baixa direto no saldo da dívida.
    // Trava contra clique duplo: o updateMany só avança se valorPago
    // ainda for o mesmo que acabamos de ler (se outra chamada já mexeu
    // nesse meio-tempo, count vem 0 e a gente não soma de novo).
    const jaMudou = await prisma.$transaction(async (tx) => {
      const resultado = await tx.divida.updateMany({
        where: { id: dividaId, valorPago: divida.valorPago },
        data: { valorPago: { increment: valor } },
      });
      if (resultado.count === 0) return true;
      await tx.pagamento.create({ data: { clienteId, dividaId, valor, data: new Date() } });
      return false;
    });
    if (jaMudou) return { ok: false, erro: "Essa dívida acabou de ser atualizada — confira o valor e tente de novo." };
  }

  await atualizarStatusSeQuitado(dividaId);
  return { ok: true };
}
