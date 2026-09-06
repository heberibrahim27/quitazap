// ─────────────────────────────────────────
// QuitaZAP — Fila de revisão humana (rescue parser, 3ª tentativa)
// ─────────────────────────────────────────
// Quando o rescue parser (ai-bot.ts) não consegue entender uma mensagem
// financeira depois de 2 pedidos de esclarecimento, ele desiste de tentar
// interpretar sozinho e guarda a mensagem aqui pra alguém da equipe olhar
// depois — de propósito SEM notificação automática (pedido explícito do
// Ibrahim: "não me notificar direto toda vez"). A tela /revisao-pendente no
// admin é quem lista isso.

import { prisma } from "./prisma";

export type NovaMensagemPendenteRevisao = {
  clienteId?: string | null;
  telefone?: string | null;
  nome?: string | null;
  mensagem: string;
  motivo: string;
};

export async function registrarMensagemPendenteRevisao(dados: NovaMensagemPendenteRevisao): Promise<void> {
  try {
    await prisma.mensagemPendenteRevisao.create({
      data: {
        clienteId: dados.clienteId || null,
        telefone: dados.telefone || null,
        nome: dados.nome || null,
        mensagem: dados.mensagem,
        motivo: dados.motivo,
      },
    });
  } catch (err) {
    console.error("[MENSAGEM-PENDENTE-REVISAO] Erro ao registrar:", err);
  }
}
