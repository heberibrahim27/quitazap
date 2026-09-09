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
  ehRecusaClara,
  normalizarTexto,
  decidirRespostaPosOferta,
  REBATIDAS,
  type AnguloObjecao,
} from "@/lib/sales-bot-objecao";
import { classificarObjecaoIA } from "@/lib/sales-bot-ia-classificador";

// Confiança mínima pra aceitar um ângulo que só a IA detectou (nunca
// presente no regex) — abaixo disso, ignora o reforço e segue só com
// regras. Escolhido conservador de propósito: um ângulo extra rebatido à
// toa (falso positivo) é inofensivo (só mais um parágrafo de resposta),
// mas ainda assim não vale adicionar ruído com baixa confiança.
const CONFIANCA_MINIMA_REFORCO_IA = 0.55;

// Camada 1 do plano do Ibrahim (classificador de IA) — só chamada quando
// a mensagem não é um caso óbvio que a Camada 0 (regras duras) já resolve
// sozinha, pra não gastar latência/custo de IA em STOP e pergunta direta
// de preço, que continuam 100% regex antes disso em
// decidirRespostaPosOferta. Nunca lança: em qualquer falha, devolve []
// (segue só com o regex de detectarAngulos).
async function resolverAngulosReforcoIA(mensagem: string): Promise<AnguloObjecao[]> {
  const norm = normalizarTexto(mensagem);
  if (RE_PARAR.test(norm) || RE_PERGUNTA_PRECO.test(norm)) return [];

  const classificacao = await classificarObjecaoIA(mensagem);
  if (!classificacao || classificacao.confianca < CONFIANCA_MINIMA_REFORCO_IA) return [];
  return classificacao.angulos;
}

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

// Histórico completo da conversa do funil (pedido do Ibrahim: painel admin
// pra acompanhar atendimento por lead) — uma linha por mensagem, nunca
// sobrescreve. Falha aqui nunca pode derrubar o funil de vendas em si,
// então só loga o erro e segue (mesma postura de persistirLancamentosControle).
export async function registrarMensagem(leadId: string, direcao: "LEAD" | "BOT", texto: string): Promise<void> {
  try {
    await prisma.mensagemLeadVendas.create({ data: { leadId, direcao, texto } });
  } catch (err) {
    console.error("[SALES-BOT] Erro ao registrar mensagem no histórico:", err);
  }
}

// Envia e já registra no histórico — usado em vez de sendWhatsApp puro em
// toda resposta do bot pro lead, pra nunca esquecer de logar uma mensagem
// nova.
async function enviar(telefone: string, leadId: string, texto: string): Promise<void> {
  await sendWhatsApp(telefone, texto);
  await registrarMensagem(leadId, "BOT", texto);
}

async function talvezEnviarCupom(lead: LeadVendas, telefone: string): Promise<void> {
  if (lead.cupomEnviado) return;
  const cupom = process.env.CAKTO_CUPOM ?? "";
  if (!cupom) return;
  await delay(2500);
  await enviar(telefone, lead.id, msgCupom(cupom));
  await prisma.leadVendas.update({ where: { id: lead.id }, data: { cupomEnviado: true } });
}

// Trata qualquer resposta depois que o preço/CTA já foi mostrado (etapas
// OFERTA e FOLLOWUP) — efeitos colaterais (Prisma/WhatsApp) em cima da
// decisão pura acima.
async function processarRespostaPosOferta(lead: LeadVendas, mensagem: string, telefone: string): Promise<void> {
  const angulosReforcoIA = await resolverAngulosReforcoIA(mensagem);
  const decisao = decidirRespostaPosOferta(lead, mensagem, angulosReforcoIA);

  if (decisao.acao === "parar" || decisao.acao === "desistir") {
    await prisma.leadVendas.update({
      where: { id: lead.id },
      data: { etapa: "DESISTIU", motivoDesistencia: decisao.acao === "parar" ? "OPTOUT" : "OBJECAO_ESGOTADA" },
    });
    await enviar(telefone, lead.id, ENCERRAMENTO);
    return;
  }

  if (decisao.acao === "responder_preco") {
    await enviar(telefone, lead.id, mensagemPreco());
    return;
  }

  if (decisao.acao === "enviar_link") {
    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "FOLLOWUP" } });
    await enviar(telefone, lead.id, `Show! 🙌 Aqui está o link pra começar agora:\n\n👉 ${CAKTO_LINK}`);
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
  // Objeção composta (ex: preço + concorrente na mesma frase) rebate as
  // duas em uma única mensagem, em vez de responder só a primeira e
  // descartar o resto do que o lead disse.
  await enviar(telefone, lead.id, decisao.angulos.map((a) => REBATIDAS[a]).join("\n\n"));

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
    const novoLead = await prisma.leadVendas.create({
      data: { telefone, etapa: "QUALIFICACAO", msgCount: 1 },
    });
    await registrarMensagem(novoLead.id, "LEAD", mensagem);
    await enviar(telefone, novoLead.id, SAUDACAO);
    return;
  }

  // Incrementa contador
  lead = await prisma.leadVendas.update({
    where: { id: lead.id },
    data: { msgCount: { increment: 1 } },
  });

  // Registra a mensagem do lead ANTES de qualquer outra coisa — mesmo se o
  // lead já estiver encerrado (linha abaixo), pra o histórico mostrar que
  // ele ainda mandou algo depois do funil ter parado.
  await registrarMensagem(lead.id, "LEAD", mensagem);

  // Lead já encerrado — ignora novas mensagens
  if (lead.etapa === "CONVERTIDO" || lead.etapa === "DESISTIU") return;

  const norm = normalizarTexto(mensagem);

  // Pergunta de preço antes da oferta é sinal forte de interesse — responde
  // na hora e já mostra o CTA, em vez de fazer o lead esperar terminar a
  // demonstração pra saber o valor.
  if (lead.etapa !== "OFERTA" && lead.etapa !== "FOLLOWUP" && RE_PERGUNTA_PRECO.test(norm)) {
    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "OFERTA" } });
    await enviar(telefone, lead.id, mensagemOferta());
    // agendarFollowup() removido daqui também — ver comentário acima.
    return;
  }

  // ── Momento 1: DOR — aguardando resposta à pergunta de abertura ──
  if (lead.etapa === "QUALIFICACAO") {
    if (RE_PARAR.test(norm) || ehRecusaClara(mensagem)) {
      await prisma.leadVendas.update({
        where: { id: lead.id },
        data: { etapa: "DESISTIU", motivoDesistencia: RE_PARAR.test(norm) ? "OPTOUT" : "RECUSOU" },
      });
      await enviar(telefone, lead.id, ENCERRAMENTO);
      return;
    }

    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "PROVA" } });
    await enviar(telefone, lead.id, RECONHECIMENTO_DOR);
    await delay(1200);
    // ── Momento 2: DEMONSTRAÇÃO ──
    await enviar(telefone, lead.id, DEMONSTRACAO);
    await delay(1800);
    // ── Momento 3: DIFERENCIAL ──
    await enviar(telefone, lead.id, DIFERENCIAL);
    return;
  }

  // ── Lead reagiu à demonstração/diferencial ──
  if (lead.etapa === "PROVA") {
    if (RE_PARAR.test(norm) || ehRecusaClara(mensagem)) {
      await prisma.leadVendas.update({
        where: { id: lead.id },
        data: { etapa: "DESISTIU", motivoDesistencia: RE_PARAR.test(norm) ? "OPTOUT" : "RECUSOU" },
      });
      await enviar(telefone, lead.id, ENCERRAMENTO);
      return;
    }

    // ── Momento 5: CTA (preço sempre junto, nunca escondido) ──
    await prisma.leadVendas.update({ where: { id: lead.id }, data: { etapa: "OFERTA" } });
    await enviar(telefone, lead.id, mensagemOferta());

    // Follow-up automático de 4h REMOVIDO (09/09/2026, decisão do Ibrahim
    // pós-incidente de spam): não mandamos mais nenhuma mensagem por
    // iniciativa nossa — só respondemos quem escreve primeiro. Ver
    // agendarFollowup() abaixo (mantida sem uso, desligada nas duas
    // chamadas) e /api/cron/lead-followup (desativada).
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

// agendarFollowup() removida (09/09/2026) — agendava, via QStash, um
// contato por iniciativa nossa 4h depois da oferta. Decisão do Ibrahim
// pós-incidente de spam: só respondemos quem escreve primeiro, nunca mais
// iniciamos contato. Ver /api/cron/lead-followup (desativada) e os dois
// pontos acima que chamavam essa função.

// ── Util ──────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
