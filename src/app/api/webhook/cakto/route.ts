// ─────────────────────────────────────────
// QuitaZAP — Webhook CAKTO
// POST /api/webhook/cakto
// Recebe: purchase_approved, subscription_canceled, etc.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, normalizarTelefone } from "@/lib/zapi";
import { mensagemBoasVindasControle } from "@/lib/onboarding-controle";

function msgBoasVindas(nome: string, oferta: string): string {
  return mensagemBoasVindasControle(nome, oferta);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Valida secret
    const secret = process.env.CAKTO_SECRET;
    if (secret && body.secret !== secret) {
      console.warn("[CAKTO] Secret inválido recebido.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ignora eventos que não sejam compra aprovada
    if (body.event !== "purchase_approved") {
      return NextResponse.json({ ok: true, skipped: body.event });
    }

    const { name, phone, email } = body.data?.customer ?? {};
    const oferta = body.data?.offer?.name ?? "Plano QuitaZAP";

    if (!phone) {
      console.error("[CAKTO] Telefone ausente no payload.");
      return NextResponse.json({ error: "Phone missing" }, { status: 400 });
    }

    const telefone = normalizarTelefone(phone);

    // Vencimento = hoje + 30 dias
    const assinaturaVenceEm = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Cria ou encontra o cliente
    let cliente = await prisma.cliente.findFirst({ where: { telefone } });

    if (!cliente) {
      cliente = await prisma.cliente.create({
        data: {
          nome: name ?? "Cliente",
          telefone,
          email: email ?? null,
          statusAtendimento: "AGUARDANDO_INFORMACOES",
          obs: `Comprou: ${oferta} via CAKTO`,
          assinaturaVenceEm,
        },
      });
    } else {
      // Renova assinatura
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: { statusAtendimento: "AGUARDANDO_INFORMACOES", assinaturaVenceEm },
      });
    }

    const boasVindas = msgBoasVindas(name ?? "cliente", oferta);

    // Histórico inicial: só a mensagem de abertura do bot
    const historicoInicial = JSON.stringify([
      { role: "assistant", content: boasVindas },
    ]);

    // Cria ou reinicia sessão do bot
    await prisma.botSessao.upsert({
      where: { telefone },
      create: {
        telefone,
        clienteId: cliente.id,
        etapa: "CONVERSANDO",
        nome: name ?? cliente.nome,
        dividasTemp: historicoInicial,
      },
      update: {
        clienteId: cliente.id,
        etapa: "CONVERSANDO",
        nome: name ?? cliente.nome,
        dividasTemp: historicoInicial,
        renda: null,
      },
    });

    // Envia boas-vindas no WhatsApp
    await sendWhatsApp(telefone, boasVindas);

    console.log(`[CAKTO] Cliente criado/atualizado: ${telefone} — ${name}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[CAKTO] Erro no webhook:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
