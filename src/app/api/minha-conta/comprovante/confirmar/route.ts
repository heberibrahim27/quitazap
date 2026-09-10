// ─────────────────────────────────────────
// QuitaZAP — Chat nativo: confirmação do "Comprovante Inteligente"
// POST /api/minha-conta/comprovante/confirmar — cliente confirma ou nega o
// gasto que a foto detectou (ver /api/minha-conta/chat/anexo). Confirmando,
// reinjeta o texto já normalizado no MESMO orquestrador que processa
// mensagem de texto digitada — nunca duplica a lógica de categorização/
// checagem de orçamento/etc., só passa origem "FOTO" + o caminho da foto no
// Storage pra Lancamento.comprovanteUrl não se perder.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { obterOuCriarSessaoControle, processarMensagemControle } from "@/lib/controle-orquestrador";
import type { ComprovanteFotoDetectado } from "@/lib/comprovante-foto-flow";

export async function POST(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, telefone: true, nome: true, gratuito: true },
  });
  if (!cliente) return erroClienteNaoAutenticado();

  let acao: string;
  try {
    const body = await req.json();
    acao = String(body.acao ?? "");
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (acao !== "confirmar" && acao !== "negar") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const sessao = await obterOuCriarSessaoControle(cliente);
  const pendente = sessao.comprovanteFotoPendente as unknown as ComprovanteFotoDetectado | null;
  if (!pendente) {
    return NextResponse.json({ error: "Não há nenhuma foto de comprovante aguardando confirmação." }, { status: 409 });
  }

  await prisma.botSessao.updateMany({ where: { id: sessao.id }, data: { comprovanteFotoPendente: Prisma.JsonNull } });

  if (acao === "negar") {
    const resposta = "Sem problema, não registrei nada a partir dessa foto.";
    await prisma.mensagemChat.create({ data: { clienteId, canal: "APP", direcao: "BOT", texto: resposta } });
    return NextResponse.json({ resposta });
  }

  const resultado = await processarMensagemControle({
    cliente,
    sessao,
    mensagem: pendente.textoNormalizado,
    origem: "FOTO",
    comprovanteUrl: pendente.imageUrl,
  });

  const dadosEstruturados =
    resultado.lancamentosCriados && resultado.lancamentosCriados.length > 0
      ? {
          tipo: "lancamento_criado" as const,
          lancamentos: resultado.lancamentosCriados.map((l) => ({
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

  const resposta = dadosEstruturados ? "Lançamento registrado." : resultado.resposta;

  await prisma.mensagemChat.create({
    data: { clienteId, canal: "APP", direcao: "BOT", texto: resposta, dadosEstruturados },
  });

  return NextResponse.json({ resposta, dadosEstruturados });
}
