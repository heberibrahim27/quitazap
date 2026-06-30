// ─────────────────────────────────────────
// QuitaZAP — Cron: Lembretes de Vencimento
// GET /api/cron/lembretes  (roda todo dia às 8h BRT = 11h UTC)
//
// Régua de lembretes — QuitaZAP Receber (Pendencia):
//   D-3 → lembrete 3 dias antes do vencimento
//   D-2 → lembrete 2 dias antes
//   D-1 → lembrete na véspera
//   D+0 → lembrete no dia do vencimento
//   Após vencimento → status atualizado para VENCIDA
//
// Sistema legado (bot conselheiro):
//   Lembretes por diaVencimento das Dividas
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, sendWhatsAppInstancia, normalizarTelefone } from "@/lib/zapi";

// ── Formatação ────────────────────────────

function fmtMoeda(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Bahia",
  });
}

// ── Slots de lembrete (usados em EnvioBot.etapa) ──
// Valores negativos evitam colisão com etapas de cobrança (1, 2, 3…)
const SLOT_D3 = -3; // 3 dias antes
const SLOT_D2 = -2; // 2 dias antes
const SLOT_D1 = -1; // véspera
const SLOT_D0 =  0; // dia do vencimento

// ── Templates de mensagem ─────────────────

function buildMsgLembrete(
  contatoNome: string,
  negocioNome: string,
  descricao: string,
  valor: number,
  vencimento: Date,
  pixChave: string | null,
  mensagemCustom: string | null,
  cabecalho: string,
): string {
  const linhaPix    = pixChave       ? `\n🔑 *Pix:* ${pixChave}` : "";
  const linhaCustom = mensagemCustom ? `\n\n💬 _"${mensagemCustom}"_`  : "";

  return (
    `${cabecalho}\n\n` +
    `📋 *${descricao}*\n` +
    `💰 *Valor:* ${fmtMoeda(valor)}\n` +
    `📅 *Vencimento:* ${fmtData(vencimento)}` +
    linhaPix +
    linhaCustom +
    `\n\n─────────────────\n` +
    `_Cobrança enviada por *${negocioNome}* via QuitaZAP_`
  );
}

function msgD3(nome: string, negocio: string, desc: string, valor: number, venc: Date, pix: string | null, custom: string | null) {
  return buildMsgLembrete(nome, negocio, desc, valor, venc, pix, custom,
    `⏰ *Lembrete — faltam 3 dias!*\n\nOlá, *${nome}*! 👋 Sua cobrança vence em *3 dias*:`);
}

function msgD2(nome: string, negocio: string, desc: string, valor: number, venc: Date, pix: string | null, custom: string | null) {
  return buildMsgLembrete(nome, negocio, desc, valor, venc, pix, custom,
    `📅 *Lembrete — faltam 2 dias!*\n\nOlá, *${nome}*! 👋 Sua cobrança vence em *2 dias*:`);
}

function msgD1(nome: string, negocio: string, desc: string, valor: number, venc: Date, pix: string | null, custom: string | null) {
  return buildMsgLembrete(nome, negocio, desc, valor, venc, pix, custom,
    `⚠️ *Atenção — vence amanhã!*\n\nOlá, *${nome}*! 👋 Sua cobrança vence *amanhã*:`);
}

function msgD0(nome: string, negocio: string, desc: string, valor: number, venc: Date, pix: string | null, custom: string | null) {
  return buildMsgLembrete(nome, negocio, desc, valor, venc, pix, custom,
    `🔔 *Vence hoje!*\n\nOlá, *${nome}*! 👋 Sua cobrança *vence hoje*:`);
}

// ── Handler principal ─────────────────────

export async function GET(req: NextRequest) {
  // Segurança: bearer secret (Vercel injeta automaticamente no Cron)
  const isInternal = req.headers.get("x-internal-call") === "1";
  if (!isInternal) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  const agora = new Date();

  // Intervalos em UTC midnight (vencimentos são armazenados como UTC midnight)
  const hoje = new Date(agora);
  hoje.setUTCHours(0, 0, 0, 0);

  const d1 = new Date(hoje); d1.setUTCDate(hoje.getUTCDate() + 1);
  const d2 = new Date(hoje); d2.setUTCDate(hoje.getUTCDate() + 2);
  const d3 = new Date(hoje); d3.setUTCDate(hoje.getUTCDate() + 3);
  const d4 = new Date(hoje); d4.setUTCDate(hoje.getUTCDate() + 4);

  // ══════════════════════════════════════════════════════
  // SISTEMA NOVO — QuitaZAP Receber (modelo Pendencia)
  // ══════════════════════════════════════════════════════

  let lembretes      = 0;
  let lembreteErros  = 0;
  let vencidasMarcadas = 0;

  try {
    // ── 1. Marcar pendências vencidas ─────────────────────
    const vencidas = await prisma.pendencia.updateMany({
      where: {
        vencimento: { lt: hoje },
        status: {
          notIn: ["PAGA", "PARCIALMENTE_PAGA", "CANCELADA", "VENCIDA", "PAUSADA"],
        },
      },
      data: { status: "VENCIDA" },
    });
    vencidasMarcadas = vencidas.count;
    if (vencidasMarcadas > 0) {
      console.log(`[LEMBRETES] ${vencidasMarcadas} pendência(s) marcada(s) como VENCIDA`);
    }

    // ── 2. Buscar pendências nos próximos 3 dias ──────────
    const pendencias = await prisma.pendencia.findMany({
      where: {
        vencimento:   { gte: hoje, lt: d4 },
        reguaPausada: false,
        status: {
          notIn: [
            "RASCUNHO",
            "PAGA",
            "PARCIALMENTE_PAGA",
            "CANCELADA",
            "PAUSADA",
            "VENCIDA",
            "FALHOU",
          ],
        },
      },
      include: {
        contato: { select: { nome: true, telefone: true } },
        usuario: {
          select: {
            nome:        true,
            wpInstancia: true,
            wpConectado: true,
            configuracoes: { select: { nomeNegocio: true } },
          },
        },
        // Carrega apenas os envios que correspondem aos slots de lembrete
        envios: {
          select: { etapa: true },
          where: { etapa: { in: [SLOT_D3, SLOT_D2, SLOT_D1, SLOT_D0] } },
        },
      },
    });

    console.log(`[LEMBRETES] ${pendencias.length} pendência(s) encontrada(s) no período hoje → D+3`);

    for (const p of pendencias) {
      // Precisa de telefone do contato para enviar
      if (!p.contato?.telefone) continue;

      // Determina em qual slot de dia esse vencimento se encaixa
      let slot: number;
      if (p.vencimento >= d3 && p.vencimento < d4) {
        slot = SLOT_D3;
      } else if (p.vencimento >= d2 && p.vencimento < d3) {
        slot = SLOT_D2;
      } else if (p.vencimento >= d1 && p.vencimento < d2) {
        slot = SLOT_D1;
      } else {
        slot = SLOT_D0;
      }

      // Deduplicação: pula se já enviamos esse slot para essa pendência
      if (p.envios.some((e) => e.etapa === slot)) {
        continue;
      }

      const contatoNome = p.contato.nome;
      const negocioNome = p.usuario.configuracoes?.nomeNegocio ?? p.usuario.nome;
      const telefone    = normalizarTelefone(p.contato.telefone);

      // Monta mensagem conforme slot
      const mensagem =
        slot === SLOT_D3 ? msgD3(contatoNome, negocioNome, p.descricao, p.valor, p.vencimento, p.pixChave, p.mensagemCustom)
        : slot === SLOT_D2 ? msgD2(contatoNome, negocioNome, p.descricao, p.valor, p.vencimento, p.pixChave, p.mensagemCustom)
        : slot === SLOT_D1 ? msgD1(contatoNome, negocioNome, p.descricao, p.valor, p.vencimento, p.pixChave, p.mensagemCustom)
        : msgD0(contatoNome, negocioNome, p.descricao, p.valor, p.vencimento, p.pixChave, p.mensagemCustom);

      try {
        // Evolution API: usa instância por usuário se conectado
        // Z-API: ignora instancia, usa variáveis de ambiente globais
        const instancia = p.usuario.wpConectado ? p.usuario.wpInstancia : null;
        await sendWhatsAppInstancia(telefone, mensagem, instancia);

        // Registra o envio na tabela EnvioBot (deduplicação futura)
        await prisma.envioBot.create({
          data: {
            usuarioId:   p.usuarioId,
            pendenciaId: p.id,
            etapa:       slot,
            mensagem,
            status:      "ENVIADO",
          },
        });

        // Atualiza contadores da pendência
        await prisma.pendencia.update({
          where: { id: p.id },
          data: {
            ultimoEnvio: agora,
            tentativas:  { increment: 1 },
          },
        });

        lembretes++;
        const slotLabel = slot === SLOT_D3 ? "D-3" : slot === SLOT_D2 ? "D-2" : slot === SLOT_D1 ? "D-1" : "D+0";
        console.log(`[LEMBRETES] ✓ [${slotLabel}] id=${p.id} → ${contatoNome} (${telefone})`);
      } catch (err) {
        lembreteErros++;
        console.error(`[LEMBRETES] ✗ id=${p.id} (${contatoNome}):`, err);
      }

      // Pausa entre envios para não sobrecarregar a API do WhatsApp
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (err) {
    console.error("[LEMBRETES] Erro geral (sistema novo):", err);
  }

  // ══════════════════════════════════════════════════════
  // SISTEMA LEGADO — Bot conselheiro (modelo Divida)
  // ══════════════════════════════════════════════════════

  let legadoEnviados = 0;
  const legadoErros: string[] = [];

  try {
    const diaHoje       = agora.getDate();
    const diasVerificar = [diaHoje, diaHoje + 1, diaHoje + 3]; // hoje, amanhã e 3 dias

    const dividas = await prisma.divida.findMany({
      where: {
        status:         "ATIVA",
        diaVencimento:  { in: diasVerificar },
      },
      include: {
        cliente: { include: { botSessoes: { take: 1 } } },
      },
    });

    for (const divida of dividas) {
      const sessao = divida.cliente.botSessoes?.[0];
      if (!sessao?.telefone) continue;

      const diasRestantes = divida.diaVencimento! - diaHoje;
      const nomeCliente   = divida.cliente.nome;
      const valorFmt      = divida.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      let mensagem = "";

      if (diasRestantes === 0) {
        mensagem = `⚠️ *Atenção, ${nomeCliente}!*\n\nHoje é o vencimento do *${divida.credor}* — *R$ ${valorFmt}*.\n\nPague hoje para evitar juros e multa! 💚`;
      } else if (diasRestantes === 1) {
        mensagem = `📅 *Lembrete, ${nomeCliente}!*\n\nAmanhã vence o *${divida.credor}* — *R$ ${valorFmt}*.\n\nJá separou o dinheiro? Pague antes do vencimento! 💚`;
      } else if (diasRestantes === 3) {
        mensagem = `💡 *${nomeCliente}, em 3 dias vence:*\n\n*${divida.credor}* — *R$ ${valorFmt}* (dia ${divida.diaVencimento})\n\nPlaneje-se para não atrasar! 💚`;
      }

      if (!mensagem) continue;

      try {
        await sendWhatsApp(sessao.telefone, mensagem);
        legadoEnviados++;
      } catch (err) {
        legadoErros.push(`${nomeCliente} (${divida.credor}): ${err}`);
      }
    }
  } catch (err) {
    console.error("[LEMBRETES] Erro geral (sistema legado):", err);
  }

  const resumo = {
    ok:              true,
    rodadoEm:        agora.toISOString(),
    // Sistema novo (QuitaZAP Receber)
    lembretes,
    lembreteErros,
    vencidasMarcadas,
    // Sistema legado (bot conselheiro)
    legadoEnviados,
    legadoErros:     legadoErros.length > 0 ? legadoErros : undefined,
  };

  console.log("[LEMBRETES]", resumo);
  return NextResponse.json(resumo);
}
