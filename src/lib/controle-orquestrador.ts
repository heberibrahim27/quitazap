// ─────────────────────────────────────────
// QuitaZAP — Orquestrador canal-agnóstico do Controle
// Núcleo compartilhado entre WhatsApp e chat nativo — ver
// docs/chat-nativo-arquitetura.md pro plano completo.
//
// Fase 1 (este arquivo, hoje): roteia tudo pro rescue ladder do ai-bot.ts,
// que já é canal-agnóstico e cobre entendimento financeiro geral em
// linguagem natural. Os ~40 resolvers determinísticos específicos que o
// webhook do WhatsApp usa (gasto rápido, consulta de saldo, fatura de
// cartão, etc. — ver src/app/api/webhook/zapi/route.ts) ainda não foram
// portados pra cá; até a Fase 2, o chat nativo responde com a mesma
// qualidade do "modo IA geral" do WhatsApp (o mesmo fallback que atende
// qualquer mensagem que os resolvers determinísticos não reconheceram),
// não com a precisão/custo menor dos atalhos determinísticos.
//
// webhook/zapi/route.ts NÃO importa nada deste arquivo ainda — a Fase 1
// é aditiva, zero risco ao bot do WhatsApp em produção.
// ─────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { processarMensagemIA, type Mensagem } from "@/lib/ai-bot";
import type { BotSessao, Cliente } from "@prisma/client";

type ClienteParaSessao = Pick<Cliente, "id" | "telefone" | "nome">;

/**
 * Resolve a sessão do Controle pro cliente já autenticado (clienteId
 * conhecido com certeza, sem precisar de lookup por telefone). Reaproveita
 * a mesma tabela BotSessao do WhatsApp — sem migration nova — pra manter
 * memória financeira contínua entre canais: um cliente que já conversou
 * no WhatsApp encontra o mesmo contexto (renda cadastrada, confirmação
 * pendente) ao abrir o chat nativo, e vice-versa.
 */
export async function obterOuCriarSessaoControle(cliente: ClienteParaSessao): Promise<BotSessao> {
  const porClienteId = await prisma.botSessao.findFirst({ where: { clienteId: cliente.id } });
  if (porClienteId) return porClienteId;

  const porTelefone = await prisma.botSessao.findFirst({ where: { telefone: cliente.telefone } });
  if (porTelefone) {
    // Sessão existia só por telefone (ex.: cliente que já falou no
    // WhatsApp antes de logar em /minha-conta pela primeira vez) — vincula
    // ao clienteId a partir de agora.
    if (!porTelefone.clienteId) {
      return prisma.botSessao.update({ where: { id: porTelefone.id }, data: { clienteId: cliente.id } });
    }
    return porTelefone;
  }

  return prisma.botSessao.create({
    data: { telefone: cliente.telefone, clienteId: cliente.id, nome: cliente.nome },
  });
}

/**
 * Processa uma mensagem do cliente e devolve a resposta — sem enviar nada
 * (quem chama decide como entregar: WhatsApp via sendWhatsApp, chat nativo
 * via JSON de resposta). Atualiza BotSessao.dividasTemp com o novo turno,
 * mesmo formato usado pelo webhook do WhatsApp.
 */
export async function processarMensagemControle(input: {
  cliente: Pick<Cliente, "id" | "telefone" | "nome" | "gratuito">;
  sessao: BotSessao;
  mensagem: string;
}): Promise<{ resposta: string }> {
  const { cliente, sessao, mensagem } = input;

  const historico: Mensagem[] = JSON.parse(sessao.dividasTemp || "[]");

  const resultado = await processarMensagemIA(
    historico,
    mensagem,
    cliente.nome ?? "cliente",
    cliente.id,
    cliente.gratuito,
    cliente.telefone
  );

  const historicoAtualizado: Mensagem[] = [...historico, { role: "user", content: mensagem }];

  await prisma.botSessao.updateMany({
    where: { id: sessao.id },
    data: {
      dividasTemp: JSON.stringify([
        ...historicoAtualizado,
        { role: "assistant", content: resultado.resposta },
      ]),
    },
  });

  return { resposta: resultado.resposta };
}
