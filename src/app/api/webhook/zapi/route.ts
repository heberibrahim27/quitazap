// ─────────────────────────────────────────
// QuitaZAP — Webhook Z-API (mensagens recebidas)
// POST /api/webhook/zapi
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, normalizarTelefone } from "@/lib/zapi";
import { processarMensagemIA, type Mensagem } from "@/lib/ai-bot";
import { gerarRelatorio } from "@/lib/plano";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Ignora mensagens enviadas pelo próprio bot e eventos que não são texto recebido
    if (body.type !== "ReceivedCallback" || body.fromMe === true) {
      return NextResponse.json({ ok: true });
    }

    const mensagem = (body.text?.message ?? "").trim();
    if (!mensagem) return NextResponse.json({ ok: true });

    const rawPhone = body.phone ?? "";
    const telefone = normalizarTelefone(rawPhone);
    console.log(`[Z-API] phone raw="${rawPhone}" normalizado="${telefone}"`);
    if (telefone.length < 10) return NextResponse.json({ ok: true });

    // Busca sessão — tenta formato com e sem dígito 9 extra (Brasil 8→9 dígitos)
    const telefoneAlt = telefone.length === 13
      ? telefone.slice(0, 4) + telefone.slice(5)
      : telefone.length === 12
      ? telefone.slice(0, 4) + "9" + telefone.slice(4)
      : null;

    console.log(`[Z-API] buscando sessão: ${telefone} ou ${telefoneAlt}`);

    const sessao = await prisma.botSessao.findFirst({
      where: { telefone: { in: [telefone, ...(telefoneAlt ? [telefoneAlt] : [])] } }
    });

    console.log(`[Z-API] sessao=${sessao ? `id=${sessao.id} etapa=${sessao.etapa}` : "null"}`);

    // Contato desconhecido — não comprou ainda
    if (!sessao) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "nosso site";
      await sendWhatsApp(
        telefone,
        `Para acessar o QuitaZAP, faça sua assinatura em ${siteUrl}`
      );
      return NextResponse.json({ ok: true });
    }

    // Diagnóstico gerado mas usuário enviou nova mensagem — reativa para atualizar
    if (sessao.etapa === "PLANO_GERADO") {
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: { etapa: "COLETANDO_DIVIDAS" },
      });
      sessao.etapa = "COLETANDO_DIVIDAS";
    }

    // ── Processa com IA ──────────────────────────────────────────
    const historico: Mensagem[] = JSON.parse(sessao.dividasTemp || "[]");

    const resultado = await processarMensagemIA(
      historico,
      mensagem,
      sessao.nome ?? "cliente"
    );

    // Atualiza histórico com a nova mensagem do usuário
    const historicoAtualizado: Mensagem[] = [
      ...historico,
      { role: "user", content: mensagem },
    ];

    // ── IA quer gerar o diagnóstico completo ─────────────────────
    if (resultado.diagnostico) {
      const diag = resultado.diagnostico;

      // Gera o relatório formatado para WhatsApp
      const relatorio = gerarRelatorio(diag);

      // Renda total para salvar no banco
      const rendaTotal = diag.renda?.totalFamiliar ?? diag.renda?.salarioLiquido ?? 0;

      // Salva estado da sessão
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          etapa: "PLANO_GERADO",
          renda: rendaTotal,
          dividasTemp: JSON.stringify([
            ...historicoAtualizado,
            { role: "assistant", content: relatorio },
          ]),
        },
      });

      // Persiste dados no banco de clientes
      if (sessao.clienteId) {
        await prisma.cliente.update({
          where: { id: sessao.clienteId },
          data: { rendaMensal: rendaTotal, statusAtendimento: "PLANO_GERADO" },
        });

        // Salva dívidas
        for (const d of diag.dividas ?? []) {
          await prisma.divida.create({
            data: {
              clienteId: sessao.clienteId,
              credor: d.credor,
              valorTotal: d.saldoAtual ?? d.valorOriginal ?? 0,
              tipo: d.tipo ?? "OUTRO",
              status: d.emAtraso ? "ATIVA" : "ATIVA",
              obs: `${d.parcelasRestantes}x parcelas — via bot QuitaZAP${d.emAtraso ? ` — EM ATRASO${d.diasAtraso ? ` (${d.diasAtraso} dias)` : ""}` : ""}`,
            },
          });
        }

        await prisma.planoEnviado.create({
          data: { clienteId: sessao.clienteId, texto: relatorio },
        });
      }

      // Envia relatório dividido se muito longo (WhatsApp tem limite de ~4000 chars por mensagem)
      if (relatorio.length > 3800) {
        const partes = dividirMensagem(relatorio, 3800);
        for (const parte of partes) {
          await sendWhatsApp(telefone, parte);
          await new Promise((r) => setTimeout(r, 1000)); // intervalo entre mensagens
        }
      } else {
        await sendWhatsApp(telefone, relatorio);
      }

      return NextResponse.json({ ok: true });
    }

    // ── Resposta conversacional normal ───────────────────────────
    await prisma.botSessao.updateMany({
      where: { id: sessao.id },
      data: {
        dividasTemp: JSON.stringify([
          ...historicoAtualizado,
          { role: "assistant", content: resultado.resposta },
        ]),
      },
    });

    await sendWhatsApp(telefone, resultado.resposta);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Z-API] Erro no webhook:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Divide mensagens longas em partes sem quebrar palavras
function dividirMensagem(texto: string, maxChars: number): string[] {
  const partes: string[] = [];
  const linhas = texto.split("\n");
  let atual = "";

  for (const linha of linhas) {
    if ((atual + "\n" + linha).length > maxChars) {
      if (atual) partes.push(atual.trim());
      atual = linha;
    } else {
      atual = atual ? atual + "\n" + linha : linha;
    }
  }

  if (atual.trim()) partes.push(atual.trim());
  return partes;
}
