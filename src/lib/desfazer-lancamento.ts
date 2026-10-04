// Apaga o ÚLTIMO lançamento do cliente (gasto/receita/despesa fixa/compra no
// cartão) — rede de segurança pro registro automático sem confirmação. Mesma
// regra e mesmo texto do webhook do WhatsApp, agora também usado pelo chat
// nativo. Desfazer dívida/meta/cartão continua exigindo o fluxo específico.

import { prisma } from "@/lib/prisma";

const ROTULO_TIPO: Record<string, string> = {
  RECEITA: "Receita",
  DESPESA_FIXA: "Despesa fixa",
  COMPRA_CARTAO: "Gasto no cartão",
  FATURA_FECHADA: "Fatura",
};

export async function desfazerUltimoLancamento(clienteId: string): Promise<string> {
  const ultimo = await prisma.lancamento.findFirst({ where: { clienteId }, orderBy: { criadoEm: "desc" } });
  if (!ultimo) return "Não achei nenhum lançamento recente pra desfazer.";

  await prisma.lancamento.delete({ where: { id: ultimo.id } });

  const valor = ultimo.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
  return (
    `↩️ *Desfeito.*\n\n` +
    `${ROTULO_TIPO[ultimo.tipo] ?? "Despesa"} removida:\n` +
    `${ultimo.descricao} — ${valor}\n\n` +
    `Se não era esse, me avisa que eu confiro. Pode mandar o lançamento certo agora.`
  );
}
