// ─────────────────────────────────────────
// QuitaZAP — Chat nativo: confirmação do "Empréstimo por print"
// POST /api/minha-conta/emprestimo/confirmar — cliente confirma ou nega o empréstimo que
// o print detectou. Os valores vêm SEMPRE da prévia guardada no servidor (pelo id da
// mensagem + clienteId da sessão), nunca do corpo da requisição.
// ─────────────────────────────────────────

import { respostaSeAssinaturaVencida } from "@/lib/assinatura-acesso";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { buscarPendenteEmprestimoPorId, resolverPendenteEmprestimo } from "@/lib/emprestimo-previa";

export async function POST(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();
  // Assinatura vencida/reembolsada/cancelada: sem acesso (mesma regra do WhatsApp).
  const bloqueioAssinatura = await respostaSeAssinaturaVencida(clienteId);
  if (bloqueioAssinatura) return bloqueioAssinatura;

  let acao: string;
  let mensagemId: string;
  try {
    const body = await req.json();
    acao = String(body.acao ?? "");
    mensagemId = String(body.mensagemId ?? "");
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if ((acao !== "confirmar" && acao !== "negar") || !mensagemId) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const pendente = await buscarPendenteEmprestimoPorId(clienteId, mensagemId);
  if (!pendente) {
    return NextResponse.json({ error: "Não há nenhum empréstimo aguardando confirmação." }, { status: 409 });
  }

  const r = await resolverPendenteEmprestimo(clienteId, pendente, acao);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 409 });

  await prisma.mensagemChat.create({ data: { clienteId, canal: "APP", direcao: "BOT", texto: r.mensagem } });
  return NextResponse.json({ resposta: r.mensagem });
}
