// ─────────────────────────────────────────
// QuitaZAP — Fila de revisão humana (rescue parser, 3ª tentativa)
// ─────────────────────────────────────────
// Quando o rescue parser (ai-bot.ts) não consegue entender uma mensagem
// mesmo depois de guiar o cliente por um menu de opções, ele SEMPRE dá uma
// resposta definitiva na hora (nunca deixa esperando humano — ver
// rescue-classificador.ts) e só registra aqui como rastro. De propósito
// SEM notificação automática (pedido explícito do Ibrahim: "não me
// notificar direto toda vez"). A tela /revisao-pendente no admin é quem
// lista isso.
//
// Reescrito (Ibrahim, 2026-09-06, "pensa em 10 mil clientes tendo que
// olhar manualmente"): `criticidade` separa o que exige ação humana de
// verdade (CRITICA — cancelamento, reclamação grave, erro de cobrança,
// pedido explícito de humano) do que é só dado pra melhorar o parser
// depois (MONITORAMENTO — a maioria) — a fila deixa de ser "toda mensagem
// não entendida" e vira um painel de monitoramento/melhoria contínua.

import { prisma } from "./prisma";
import type { CategoriaCritica } from "./rescue-classificador";

export type CriticidadeRevisao = "CRITICA" | "MONITORAMENTO";

export type NovaMensagemPendenteRevisao = {
  clienteId?: string | null;
  telefone?: string | null;
  nome?: string | null;
  mensagem: string;
  motivo: string;
  criticidade?: CriticidadeRevisao;
  categoria?: CategoriaCritica | null;
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
        criticidade: dados.criticidade ?? "MONITORAMENTO",
        categoria: dados.categoria ?? null,
      },
    });
  } catch (err) {
    console.error("[MENSAGEM-PENDENTE-REVISAO] Erro ao registrar:", err);
  }
}
