// ─────────────────────────────────────────
// QuitaZAP — Chat nativo: confirmação da "Fatura Inteligente" por print
// POST /api/minha-conta/fatura/confirmar — cliente confirma ou nega o lote
// de compras parceladas que o print detectou (ver /api/minha-conta/chat/anexo).
// Confirmando, grava Divida+Parcela com o mesmo salvarComprasParceladasFatura
// do fluxo de PDF (cartão, parcelas futuras, hash anti-reenvio).
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { obterOuCriarSessaoControle } from "@/lib/controle-orquestrador";
import {
  mensagemLoteConfirmado,
  salvarComprasParceladasFatura,
  type FaturaCartaoPendente,
} from "@/lib/fatura-cartao-flow";

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
  const pendente = sessao.faturaCartaoPendente as unknown as FaturaCartaoPendente | null;
  if (!pendente) {
    return NextResponse.json({ error: "Não há nenhuma fatura aguardando confirmação." }, { status: 409 });
  }

  await prisma.botSessao.updateMany({ where: { id: sessao.id }, data: { faturaCartaoPendente: Prisma.JsonNull } });

  let resposta: string;
  if (acao === "negar") {
    resposta = "Sem problema, não lancei nada dessa fatura.";
  } else {
    try {
      await salvarComprasParceladasFatura(clienteId, pendente);
      resposta = mensagemLoteConfirmado(pendente).replace(/\*/g, "");
    } catch (err) {
      console.error("[FATURA-CONFIRMAR] Erro ao salvar:", err);
      // devolve a pendência pra o cliente poder tentar de novo
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: { faturaCartaoPendente: pendente as unknown as Prisma.InputJsonValue },
      });
      return NextResponse.json({ error: "Não consegui salvar agora. Tenta de novo em instantes." }, { status: 500 });
    }
  }

  await prisma.mensagemChat.create({ data: { clienteId, canal: "APP", direcao: "BOT", texto: resposta } });
  return NextResponse.json({ resposta });
}
