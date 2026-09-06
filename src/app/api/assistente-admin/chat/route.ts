// ─────────────────────────────────────────
// QuitaZAP — Assistente Admin (IA interna) — chat
// POST /api/assistente-admin/chat
// ─────────────────────────────────────────
// "/api" fica fora da checagem do middleware.ts (ver mesmo comentário em
// api/exportar/route.ts) — checagem de cookie de admin feita aqui direto.
//
// Loop de function-calling: chama o modelo, executa tools de LEITURA na
// hora e devolve o resultado pro modelo (até MAX_ITERACOES rounds); numa
// tool de ESCRITA, para o loop imediatamente e devolve uma PROPOSTA — o
// modelo nunca é chamado de novo pra "decidir" executar, a escrita de
// verdade só acontece em /api/assistente-admin/confirmar, disparada pelo
// clique explícito em "Confirmar" na tela.

import { NextRequest, NextResponse } from "next/server";
import { chatCompletion, type MensagemChat } from "@/lib/ai/openai-client";
import { REGISTRO_FERRAMENTAS, FERRAMENTAS_OPENAI, SYSTEM_PROMPT } from "@/lib/assistente-admin/ferramentas";

const COOKIE_NAME = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

const MAX_ITERACOES = 4;
const MAX_HISTORICO = 20;

interface MensagemEntrada {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  if (req.cookies.get(COOKIE_NAME)?.value !== COOKIE_TOKEN) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const mensagensEntrada = body?.mensagens;
  if (!Array.isArray(mensagensEntrada) || mensagensEntrada.length === 0) {
    return NextResponse.json({ error: "Envie ao menos uma mensagem." }, { status: 400 });
  }

  const historico: MensagemChat[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(mensagensEntrada as MensagemEntrada[])
      .slice(-MAX_HISTORICO)
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let iteracao = 0; iteracao < MAX_ITERACOES; iteracao++) {
    let resultadoChamada;
    try {
      resultadoChamada = await chatCompletion({
        model: "gpt-4o-mini",
        mensagens: historico,
        tools: FERRAMENTAS_OPENAI,
        toolChoice: "auto",
        temperature: 0.2,
        maxTokens: 700,
        telemetria: { clienteId: null, gratuito: false, skill: "assistente-admin" },
      });
    } catch (e) {
      console.error("[AssistenteAdmin] Erro ao chamar IA:", e);
      return NextResponse.json({ tipo: "resposta", texto: "Erro ao consultar a IA — tenta de novo em instantes." });
    }

    const { conteudo, toolCalls, finishReason } = resultadoChamada;

    if (finishReason !== "tool_calls" || !toolCalls || toolCalls.length === 0) {
      return NextResponse.json({ tipo: "resposta", texto: conteudo || "Não consegui gerar uma resposta pra isso." });
    }

    const chamada = toolCalls[0];
    const definicao = REGISTRO_FERRAMENTAS[chamada.function.name];
    if (!definicao) {
      return NextResponse.json({ tipo: "resposta", texto: "Não reconheço essa ação — pode reformular o pedido?" });
    }

    let argumentos: Record<string, unknown>;
    try {
      argumentos = JSON.parse(chamada.function.arguments || "{}");
    } catch {
      return NextResponse.json({ tipo: "resposta", texto: "Recebi um comando com formato inválido — tenta de novo?" });
    }

    if (definicao.tipo === "escrita") {
      const validado = await definicao.validarEResumir(argumentos);
      if (!validado.ok) {
        // Erro de validação volta pro modelo como resultado da tool, não
        // pro usuário direto — dá chance dele corrigir (ex: chamar
        // buscar_cliente de novo) em vez de travar a conversa.
        historico.push({ role: "assistant", content: null, tool_calls: [chamada] });
        historico.push({ role: "tool", tool_call_id: chamada.id, content: JSON.stringify({ erro: validado.erro }) });
        continue;
      }
      return NextResponse.json({
        tipo: "confirmacao",
        ferramenta: chamada.function.name,
        argumentos,
        resumo: validado.resumo,
      });
    }

    let resultado: unknown;
    try {
      resultado = await definicao.executar(argumentos);
    } catch (e) {
      resultado = { erro: e instanceof Error ? e.message : "Erro ao consultar dado." };
    }

    historico.push({ role: "assistant", content: null, tool_calls: [chamada] });
    historico.push({ role: "tool", tool_call_id: chamada.id, content: JSON.stringify(resultado) });
  }

  return NextResponse.json({ tipo: "resposta", texto: "Essa pergunta ficou complexa demais pra eu responder agora — tenta ser mais específico?" });
}
