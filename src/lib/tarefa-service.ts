// ─────────────────────────────────────────
// QuitaZAP Controle — Orquestração de Tarefas (persistência)
// Camada fina entre o webhook e o Prisma: recebe um ComandoTarefa já
// interpretado por tarefa-flow.ts e devolve o texto de resposta para o
// WhatsApp, cuidando de toda leitura/escrita no banco.
// ─────────────────────────────────────────

import { prisma } from "./prisma";
import {
  encontrarDividaCorrespondente,
  encontrarTarefaPorTermo,
  formatarConfirmacaoTarefa,
  formatarListaTarefas,
  formatarMensagemErroExtracao,
  type ComandoTarefa,
  type ResultadoExtracaoTarefa,
} from "./tarefa-flow";

const MENSAGEM_SEM_CONTA =
  "⚠️ Ainda não encontrei seu cadastro ativo. Assine o QuitaZAP pra registrar tarefas e pagamentos. 😊";

/**
 * Retorna a resposta a enviar, ou `null` quando a mensagem não deve ser
 * interceptada pelo fluxo de tarefas (deixa a cascata normal do webhook
 * continuar). "CRIAR" e "LISTAR" usam prefixos/frases explícitas e sempre
 * respondem. Já "CONCLUIR"/"CANCELAR" usam verbos de linguagem natural
 * ("concluí", "terminei", "cancela") que também aparecem em conversas
 * normais (onboarding, negociação de dívida) — por isso só interceptam
 * quando existe de fato uma tarefa pendente parecida com o termo; sem
 * match, devolvem null pra não sequestrar o resto da conversa.
 */
export async function processarComandoTarefa(
  clienteId: string | null | undefined,
  comando: ComandoTarefa,
  origem: "TEXTO" | "AUDIO"
): Promise<string | null> {
  if (comando.comando === "CRIAR") {
    return clienteId ? criarTarefa(clienteId, comando.resultado, origem) : MENSAGEM_SEM_CONTA;
  }
  if (comando.comando === "LISTAR") {
    return clienteId ? listarTarefas(clienteId) : MENSAGEM_SEM_CONTA;
  }
  if (!clienteId) return null;

  if (comando.comando === "CONCLUIR") return concluirTarefa(clienteId, comando.termo);
  if (comando.comando === "CANCELAR") return cancelarTarefa(clienteId, comando.termo);
  return null;
}

async function criarTarefa(
  clienteId: string,
  resultado: ResultadoExtracaoTarefa,
  origem: "TEXTO" | "AUDIO"
): Promise<string> {
  if (!resultado.ok) return formatarMensagemErroExtracao(resultado.motivo);

  const tarefa = resultado.tarefa;

  const dividasAtivas = await prisma.divida.findMany({
    where: { clienteId, status: "ATIVA" },
    select: { id: true, credor: true },
  });
  const dividaMatch = encontrarDividaCorrespondente(tarefa.descricao, dividasAtivas);

  if (tarefa.tipo === "PAGAMENTO") {
    if (dividaMatch && tarefa.valor != null) {
      await registrarPagamentoDivida(clienteId, dividaMatch.id, tarefa.valor);
    }

    await prisma.tarefa.create({
      data: {
        clienteId,
        tipo: "PAGAMENTO",
        descricao: tarefa.descricao,
        valor: tarefa.valor,
        vencimento: tarefa.vencimento,
        horarioEnvio: tarefa.horarioEnvio,
        dividaId: dividaMatch?.id ?? null,
        status: "CONCLUIDA",
        origem,
        concluidaEm: new Date(),
      },
    });

    const extra = dividaMatch
      ? `\n\n💳 Vinculado à dívida com *${dividaMatch.credor}*${tarefa.valor != null ? " — saldo atualizado." : "."}`
      : "";
    return formatarConfirmacaoTarefa(tarefa) + extra;
  }

  await prisma.tarefa.create({
    data: {
      clienteId,
      tipo: "LEMBRETE",
      descricao: tarefa.descricao,
      valor: tarefa.valor,
      vencimento: tarefa.vencimento,
      recorrente: tarefa.recorrente,
      frequencia: tarefa.frequencia,
      diaMes: tarefa.diaMes,
      mesAnual: tarefa.mesAnual,
      diaSemana: tarefa.diaSemana,
      horarioEnvio: tarefa.horarioEnvio,
      dividaId: dividaMatch?.id ?? null,
      status: "PENDENTE",
      origem,
    },
  });

  const extra = dividaMatch ? `\n\n💳 Vinculado à dívida com *${dividaMatch.credor}*.` : "";
  return formatarConfirmacaoTarefa(tarefa) + extra;
}

async function listarTarefas(clienteId: string): Promise<string> {
  const tarefas = await prisma.tarefa.findMany({
    where: { clienteId, status: "PENDENTE" },
    orderBy: [{ vencimento: "asc" }, { criadoEm: "asc" }],
  });
  return formatarListaTarefas(tarefas);
}

/**
 * "Concluir" só marca a tarefa como feita — não mexe em Divida/Pagamento.
 * Se o usuário quer registrar que pagou algo (e refletir isso numa dívida
 * vinculada), o caminho é o comando explícito "pagamento: ...", que já faz
 * a reconciliação. Misturar os dois faria "concluí X" (só dispensar o
 * lembrete) mudar saldo de dívida sem o usuário ter confirmado pagamento.
 */
async function concluirTarefa(clienteId: string, termo: string): Promise<string | null> {
  const pendentes = await prisma.tarefa.findMany({
    where: { clienteId, status: "PENDENTE" },
  });
  const tarefa = encontrarTarefaPorTermo(termo, pendentes);
  if (!tarefa) return null;

  await prisma.tarefa.update({
    where: { id: tarefa.id },
    data: { status: "CONCLUIDA", concluidaEm: new Date() },
  });

  return `✅ *Concluído:* ${tarefa.descricao}`;
}

async function cancelarTarefa(clienteId: string, termo: string): Promise<string | null> {
  const pendentes = await prisma.tarefa.findMany({
    where: { clienteId, status: "PENDENTE" },
  });
  const tarefa = encontrarTarefaPorTermo(termo, pendentes);
  if (!tarefa) return null;

  await prisma.tarefa.update({
    where: { id: tarefa.id },
    data: { status: "CANCELADA" },
  });

  return `🗑️ *Cancelado:* ${tarefa.descricao}`;
}

/** Reconciliação com o legado: mesma lógica de src/app/clientes/[id]/pagamento/novo/page.tsx. */
async function registrarPagamentoDivida(clienteId: string, dividaId: string, valor: number): Promise<void> {
  const divida = await prisma.divida.findUnique({ where: { id: dividaId } });
  if (!divida) return;

  const novoTotalPago = Number(divida.valorPago ?? 0) + valor;
  const ficouQuitada = novoTotalPago >= Number(divida.valorTotal);

  await prisma.$transaction([
    prisma.pagamento.create({
      data: { clienteId, dividaId, valor, data: new Date() },
    }),
    prisma.divida.update({
      where: { id: dividaId },
      data: {
        valorPago: { increment: valor },
        ...(ficouQuitada ? { status: "QUITADA" } : {}),
      },
    }),
  ]);
}
