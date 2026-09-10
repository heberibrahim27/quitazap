import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { ChatClient } from "./ChatClient";

export const dynamic = "force-dynamic";

// Só nessa rota: sem isso, o iOS Safari mantém o layout viewport do
// tamanho inteiro da tela quando o teclado abre (só o "visual viewport"
// encolhe) e em vez disso rola/pan a página pra manter o campo focado
// visível — é exatamente isso que fazia o cabeçalho e o campo pularem pro
// topo da tela com um vão vazio embaixo em vez de ancorar acima do
// teclado (2 prints reais do Ibrahim em iPhone, 10/09/2026), porque
// elementos position:fixed (nosso .mc-chat-shell) ficam instáveis durante
// essa transição só-visual. "resizes-content" faz o navegador encolher o
// layout viewport de verdade, o que elimina o pan/scroll nativo e faz os
// elementos fixos se comportarem. Só a interactiveWidget muda aqui — o
// resto (width/initialScale/viewportFit) continua herdado do layout raiz.
export const viewport: Viewport = {
  interactiveWidget: "resizes-content",
};

// Chat nativo — Fase 1 (docs/chat-nativo-arquitetura.md). Mesma engine do
// WhatsApp (rescue ladder do ai-bot.ts, canal-agnóstico), memória
// compartilhada via BotSessao (ver controle-orquestrador.ts).
export default async function ChatPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const mensagens = await prisma.mensagemChat.findMany({
    where: { clienteId: cliente.id },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });

  return (
    <ChatClient
      mensagensIniciais={mensagens.reverse().map((m) => ({
        id: m.id,
        direcao: m.direcao as "CLIENTE" | "BOT",
        texto: m.texto,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dadosEstruturados: m.dadosEstruturados as any,
      }))}
    />
  );
}
