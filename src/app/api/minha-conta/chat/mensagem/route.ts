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

// Uma frase curta e interpretativa no máximo — nunca repete os números que
// o card já mostra (total, cada categoria, cada lançamento). Ver comentário
// acima de onde isso é chamado.
function respostaCurtaParaCard(
  dados:
    | { tipo: "lancamento_criado"; lancamentos: unknown[] }
    | { tipo: "grafico_categoria"; categorias: { nome: string; percentual: number }[] },
): string {
  if (dados.tipo === "lancamento_criado") {
    return dados.lancamentos.length > 1 ? `${dados.lancamentos.length} lançamentos registrados.` : "Lançamento registrado.";
  }
  const top = dados.categorias[0];
  if (!top) return "Aqui está o resumo do período.";
  return `${top.nome} concentra ${top.percentual}% das despesas registradas neste período.`;
}

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
    const resultado = await processarMensagemControle({ cliente, sessao, mensagem });
    const { lancamentosCriados, graficoCategoria } = resultado;

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
        : graficoCategoria
          ? graficoCategoria
          : undefined;

    // `resultado.resposta` é o texto verboso pensado pro WhatsApp (emoji,
    // categoria por categoria, comentário) — reaproveitá-lo aqui em cima do
    // card duplicava a mesma informação duas vezes na tela (achado real do
    // Ibrahim, 10/09/2026). O card já carrega os valores detalhados; o chat
    // nativo mostra no máximo uma frase curta antes dele. Só cai de volta
    // pro texto original quando não há card pra mostrar (ex.: consulta sem
    // dado suficiente pro gráfico).
    const resposta = dadosEstruturados ? respostaCurtaParaCard(dadosEstruturados) : resultado.resposta;

    await prisma.mensagemChat.create({
      data: { clienteId, canal: "APP", direcao: "BOT", texto: resposta, dadosEstruturados },
    });

    return NextResponse.json({ resposta, dadosEstruturados });
  } catch (err) {
    console.error("[CHAT] Erro ao processar mensagem:", err);
    return NextResponse.json({ error: "Não consegui processar agora. Tenta de novo em instantes." }, { status: 500 });
  }
}
