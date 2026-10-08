// ─────────────────────────────────────────
// QuitaZAP — Chat nativo: confirmação do "Boleto Inteligente" (PDF de boleto)
// POST /api/minha-conta/boleto/confirmar — cliente confirma ou nega o boleto que
// o PDF detectou (ver /api/minha-conta/chat/arquivo). Confirmando, grava a mesma
// Divida+Parcela do WhatsApp (salvarBoletoComoDivida). Nunca grava antes disso.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { obterOuCriarSessaoControle } from "@/lib/controle-orquestrador";
import { reivindicarPendente } from "@/lib/pendente-atomico";
import { boletoValido, salvarBoletoComoDivida, type BoletoDetectado } from "@/lib/boleto-flow";

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
    acao = String((await req.json()).acao ?? "");
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (acao !== "confirmar" && acao !== "negar") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const sessao = await obterOuCriarSessaoControle(cliente);
  // Reivindicação atômica: dois toques simultâneos não gravam em dobro.
  const pendente = await reivindicarPendente<Partial<BoletoDetectado>>(sessao.id, "boletoPendente");
  if (!pendente || !boletoValido(pendente)) {
    return NextResponse.json({ error: "Não há nenhum boleto aguardando confirmação." }, { status: 409 });
  }

  let resposta: string;
  if (acao === "negar") {
    resposta = "Beleza, não salvei.";
  } else {
    try {
      await salvarBoletoComoDivida(clienteId, pendente);
      resposta = "✅ Salvei o boleto como um compromisso no seu Controle. Vou te lembrar antes do vencimento.";
    } catch (err) {
      console.error("[BOLETO-CONFIRMAR] Erro ao salvar:", err);
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: { boletoPendente: pendente as unknown as Prisma.InputJsonValue },
      });
      return NextResponse.json({ error: "Não consegui salvar agora. Tenta de novo em instantes." }, { status: 500 });
    }
  }

  await prisma.mensagemChat.create({ data: { clienteId, canal: "APP", direcao: "BOT", texto: resposta } });
  return NextResponse.json({ resposta });
}
