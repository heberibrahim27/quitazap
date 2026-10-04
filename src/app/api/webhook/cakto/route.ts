// ─────────────────────────────────────────
// QuitaZAP — Webhook CAKTO
// POST /api/webhook/cakto
// Recebe: purchase_approved, subscription_canceled, etc.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, normalizarTelefone, variacoesTelefone } from "@/lib/zapi";
import { mensagemBoasVindasControle } from "@/lib/onboarding-controle";
import { urlPrimeiroAcesso } from "@/lib/primeiro-acesso";

function msgBoasVindas(nome: string, oferta: string, linkAcesso?: string): string {
  return mensagemBoasVindasControle(nome, oferta, linkAcesso);
}

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

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

    // Valida secret — falha fechado: sem CAKTO_SECRET configurada, nunca
    // aceita por omissão (achado de auditoria: antes, sem a env setada,
    // qualquer evento forjado era aceito como compra aprovada).
    const secret = process.env.CAKTO_SECRET;
    if (!secret) {
      console.error("[CAKTO] CAKTO_SECRET não configurado — recusando webhook.");
      return NextResponse.json({ error: "CAKTO_SECRET não configurado" }, { status: 500 });
    }
    if (body.secret !== secret) {
      console.warn("[CAKTO] Secret inválido recebido.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const evento = String(body.event ?? "desconhecido");
    const status = classificarStatusCakto(evento);
    const telefoneBruto = body.data?.customer?.phone as string | undefined;
    const clientePorTelefone = telefoneBruto
      ? await prisma.cliente.findFirst({
          where: { telefone: { in: variacoesTelefone(normalizarTelefone(telefoneBruto)) } },
          select: { id: true },
        })
      : null;

    // Registra TODO evento (payload bruto preservado) — não só aprovação —
    // antes de qualquer outra lógica. Se o resto da função falhar por
    // qualquer motivo, o evento já ficou salvo pra conferência/reprocesso.
    //
    // transacaoId é @unique no schema: se a Cakto reenviar o mesmo evento
    // (retry de webhook), esse create falha por violação de constraint —
    // é assim que detectamos duplicata e paramos antes de renovar
    // assinatura ou reenviar boas-vindas de novo pro mesmo pagamento.
    const transacaoId = extrairTransacaoId(body.data);
    let eventoJaProcessado = false;
    try {
      await prisma.eventoCakto.create({
        data: {
          clienteId: clientePorTelefone?.id ?? null,
          evento,
          status,
          valorPago: extrairValorPago(body.data),
          transacaoId,
          payloadBruto: body,
        },
      });
    } catch (e) {
      if (transacaoId && (await prisma.eventoCakto.findUnique({ where: { transacaoId } }))) {
        eventoJaProcessado = true;
        console.log(`[CAKTO] Evento duplicado ignorado (transacaoId=${transacaoId} já processado).`);
      } else {
        console.error("[CAKTO] Erro ao registrar EventoCakto:", e);
      }
    }

    if (eventoJaProcessado) {
      return NextResponse.json({ ok: true, duplicate: true });
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
    const agora = Date.now();

    // Cria ou encontra o cliente (com/sem o 9 extra — mesmo critério do
    // login, pra não duplicar cadastro por diferença de formato do número).
    let cliente = await prisma.cliente.findFirst({ where: { telefone: { in: variacoesTelefone(telefone) } } });

    if (!cliente) {
      cliente = await prisma.cliente.create({
        data: {
          nome: name ?? "Cliente",
          telefone,
          email: email ?? null,
          statusAtendimento: "AGUARDANDO_INFORMACOES",
          obs: `Comprou: ${oferta} via CAKTO`,
          // Vencimento = hoje + 30 dias
          assinaturaVenceEm: new Date(agora + TRINTA_DIAS_MS),
        },
      });
    } else {
      // Renova a partir do vencimento atual quando ainda está no futuro —
      // pagar antes da hora não pode comer os dias que já estavam pagos.
      const baseRenovacao =
        cliente.assinaturaVenceEm && cliente.assinaturaVenceEm.getTime() > agora
          ? cliente.assinaturaVenceEm.getTime()
          : agora;
      cliente = await prisma.cliente.update({
        where: { id: cliente.id },
        data: {
          statusAtendimento: "AGUARDANDO_INFORMACOES",
          assinaturaVenceEm: new Date(baseRenovacao + TRINTA_DIAS_MS),
        },
      });
    }

    // Link pra criar a senha do site só quando o cliente ainda não tem uma —
    // renovação de quem já entra normalmente não recebe link de novo.
    const linkAcesso = cliente.senhaHash ? undefined : urlPrimeiroAcesso(cliente.id, null);
    const boasVindas = msgBoasVindas(name ?? "cliente", oferta, linkAcesso);

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

    // Envia boas-vindas no WhatsApp. Falha aqui (número bloqueado, instância
    // desconectada) NÃO pode derrubar o webhook: o cliente já pagou e já foi
    // criado, e a Cakto reenviar o evento não reprocessa (transacaoId é
    // único) — devolver erro só deixaria o cliente sem nada. Em vez disso,
    // grava um aviso no cadastro (visível em /clientes) pro fundador mandar
    // o link manualmente (seção "Link de acesso" em /clientes/[id]/editar).
    let boasVindasEnviada = true;
    try {
      await sendWhatsApp(telefone, boasVindas);
    } catch (e) {
      boasVindasEnviada = false;
      console.error("[CAKTO] Cliente criado, mas o WhatsApp de boas-vindas falhou:", e);
      const aviso = `[${new Date(agora).toISOString().slice(0, 10)}] Boas-vindas NÃO enviada por WhatsApp — mandar o link de acesso manualmente.`;
      await prisma.cliente
        .update({ where: { id: cliente.id }, data: { obs: cliente.obs ? `${cliente.obs}\n${aviso}` : aviso } })
        .catch((err) => console.error("[CAKTO] Não consegui gravar o aviso no cadastro:", err));
    }

    console.log(`[CAKTO] Cliente criado/atualizado: ${telefone} — ${name}`);
    return NextResponse.json({ ok: true, boasVindasEnviada });
  } catch (err) {
    console.error("[CAKTO] Erro no webhook:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
