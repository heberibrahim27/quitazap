// ─────────────────────────────────────────
// QuitaZAP — Chat nativo: envio de foto de comprovante ("Comprovante
// Inteligente", ver docs/chat-nativo-arquitetura.md)
// POST /api/minha-conta/chat/anexo — recebe a foto (já convertida pro
// JPEG no cliente, mesmo padrão de src/app/minha-conta/(protegido)/perfil/
// FotoPerfilForm.tsx), sobe pro Storage privado, manda pro GPT-4o Vision
// (mesmo prompt do webhook, ver @/lib/ai/prompt-imagem) e devolve uma
// prévia pra confirmação — nunca lança nada sozinho.
//
// clienteId sempre resolvido pelo cookie de sessão — nunca aceito do corpo
// da requisição. Upload autenticado + bucket privado + validação de
// tamanho/tipo no servidor (o "accept" do <input> no cliente é só filtro de
// seletor, não protege nada sozinho).
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";
import { obterOuCriarSessaoControle } from "@/lib/controle-orquestrador";
import { subirComprovante } from "@/lib/supabase-storage";
import { analisarImagem } from "@/lib/ai/openai-client";
import { PROMPT_ANALISE_IMAGEM } from "@/lib/ai/prompt-imagem";
import { normalizarRespostaCompraImagem } from "@/lib/gasto-flow";
import type { ComprovanteFotoDetectado } from "@/lib/comprovante-foto-flow";

const TAMANHO_MAX_BYTES = 8 * 1024 * 1024; // igual ao limite do bucket

function extrairComprovante(textoNormalizado: string): { loja: string; valor: number } | null {
  const match = textoNormalizado.match(/^Comprei em (.+), R\$ (\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+)$/);
  if (!match) return null;
  const loja = match[1].trim();
  const valor = parseFloat(match[2].replace(/\./g, "").replace(",", "."));
  if (!loja || !Number.isFinite(valor) || valor <= 0) return null;
  return { loja, valor };
}

export async function POST(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, telefone: true, nome: true, gratuito: true },
  });
  if (!cliente) return erroClienteNaoAutenticado();

  let arquivo: Blob;
  try {
    const formData = await req.formData();
    const campo = formData.get("arquivo");
    if (!(campo instanceof Blob) || campo.size === 0) {
      return NextResponse.json({ error: "Selecione uma foto." }, { status: 400 });
    }
    if (campo.size > TAMANHO_MAX_BYTES) {
      return NextResponse.json({ error: "Foto muito grande (máx. 8MB)." }, { status: 400 });
    }
    arquivo = campo;
  } catch {
    return NextResponse.json({ error: "Não consegui ler a foto enviada." }, { status: 400 });
  }

  try {
    const caminhoStorage = await subirComprovante(clienteId, arquivo);

    const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
    const textoExtraido = await analisarImagem(`data:image/jpeg;base64,${base64}`, PROMPT_ANALISE_IMAGEM, {
      clienteId,
      gratuito: cliente.gratuito,
      skill: "vision-chat-nativo",
    });

    const textoNormalizado = normalizarRespostaCompraImagem(textoExtraido.trim());
    const detectado = extrairComprovante(textoNormalizado);

    if (!detectado) {
      // Mesmo comportamento do webhook pra imagem que não é um recibo de
      // compra reconhecível (boleto, contracheque, foto não-financeira,
      // valor ilegível etc.): nunca finge confiança que não tem — pede pra
      // digitar em vez de arriscar registrar algo errado.
      await prisma.mensagemChat.create({
        data: {
          clienteId,
          canal: "APP",
          direcao: "BOT",
          texto: "Não consegui identificar um valor de compra nessa foto. Me conta o gasto por texto que eu registro certinho.",
        },
      });
      return NextResponse.json({
        resposta: "Não consegui identificar um valor de compra nessa foto. Me conta o gasto por texto que eu registro certinho.",
      });
    }

    const sessao = await obterOuCriarSessaoControle(cliente);
    const pendente: ComprovanteFotoDetectado = {
      loja: detectado.loja,
      valor: detectado.valor,
      textoNormalizado,
      imageUrl: caminhoStorage,
    };
    await prisma.botSessao.updateMany({
      where: { id: sessao.id },
      data: { comprovanteFotoPendente: pendente as unknown as object },
    });

    const dadosEstruturados = { tipo: "comprovante_detectado" as const, loja: detectado.loja, valor: detectado.valor };
    const resposta = `Encontrei essa compra na foto: ${detectado.loja}. Confirma?`;
    await prisma.mensagemChat.create({
      data: { clienteId, canal: "APP", direcao: "BOT", texto: resposta, dadosEstruturados },
    });

    return NextResponse.json({ resposta, dadosEstruturados });
  } catch (err) {
    console.error("[CHAT-ANEXO] Erro ao processar foto:", err);
    return NextResponse.json({ error: "Não consegui processar a foto agora. Tenta de novo em instantes." }, { status: 500 });
  }
}
