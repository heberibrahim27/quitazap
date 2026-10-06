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
import { pareceFaturaCartao, processarPrintFatura } from "@/lib/ai/fatura-imagem-flow";
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

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "Fatura Inteligente" por print: segunda leitura (JSON, alta resolução) só
// quando a primeira já indicou fatura de cartão. Reaproveita o mesmo motor do
// PDF (cartão, deduplicação, parcelas futuras). Nunca lança nada aqui — só
// guarda a prévia em BotSessao.faturaCartaoPendente até o cliente confirmar.
async function tratarPrintDeFatura(opts: {
  cliente: Parameters<typeof obterOuCriarSessaoControle>[0] & { gratuito: boolean };
  arquivoBase64: string;
  buffer: Buffer;
  caminhoStorage: string;
}): Promise<{ resposta: string; dadosEstruturados?: unknown } | null> {
  const { cliente } = opts;
  const leitura = await processarPrintFatura({
    clienteId: cliente.id,
    imagem: `data:image/jpeg;base64,${opts.arquivoBase64}`,
    bytes: opts.buffer,
    telemetria: { clienteId: cliente.id, gratuito: cliente.gratuito, skill: "vision-fatura-chat" },
  });
  if (leitura.tipo === "nao_fatura") return null;

  async function responder(texto: string, dadosEstruturados?: unknown) {
    await prisma.mensagemChat.create({
      data: { clienteId: cliente.id, canal: "APP", direcao: "BOT", texto, dadosEstruturados: dadosEstruturados as object | undefined },
    });
    return { resposta: texto, dadosEstruturados };
  }

  if (leitura.tipo === "ja_processada") {
    return responder("📄 Essa fatura já foi processada antes — não lancei de novo.");
  }

  const pendente = leitura.pendente;
  // No chat, compra "parecida" com uma já cadastrada fica de fora (nunca
  // duplica); o cliente lança à parte por texto se for realmente outra.
  const parecidas = pendente.filaAmbiguos.length;
  const lote = { ...pendente, filaAmbiguos: [], indice: 0 };

  if (lote.confirmados.length === 0) {
    const ja = lote.jaCadastradas + parecidas;
    return responder(
      ja > 0
        ? `📄 Li a fatura ${lote.cartaoNome} — as ${ja} compra(s) parcelada(s) já estavam no seu Controle, não lancei de novo.`
        : `📄 Li a fatura ${lote.cartaoNome}, mas não encontrei compra parcelada em aberto pra lançar.`
    );
  }

  const sessao = await obterOuCriarSessaoControle(cliente);
  await prisma.botSessao.updateMany({
    where: { id: sessao.id },
    data: { faturaCartaoPendente: lote as unknown as object },
  });

  const venc = new Date(`${lote.vencimentoFatura}T12:00:00`);
  const proxima = new Date(venc);
  proxima.setMonth(proxima.getMonth() + 1);
  const dadosEstruturados = {
    tipo: "fatura_detectada" as const,
    cartao: lote.cartaoNome,
    vencimento: lote.vencimentoFatura,
    proximaParcela: proxima.toISOString().slice(0, 10),
    ignoradas: lote.jaCadastradas + parecidas,
    itens: lote.confirmados.map((i) => ({
      descricao: i.descricao,
      parcelaAtual: i.parcelaAtual,
      totalParcelas: i.totalParcelas,
      valorParcela: i.valorParcela,
      dataCompra: i.dataCompra ?? null,
    })),
  };
  const total = lote.confirmados.reduce((s, i) => s + i.valorParcela, 0);
  return responder(
    `Li a fatura ${lote.cartaoNome}: ${lote.confirmados.length} compra(s) parcelada(s), ${fmt(total)} por mês nas próximas parcelas. Confere e confirma?`,
    dadosEstruturados
  );
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

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const base64 = buffer.toString("base64");
    const textoExtraido = await analisarImagem(`data:image/jpeg;base64,${base64}`, PROMPT_ANALISE_IMAGEM, {
      clienteId,
      gratuito: cliente.gratuito,
      skill: "vision-chat-nativo",
    });

    const textoNormalizado = normalizarRespostaCompraImagem(textoExtraido.trim());
    const detectado = extrairComprovante(textoNormalizado);

    if (!detectado && pareceFaturaCartao(textoNormalizado)) {
      const respostaFatura = await tratarPrintDeFatura({ cliente, arquivoBase64: base64, buffer, caminhoStorage });
      if (respostaFatura) return NextResponse.json(respostaFatura);
    }

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
