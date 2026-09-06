// ─────────────────────────────────────────
// QuitaZAP — Follow-up automático de lead
// POST /api/cron/lead-followup
// Disparado via QStash após 4h sem resposta na etapa OFERTA
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp } from "@/lib/zapi";
import { registrarMensagem } from "@/lib/sales-bot";

const CAKTO_LINK = "https://pay.cakto.com.br/3fz3gz6_945044";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const telefone = body.telefone as string;

    if (!telefone) return NextResponse.json({ ok: false, erro: "telefone ausente" });

    const lead = await prisma.leadVendas.findUnique({ where: { telefone } });

    // Só dispara se o lead ainda estiver aguardando (etapa OFERTA = não respondeu)
    if (!lead || lead.etapa !== "OFERTA") {
      console.log(`[LEAD-FOLLOWUP] Pulado — etapa atual: ${lead?.etapa ?? "não encontrado"}`);
      return NextResponse.json({ ok: true, skipped: true });
    }

    const cupom = process.env.CAKTO_CUPOM ?? "";

    // Atualiza etapa
    await prisma.leadVendas.update({
      where: { id: lead.id },
      data: { etapa: "FOLLOWUP", cupomEnviado: !!cupom },
    });

    // Mensagem de reengajamento — reescrita (2026-09) pra bater com o
    // reposicionamento de sales-bot.ts (controle financeiro contínuo, não
    // "quitar dívida") e sem urgência falsa (o texto antigo tinha "Oferta
    // por tempo limitado ⏰" numa oferta que não tem prazo nenhum de
    // verdade — exatamente o que o CDC proíbe e o resto do funil evita).
    const mensagemReengajamento =
      `Oi! 👋 Vi que você passou pelo QuitaZAP mas ainda não começou a usar.\n\nSem pressa nenhuma — decisão que envolve dinheiro merece calma. 😊\n\nSó queria saber: *o que ficou te travando?* Me conta que te ajudo a decidir.`;
    await sendWhatsApp(telefone, mensagemReengajamento);
    await registrarMensagem(lead.id, "BOT", mensagemReengajamento);

    // Envia cupom se configurado
    if (cupom) {
      await new Promise((r) => setTimeout(r, 3000));
      const mensagemCupom =
        `E olha, tenho um presente pra você! 🎁\n\nUse o cupom *${cupom}* e garanta desconto na sua primeira mensalidade:\n\n👉 ${CAKTO_LINK}`;
      await sendWhatsApp(telefone, mensagemCupom);
      await registrarMensagem(lead.id, "BOT", mensagemCupom);
    }

    console.log(`[LEAD-FOLLOWUP] Follow-up enviado para ${telefone} | cupom: ${cupom || "nenhum"}`);
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[LEAD-FOLLOWUP] Erro:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
