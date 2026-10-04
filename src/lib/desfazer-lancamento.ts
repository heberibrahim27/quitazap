// Apaga o ÚLTIMO lançamento do cliente (gasto/receita/despesa fixa/compra no
// cartão) — rede de segurança pro registro automático sem confirmação. Mesma
// regra e mesmo texto nos dois canais (WhatsApp e chat nativo): ambos chamam a
// skill "desfazer_ultimo_lancamento" do registro de skills (agentes/skills).
// Desfazer dívida/meta/cartão continua exigindo o fluxo específico.

import { prisma } from "@/lib/prisma";

const ROTULO_TIPO: Record<string, string> = {
  RECEITA: "Receita",
  DESPESA_FIXA: "Despesa fixa",
  COMPRA_CARTAO: "Gasto no cartão",
  FATURA_FECHADA: "Fatura",
};

export interface ResultadoDesfazer {
  removido: boolean;
  resposta: string;
  lancamentoId?: string;
  tipo?: string;
  valor?: number;
}

export async function desfazerUltimoLancamentoDetalhado(clienteId: string): Promise<ResultadoDesfazer> {
  const ultimo = await prisma.lancamento.findFirst({ where: { clienteId }, orderBy: { criadoEm: "desc" } });
  if (!ultimo) return { removido: false, resposta: "Não achei nenhum lançamento recente pra desfazer." };

  await prisma.lancamento.delete({ where: { id: ultimo.id } });

  const valor = ultimo.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
  return {
    removido: true,
    lancamentoId: ultimo.id,
    tipo: ultimo.tipo,
    valor: ultimo.valor,
    resposta:
      `↩️ *Desfeito.*\n\n` +
      `${ROTULO_TIPO[ultimo.tipo] ?? "Despesa"} removida:\n` +
      `${ultimo.descricao} — ${valor}\n\n` +
      `Se não era esse, me avisa que eu confiro. Pode mandar o lançamento certo agora.`,
  };
}

export async function desfazerUltimoLancamento(clienteId: string): Promise<string> {
  return (await desfazerUltimoLancamentoDetalhado(clienteId)).resposta;
}
