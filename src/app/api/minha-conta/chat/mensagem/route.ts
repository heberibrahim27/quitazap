// ─────────────────────────────────────────
// QuitaZAP — Chat nativo (Fase 1)
// GET  /api/minha-conta/chat/mensagem — histórico recente
// POST /api/minha-conta/chat/mensagem — envia mensagem, devolve resposta
// clienteId sempre resolvido pelo cookie de sessão (qz_cliente_auth) —
// nunca aceito do corpo da requisição.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { obterOuCriarSessaoControle, processarMensagemControle } from "@/lib/controle-orquestrador";

const MENSAGEM_MAX_LEN = 2000;
const HISTORICO_LIMITE = 100;

export async function GET(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const mensagens = await prisma.mensagemChat.findMany({
    where: { clienteId },
    orderBy: { criadoEm: "desc" },
    take: HISTORICO_LIMITE,
  });

  return NextResponse.json({ mensagens: mensagens.reverse() });
}

export async function POST(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  try {
    const body = await req.json();
    const mensagem = String(body.mensagem ?? "").trim().slice(0, MENSAGEM_MAX_LEN);
    if (!mensagem) {
      return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, telefone: true, nome: true, gratuito: true },
    });
    if (!cliente) return erroClienteNaoAutenticado();

    await prisma.mensagemChat.create({
      data: { clienteId, canal: "APP", direcao: "CLIENTE", texto: mensagem },
    });

    const sessao = await obterOuCriarSessaoControle(cliente);
    const { resposta, lancamentosCriados } = await processarMensagemControle({ cliente, sessao, mensagem });

    const dadosEstruturados =
      lancamentosCriados && lancamentosCriados.length > 0
        ? {
            tipo: "lancamento_criado" as const,
            lancamentos: lancamentosCriados.map((l) => ({
              id: l.id,
              tipo: l.tipo,
              descricao: l.descricao,
              categoria: l.categoria,
              valor: l.valor,
              data: l.data,
              atualizadoEm: l.atualizadoEm,
            })),
          }
        : undefined;

    await prisma.mensagemChat.create({
      data: { clienteId, canal: "APP", direcao: "BOT", texto: resposta, dadosEstruturados },
    });

    return NextResponse.json({ resposta, dadosEstruturados });
  } catch (err) {
    console.error("[CHAT] Erro ao processar mensagem:", err);
    return NextResponse.json({ error: "Não consegui processar agora. Tenta de novo em instantes." }, { status: 500 });
  }
}
