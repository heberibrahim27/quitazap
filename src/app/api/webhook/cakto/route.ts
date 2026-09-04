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

// A Cakto não tem schema de webhook confirmado nesta auditoria (sem acesso
// à documentação deles a partir deste ambiente) — em vez de travar num
// enum fechado que pode não bater com o nome real do evento, classifica
// por padrão de texto. Tolerante a variação de nome (ex: "refunded" vs
// "refund", "subscription_canceled" vs "canceled"), nunca assume "não é
// nada disso" como aprovação.
function classificarStatusCakto(evento: string): string {
  const e = evento.toLowerCase();
  if (e.includes("chargeback")) return "CHARGEBACK";
  if (e.includes("refund")) return "REEMBOLSADA";
  if (e.includes("cancel")) return "CANCELADA";
  if (e.includes("approved") || e.includes("paid") || e === "purchase_approved") return "APROVADA";
  return "DESCONHECIDO";
}

// Best-effort: tenta os nomes de campo mais prováveis pro valor pago.
// NUNCA inventa um número — devolve null se nada bater, e quem consome
// isso (motor DRE admin) trata null como "sem dado real ainda", nunca
// como zero. Unidade (reais vs. centavos) ainda precisa ser confirmada
// contra um payload real da Cakto antes de confiar cegamente neste valor
// pra qualquer cálculo de comissão/imposto.
function extrairValorPago(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const candidatos = [d.amount, d.baseAmount, d.paidAmount, d.value, d.price];
  for (const c of candidatos) {
    if (typeof c === "number" && c > 0) return c;
  }
  return null;
}

function extrairTransacaoId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const candidatos = [d.transactionId, d.id, d.saleId, d.orderId];
  for (const c of candidatos) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
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

    const evento = String(body.event ?? "desconhecido");
    const status = classificarStatusCakto(evento);
    const telefoneBruto = body.data?.customer?.phone as string | undefined;
    const clientePorTelefone = telefoneBruto
      ? await prisma.cliente.findFirst({ where: { telefone: normalizarTelefone(telefoneBruto) }, select: { id: true } })
      : null;

    // Registra TODO evento (payload bruto preservado) — não só aprovação —
    // antes de qualquer outra lógica. Se o resto da função falhar por
    // qualquer motivo, o evento já ficou salvo pra conferência/reprocesso.
    try {
      await prisma.eventoCakto.create({
        data: {
          clienteId: clientePorTelefone?.id ?? null,
          evento,
          status,
          valorPago: extrairValorPago(body.data),
          transacaoId: extrairTransacaoId(body.data),
          payloadBruto: body,
        },
      });
    } catch (e) {
      console.error("[CAKTO] Erro ao registrar EventoCakto:", e);
    }

    // Reembolso/cancelamento/chargeback: expira o acesso imediatamente
    // (em vez de esperar os 30 dias correndo naturalmente) — reaproveita
    // o mesmo campo/checagem de assinatura vencida que já existe no
    // webhook do WhatsApp, não duplica lógica de bloqueio nova.
    if ((status === "REEMBOLSADA" || status === "CANCELADA" || status === "CHARGEBACK") && clientePorTelefone) {
      await prisma.cliente.update({
        where: { id: clientePorTelefone.id },
        data: { assinaturaVenceEm: new Date() },
      });
      console.log(`[CAKTO] ${status}: assinatura expirada imediatamente pro cliente ${clientePorTelefone.id}`);
      return NextResponse.json({ ok: true, status });
    }

    // Ignora qualquer outro evento que não seja compra aprovada (já
    // registrado acima, só não segue pro fluxo de boas-vindas/onboarding).
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
