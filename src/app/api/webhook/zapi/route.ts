// ─────────────────────────────────────────
// QuitaZAP — Webhook Z-API (mensagens recebidas)
// POST /api/webhook/zapi
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, normalizarTelefone } from "@/lib/zapi";
import { processarMensagemIA, type Mensagem } from "@/lib/ai-bot";
import { gerarMensagemPlano } from "@/lib/plano";

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
    // Ex: 5571993085436 (13) ↔ 557193085436 (12)
    const telefoneAlt = telefone.length === 13
      ? telefone.slice(0, 4) + telefone.slice(5)   // remove o 9: 5571|9|93085436 → 557193085436
      : telefone.length === 12
      ? telefone.slice(0, 4) + "9" + telefone.slice(4) // adiciona 9: 5571|93085436 → 5571993085436
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
        `Olá! 👋 Para acessar o QuitaZAP, faça sua compra em ${siteUrl} 😊`
      );
      return NextResponse.json({ ok: true });
    }

    // Plano gerado mas usuário enviou nova mensagem — reativa coleta
    if (sessao.etapa === "PLANO_GERADO") {
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: { etapa: "COLETANDO_DIVIDAS" },
      });
      // Atualiza etapa local para cair no fluxo de IA abaixo
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

    // ── IA quer gerar o plano ────────────────────────────────────
    if (resultado.plano) {
      const { dividas, renda } = resultado.plano;

      // Gera o texto do plano
      const planoTexto = gerarMensagemPlano(
        sessao.nome ?? "cliente",
        dividas.map((d) => ({ texto: d.credor, valor: d.valor, parcelas: d.parcelas })),
        renda
      );

      // Salva estado final da sessão
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          etapa: "PLANO_GERADO",
          renda,
          dividasTemp: JSON.stringify([
            ...historicoAtualizado,
            { role: "assistant", content: planoTexto },
          ]),
        },
      });

      // Persiste dados do cliente no banco
      if (sessao.clienteId) {
        await prisma.cliente.update({
          where: { id: sessao.clienteId },
          data: { rendaMensal: renda, statusAtendimento: "PLANO_GERADO" },
        });

        for (const d of dividas) {
          await prisma.divida.create({
            data: {
              clienteId: sessao.clienteId,
              credor: d.credor,
              valorTotal: d.valor,
              tipo: d.tipo,
              status: "ATIVA",
              obs: `${d.parcelas}x — cadastrado via bot`,
            },
          });
        }

        await prisma.planoEnviado.create({
          data: { clienteId: sessao.clienteId, texto: planoTexto },
        });
      }

      await sendWhatsApp(telefone, planoTexto);
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
