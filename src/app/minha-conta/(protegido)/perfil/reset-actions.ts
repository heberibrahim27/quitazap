"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

const PALAVRA_CONFIRMACAO = "RESETAR";

// Reset TOTAL (decisão do Ibrahim, 10/09/2026: "se é um reset tem que ser
// total, até o chat" / "só fica a foto, os dados cadastrais") — apaga TODO
// dado financeiro e de conversa do cliente: receitas, despesas, compras no
// cartão, cartões, agenda, orçamentos por categoria, metas (com seus
// depósitos, via cascade do schema), Empréstimos/Dívidas (Divida — Parcela e
// Pagamento caem junto via cascade do schema), histórico do chat nativo/
// WhatsApp (MensagemChat), estado diário calculado, insights detectados,
// histórico de saúde financeira, e a renda/despesa fixa declarada no
// cadastro (senão o Resumo do mês continua mostrando o valor antigo mesmo
// depois do reset). Também limpa BotSessao do cliente — mesma classe de bug
// já corrigida hoje no rescue ladder: sem isso, uma pendência de conversa
// (confirmacaoPendente, dívida temporária etc.) ficaria apontando pra dados
// que não existem mais. NÃO mexe em identidade/cadastro/assinatura do
// Cliente (nome, telefone, cpf, email, senhaHash, fotoUrl,
// statusAtendimento, gratuito, assinaturaVenceEm, isTeste, aceitaProativas,
// modoLembrete) nem em histórico de cobrança/uso/admin (EventoCakto, LogIA,
// EventoAnalytics, MensagemPendenteRevisao, AuditoriaAssistente) — fora do
// escopo do que o cliente pediu pra resetar.
// Isolada da server action (que depende de cookies()/redirect() do Next, só
// disponíveis dentro de uma requisição de verdade) pra dar pra chamar direto
// em verificação/teste de integração contra um cliente real, sem precisar
// simular sessão nem contexto de request.
export async function executarResetTotalCliente(clienteId: string): Promise<void> {
  await prisma.$transaction([
    prisma.lancamento.deleteMany({ where: { clienteId } }),
    prisma.cartao.deleteMany({ where: { clienteId } }),
    prisma.tarefa.deleteMany({ where: { clienteId } }),
    prisma.orcamentoCategoria.deleteMany({ where: { clienteId } }),
    prisma.pushSubscription.deleteMany({ where: { clienteId } }),
    // DepositoMeta cai sozinho via onDelete: Cascade no schema.
    prisma.meta.deleteMany({ where: { clienteId } }),
    // Parcela e Pagamento caem sozinhos via onDelete: Cascade no schema.
    prisma.divida.deleteMany({ where: { clienteId } }),
    prisma.mensagemChat.deleteMany({ where: { clienteId } }),
    prisma.estadoDiarioCliente.deleteMany({ where: { clienteId } }),
    prisma.insightDetectado.deleteMany({ where: { clienteId } }),
    prisma.saudeFinanceiraLog.deleteMany({ where: { clienteId } }),
    prisma.botSessao.deleteMany({ where: { clienteId } }),
    // Zera a renda/despesa fixa e a jornada declaradas no cadastro — sem
    // isso o Resumo do mês (Renda mensal / Disponível no mês) continuava
    // mostrando o valor antigo mesmo com tudo mais já resetado.
    prisma.cliente.update({
      where: { id: clienteId },
      data: { rendaMensal: null, despesasFixas: null, valorDisponivelMensal: null, jornadaMensalHoras: null },
    }),
  ]);
}

export async function resetarDadosFinanceiros(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const confirmacao = String(formData.get("confirmacao") || "").trim().toUpperCase();
  if (confirmacao !== PALAVRA_CONFIRMACAO) {
    return { erro: `Digite "${PALAVRA_CONFIRMACAO}" (em maiúsculas) pra confirmar.` };
  }

  await executarResetTotalCliente(cliente.id);

  revalidatePath("/minha-conta", "layout");
  redirect("/minha-conta/perfil?ok=reset");
}
