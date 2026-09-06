// ─────────────────────────────────────────
// QuitaZAP — Bot de Vendas
// Funil: Instagram/Facebook Ads → WhatsApp → CAKTO
// ─────────────────────────────────────────
// Reposicionado (Ibrahim, 2026-09) de "quitar dívida" pra "controle
// financeiro contínuo" — o produto hoje registra renda/gasto/dívida/meta
// e avisa quando o mês aperta, não gera plano de quitação automático (ver
// ai-bot.ts). A demonstração abaixo reflete isso: mostra o registro pelo
// WhatsApp e o aviso de aperto, nunca uma "previsão de quitação em X meses"
// (isso seria promessa de resultado, que o CDC não deixa e o produto não
// cumpre mais).
//
// Estrutura em 5 momentos (Dor → Demonstração → Diferencial → Objeção →
// CTA), sempre em poucas interações (nunca uma bateria de perguntas antes
// do preço — preço é respondido na hora, sempre que perguntado). Loop de
// objeção: nunca aceita o primeiro "não"/"vou pensar" como resposta final
// — tenta reverter por um ângulo diferente (preço→valor, desconfiança→como
// funciona, "já uso outro app"→diferencial, "vou pensar"→sem pressão) até
// 3 rodadas reais, sem repetir o mesmo argumento, e solta a mão na hora se
// o lead pedir explicitamente pra parar. Sem urgência falsa (nada de "só
// hoje"/contagem regressiva) e sem prometer resultado financeiro garantido
// — decisão de produto: WhatsApp Business API pode banir o número por
// padrão de mensagem insistente/spam, e propaganda enganosa é proibida
// pelo CDC.

import { prisma } from "@/lib/prisma";
import { sendWhatsApp } from "@/lib/zapi";
import type { LeadVendas } from "@prisma/client";
import {
  PRECO_MENSAL,
  RE_PARAR,
  RE_PERGUNTA_PRECO,
  detectaNegativo,
  normalizarTexto,
  decidirRespostaPosOferta,
  REBATIDAS,
} from "@/lib/sales-bot-objecao";

const CAKTO_LINK = "https://pay.cakto.com.br/3fz3gz6_945044";

// ── Mensagens do funil ────────────────────

const SAUDACAO = `Olá! 👋 Aqui é o *QuitaZAP*.

Hoje, o que mais te atrapalha com seu dinheiro? Pode ser não saber pra onde ele vai, esquecer de pagar uma conta, cartão que estoura todo mês, dívida acumulando... me conta o que pesa mais pra você agora.`;

const RECONHECIMENTO_DOR = `Entendi. Isso é super comum — a maioria das pessoas perde o controle do dinheiro sem nem perceber, porque fica tudo espalhado (extrato, papel, memória...). 😉

Deixa eu te mostrar rapidinho como o QuitaZAP ajuda com isso 👇`;

const DEMONSTRACAO = `💬 *É assim que funciona:*

👤 _Você manda:_ "gastei 45 no mercado"
🤖 _QuitaZAP:_ ✅ Gasto registrado — Mercado — R$ 45,00

👤 _Você manda:_ "recebi 3000 de salário"
🤖 _QuitaZAP:_ ✅ Receita registrada — R$ 3.000,00

Sem formulário, sem planilha — só manda por texto, áudio ou foto que eu organizo pra você. 📲`;

const DIFERENCIAL = `E não é só registrar: se em algum momento eu perceber que o mês tá ficando apertado — gasto chegando perto ou passando da sua renda — eu te aviso na hora, com uma dica prática. 🔔

Tudo isso 24h por dia, direto no seu WhatsApp, sem precisar abrir nenhum app.

*Quer começar a usar agora?* 👇`;

function msgCupom(cupom: string): string {
  return `Ah, e tem mais uma coisa: 🎁

Use o cupom *${cupom}* na hora de assinar e garanta desconto na sua primeira mensalidade:

${CAKTO_LINK}`;
}

const ENCERRAMENTO = `Tudo bem, sem problema! Se mudar de ideia, é só me chamar aqui a qualquer hora. 😊

Boa sorte com suas finanças! 🍀`;

function mensagemOferta(): string {
  return `🚀 *QuitaZAP — ${PRECO_MENSAL}/mês*

✅ Registre renda, gastos, contas, cartão e dívidas direto pelo WhatsApp
✅ Aviso automático quando o mês fica apertado
✅ Funciona por texto, áudio ou foto
✅ Cancele quando quiser — sem burocracia

👇 Pra começar agora:
${CAKTO_LINK}`;
}

function mensagemPreco(): string {
  return `O QuitaZAP custa *${PRECO_MENSAL} por mês* — sem contrato, cancela quando quiser.

👉 ${CAKTO_LINK}`;
}

async function talvezEnviarCupom(lead: LeadVendas, telefone: string): Promise<void> {
  if (lead.cupomEnviado) return;
  const cupom = process.env.CAKTO_CUPOM ?? "";
  if (!cupom) return;
  await delay(2500);
  await sendWhatsApp(telefone, msgCupom(cupom));
  await prisma.leadVendas.update({ where: { id: lead.id }, data: { cupomEnviado: true } });
}

// Trata qualquer resposta depois que o preço/CTA já foi mostrado (etapas
// OFERTA e FOLLOWUP) — efeitos colaterais (Prisma/WhatsApp) em cima da
// decisão pura acima.
async function processarRespostaPosOferta(lead: LeadVendas, mensagem: string, telefone: string): Promise<void> {
  const decisao = decidirRespostaPosOferta(lead, mensagem);

  if (decisao.acao === "parar" || decisao.acao === "desistir") {
    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "DESISTIU" } });
    await sendWhatsApp(telefone, ENCERRAMENTO);
    return;
  }

  if (decisao.acao === "responder_preco") {
    await sendWhatsApp(telefone, mensagemPreco());
    return;
  }

  if (decisao.acao === "enviar_link") {
    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "FOLLOWUP" } });
    await sendWhatsApp(telefone, `Show! 🙌 Aqui está o link pra começar agora:\n\n👉 ${CAKTO_LINK}`);
    return;
  }

  // decisao.acao === "rebater"
  const tentativaAtualizada = await prisma.leadVendas.update({
    where: { id: lead.id },
    data: {
      etapa: "FOLLOWUP",
      tentativasObjecao: decisao.novoEstado.tentativasObjecao,
      angulosUsados: decisao.novoEstado.angulosUsados,
    },
  });
  await sendWhatsApp(telefone, REBATIDAS[decisao.angulo]);

  // Cupom real (não é urgência inventada) só entra depois da 2ª rodada de
  // objeção — não no primeiro "não", pra não parecer que o preço já
  // começa negociável.
  if (tentativaAtualizada.tentativasObjecao >= 2) {
    await talvezEnviarCupom(tentativaAtualizada, telefone);
  }
}

// ── Processador principal do lead ─────────

export async function processarLeadVendas(
  telefone: string,
  mensagem: string,
): Promise<void> {
  // Telefone alternativo (com/sem 9 dígito — Z-API pode variar)
  const telefoneAlt = telefone.length === 13
    ? telefone.slice(0, 4) + telefone.slice(5)
    : telefone.length === 12
    ? telefone.slice(0, 4) + "9" + telefone.slice(4)
    : null;

  // Busca lead existente (tenta os dois formatos)
  let lead = await prisma.leadVendas.findFirst({
    where: { telefone: { in: [telefone, ...(telefoneAlt ? [telefoneAlt] : [])] } },
  });
  console.log(`[SALES-BOT] telefone="${telefone}" alt="${telefoneAlt}" lead=${lead ? `found(tel=${lead.telefone}, etapa=${lead.etapa})` : "null"}`);

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

  const norm = normalizarTexto(mensagem);

  // Pergunta de preço antes da oferta é sinal forte de interesse — responde
  // na hora e já mostra o CTA, em vez de fazer o lead esperar terminar a
  // demonstração pra saber o valor.
  if (lead.etapa !== "OFERTA" && lead.etapa !== "FOLLOWUP" && RE_PERGUNTA_PRECO.test(norm)) {
    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "OFERTA" } });
    await sendWhatsApp(telefone, mensagemOferta());
    await agendarFollowup(telefone);
    return;
  }

  // ── Momento 1: DOR — aguardando resposta à pergunta de abertura ──
  if (lead.etapa === "QUALIFICACAO") {
    if (RE_PARAR.test(norm) || detectaNegativo(mensagem)) {
      await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "DESISTIU" } });
      await sendWhatsApp(telefone, ENCERRAMENTO);
      return;
    }

    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "PROVA" } });
    await sendWhatsApp(telefone, RECONHECIMENTO_DOR);
    await delay(1200);
    // ── Momento 2: DEMONSTRAÇÃO ──
    await sendWhatsApp(telefone, DEMONSTRACAO);
    await delay(1800);
    // ── Momento 3: DIFERENCIAL ──
    await sendWhatsApp(telefone, DIFERENCIAL);
    return;
  }

  // ── Lead reagiu à demonstração/diferencial ──
  if (lead.etapa === "PROVA") {
    if (RE_PARAR.test(norm) || detectaNegativo(mensagem)) {
      await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "DESISTIU" } });
      await sendWhatsApp(telefone, ENCERRAMENTO);
      return;
    }

    // ── Momento 5: CTA (preço sempre junto, nunca escondido) ──
    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "OFERTA" } });
    await sendWhatsApp(telefone, mensagemOferta());

    // Agenda follow-up automático via QStash — dispara após 4h de silêncio
    await agendarFollowup(telefone);
    return;
  }

  // ── Momento 4: OBJEÇÃO (e possíveis rodadas seguintes) ──
  if (lead.etapa === "OFERTA" || lead.etapa === "FOLLOWUP") {
    await processarRespostaPosOferta(lead, mensagem, telefone);
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
