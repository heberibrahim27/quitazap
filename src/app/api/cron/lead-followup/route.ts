// ─────────────────────────────────────────
// QuitaZAP — Follow-up automático de lead
// POST /api/cron/lead-followup
// Disparado via QStash após 4h sem resposta na etapa OFERTA
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp } from "@/lib/zapi";

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

    // Mensagem de reengajamento (tom humano)
    await sendWhatsApp(
      telefone,
      `Oi! 👋 Vi que você passou pelo QuitaZAP mas não finalizou...\n\nEntendo — decisão financeira merece calma mesmo. 😊\n\nMas não queria que você perdesse essa oportunidade de organizar suas dívidas de vez. *O que travou?* Me conta que posso te ajudar!`
    );

    // Envia cupom se configurado
    if (cupom) {
      await new Promise((r) => setTimeout(r, 3000));
      await sendWhatsApp(
        telefone,
        `E olha, tenho um presente pra você! 🎁\n\nUse o cupom *${cupom}* e garanta desconto na sua primeira mensalidade:\n\n👉 ${CAKTO_LINK}\n\nOferta por tempo limitado ⏰`
      );
    }

    console.log(`[LEAD-FOLLOWUP] Follow-up enviado para ${telefone} | cupom: ${cupom || "nenhum"}`);
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[LEAD-FOLLOWUP] Erro:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
