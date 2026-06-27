// ─────────────────────────────────────────
// QuitaZAP — Bot de Vendas
// Funil: Instagram/Facebook Ads → WhatsApp → CAKTO
// ─────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { sendWhatsApp, sendWhatsAppImage } from "@/lib/zapi";

const SITE_URL   = process.env.NEXT_PUBLIC_SITE_URL ?? "https://quitazap.com.br";
const CAKTO_LINK = "https://pay.cakto.com.br/3fz3gz6_945044";

// ── Mensagens do funil ────────────────────

const SAUDACAO = `Olá! 👋

Aqui é o *QuitaZAP* — o assistente que organiza suas dívidas pelo WhatsApp usando Inteligência Artificial. 🤖💚

Você chegou até aqui porque quer organizar suas finanças, certo?

*Você tem dívidas para organizar?* Responde sim ou não 👇`;

const QUALIFICACAO = `Entendi! Você não está sozinho(a) nisso. 😊

Milhares de brasileiros estão na mesma situação — e o QuitaZAP foi criado exatamente para isso.

A ideia é simples: você me conta suas dívidas aqui no WhatsApp — pode ser por texto, áudio ou até *foto do boleto* — e nossa IA cria um *plano de quitação personalizado* pra você.

Deixa eu te mostrar como funciona na prática 👇`;

const PROVA_LEGENDA_1 = `💬 *Veja como é simples*

Você manda suas dívidas no chat e o bot organiza tudo automaticamente — sem planilha, sem complicação.`;

const PROVA_LEGENDA_2 = `📋 *Plano de quitação gerado em minutos*

O QuitaZAP calcula a melhor ordem de pagamento com base na sua renda e prioriza as dívidas mais urgentes.`;

const PROVA_CHAMADA = `Tudo isso disponível *24h por dia*, direto no seu WhatsApp. Sem precisar instalar nada. 📱

Você pode perguntar a qualquer hora:
📊 _"Qual meu saldo devedor total?"_
📅 _"Quanto preciso pagar essa semana?"_
💰 _"Quanto sobra do meu salário?"_

*Quer ter seu plano personalizado agora?* 👇`;

const OFERTA = `🚀 *QuitaZAP — R$ 47/mês*

✅ Plano de quitação personalizado por IA
✅ Funciona 24h no seu WhatsApp
✅ Manda dívidas por texto, áudio ou foto de boleto
✅ Relatórios e resumos automáticos
✅ Cancele quando quiser — sem burocracia

Por apenas *R$ 47 por mês* — menos que uma conta de streaming — você tem um consultor financeiro no bolso.

👇 *Assine agora e comece hoje:*
${CAKTO_LINK}`;

const FOLLOWUP = `Ficou com alguma dúvida? Me conta que eu te ajudo! 😊

Muita gente pensa que é complicado, mas é tudo pelo WhatsApp mesmo — igual a essa conversa aqui. 💬

*O que ficou faltando saber?*`;

function msgCupom(cupom: string): string {
  return `Espera! 🎁 Tenho uma condição especial para você.

Preparamos um *cupom de desconto* exclusivo:

👉 Use o cupom *${cupom}* na hora de assinar e garanta seu desconto!

${CAKTO_LINK}

Oferta por tempo limitado ⏰`;
}

const ENCERRAMENTO = `Tudo bem! Se mudar de ideia, pode me chamar aqui a qualquer hora. 😊

Boa sorte nas suas finanças! 🍀`;

const ULTIMA_CHANCE = `Aqui está o link mais uma vez, caso mude de ideia:

👉 ${CAKTO_LINK}

Qualquer dúvida, pode me chamar! 😊`;

// ── Detecção de intenção ──────────────────

function detectaPositivo(msg: string): boolean {
  const m = msg
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return /\b(sim|s|quero|tenho|claro|pode|vamos|bora|to dentro|to|tô|ok|oba|isso|queria|preciso|ajuda|show|vai|top|legal|gostei|perfeito|exato|verdade|1)\b/.test(m);
}

function detectaNegativo(msg: string): boolean {
  const m = msg
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return /\b(nao|n|nope|agora nao|depois|nao quero|obrigad[ao]|tchau|ate logo|flw|bye|2|nope|nn|nein)\b/.test(m);
}

// ── Processador principal do lead ─────────

export async function processarLeadVendas(
  telefone: string,
  mensagem: string,
): Promise<void> {
  // Busca lead existente
  let lead = await prisma.leadVendas.findUnique({ where: { telefone } });

  // ── Novo contato: cria lead e envia boas-vindas ──
  if (!lead) {
    await prisma.leadVendas.create({
      data: { telefone, etapa: "QUALIFICACAO", msgCount: 1 },
    });
    await sendWhatsApp(telefone, SAUDACAO);
    return;
  }

  // Incrementa contador
  lead = await prisma.leadVendas.update({
    where: { id: lead.id },
    data: { msgCount: { increment: 1 } },
  });

  // Lead já encerrado — ignora novas mensagens
  if (lead.etapa === "CONVERTIDO" || lead.etapa === "DESISTIU") return;

  // ── Etapa: QUALIFICACAO ──────────────────
  // Aguardando resposta: "tem dívidas?"
  if (lead.etapa === "QUALIFICACAO") {
    if (detectaNegativo(mensagem)) {
      await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "DESISTIU" } });
      await sendWhatsApp(telefone, ENCERRAMENTO);
      return;
    }
    // Resposta positiva ou qualquer coisa → avança
    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "PROVA" } });
    await sendWhatsApp(telefone, QUALIFICACAO);
    await delay(1500);
    await sendWhatsAppImage(
      telefone,
      `${SITE_URL}/api/vendas/conversa`,
      PROVA_LEGENDA_1,
    );
    await delay(2000);
    await sendWhatsAppImage(
      telefone,
      `${SITE_URL}/api/vendas/plano`,
      PROVA_LEGENDA_2,
    );
    await delay(2000);
    await sendWhatsApp(telefone, PROVA_CHAMADA);
    return;
  }

  // ── Etapa: PROVA ─────────────────────────
  // Aguardando reação às imagens
  if (lead.etapa === "PROVA") {
    if (detectaNegativo(mensagem)) {
      await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "DESISTIU" } });
      await sendWhatsApp(telefone, ENCERRAMENTO);
      return;
    }
    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "OFERTA" } });
    await sendWhatsApp(telefone, OFERTA);

    // Agenda follow-up automático via QStash — dispara após 4h de silêncio
    await agendarFollowup(telefone);
    return;
  }

  // ── Etapa: OFERTA ────────────────────────
  // Lead respondeu após receber link → follow-up + cupom (se configurado)
  if (lead.etapa === "OFERTA") {
    const cupom = process.env.CAKTO_CUPOM ?? "";
    await prisma.leadVendas.update({
      where: { id: lead.id },
      data: { etapa: "FOLLOWUP", cupomEnviado: !!cupom },
    });
    await sendWhatsApp(telefone, FOLLOWUP);
    if (cupom) {
      await delay(3000);
      await sendWhatsApp(telefone, msgCupom(cupom));
    }
    return;
  }

  // ── Etapa: FOLLOWUP ──────────────────────
  // Última tentativa com link
  if (lead.etapa === "FOLLOWUP") {
    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "DESISTIU" } });
    await sendWhatsApp(telefone, ULTIMA_CHANCE);
    return;
  }
}

// ── Marca lead como convertido (chamado pelo webhook da CAKTO) ──
export async function converterLead(telefone: string): Promise<void> {
  await prisma.leadVendas.updateMany({
    where: { telefone },
    data: { etapa: "CONVERTIDO" },
  });
}

// ── Agenda follow-up automático via QStash (4h) ──
async function agendarFollowup(telefone: string): Promise<void> {
  const qstashToken = process.env.QSTASH_TOKEN;
  const siteUrl     = process.env.NEXT_PUBLIC_SITE_URL;
  if (!qstashToken || !siteUrl) return;

  try {
    await fetch(`https://qstash.upstash.io/v2/publish/${siteUrl}/api/cron/lead-followup`, {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${qstashToken}`,
        "Content-Type":   "application/json",
        "Upstash-Delay":  "14400s", // 4 horas
      },
      body: JSON.stringify({ telefone, agendadoEm: new Date().toISOString() }),
    });
    console.log(`[LEAD-FOLLOWUP] Follow-up agendado para ${telefone} em 4h`);
  } catch (err) {
    console.error("[LEAD-FOLLOWUP] Erro ao agendar:", err);
  }
}

// ── Util ──────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
