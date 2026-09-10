import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { ChatClient } from "./ChatClient";

export const dynamic = "force-dynamic";

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
      nome={cliente.nome.split(" ")[0]}
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
