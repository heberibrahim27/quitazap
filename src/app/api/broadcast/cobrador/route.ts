// ─────────────────────────────────────────
// QuitaZAP — Broadcast: aviso do Cobrador
// POST /api/broadcast/cobrador
// Envia mensagem sobre o Cobrador Automático
// para todos os clientes ativos com sessão bot
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp } from "@/lib/zapi";

const MENSAGEM_COBRADOR = `🚀 *Novidade no QuitaZAP!*

Apresentamos o *Cobrador Automático* — agora você pode cobrar seus devedores direto pelo WhatsApp, sem precisar lembrar manualmente!

*Como funciona:*

💬 Me manda uma mensagem assim:
\`Cobrar João, 71999999999, R$500, dia 20\`

E eu cuido do resto:
✅ Agendo a cobrança para o dia certo
📤 Envio automaticamente para o devedor
🔄 Reenvio em +3 e +7 dias se não pagar (tom diferente cada vez)
📋 Registro quem pagou e quem ainda deve

*Outras opções:*
⚡ _"manda agora"_ → envia imediatamente
🔑 _"pix: seu-cpf"_ → inclui sua chave Pix na mensagem
🎤 Funciona por *áudio* também!

📊 Acompanhe tudo em: *www.quitazap.com.br/cobrador*

_Diga *"minhas cobranças"* para ver o status das suas cobranças a qualquer hora!_ 😊`;

export async function POST(req: NextRequest) {
  // Verifica autenticação básica (mesma lógica do cron)
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

  // Parâmetros opcionais do body
  const body = await req.json().catch(() => ({}));
  const mensagemCustom: string | undefined = body.mensagem;
  const mensagem = mensagemCustom ?? MENSAGEM_COBRADOR;
  const telefoneUnico: string | undefined = body.telefone; // se definido, envia só para esse número

  // Se telefone único, envia direto sem buscar clientes
  if (telefoneUnico) {
    try {
      await sendWhatsApp(telefoneUnico, mensagemCustom ?? mensagem);
      return NextResponse.json({ ok: true, enviados: 1, erros: 0, falhas: [] });
    } catch (err) {
      console.error(`[BROADCAST] Erro ao enviar para ${telefoneUnico}:`, err);
      return NextResponse.json({ ok: false, enviados: 0, erros: 1, falhas: [telefoneUnico] });
    }
  }

  // Busca todos os clientes com sessão bot ativa e clienteId (assinantes)
  const sessoes = await prisma.botSessao.findMany({
    where: {
      clienteId: { not: null },
    },
    select: {
      telefone: true,
      nome: true,
      clienteId: true,
      cliente: {
        select: {
          assinaturaVenceEm: true,
          gratuito: true,
        },
      },
    },
  });

  // Filtra só os que têm assinatura ativa ou são gratuitos
  const hoje = new Date();
  const ativos = sessoes.filter((s) => {
    if (!s.cliente) return false;
    if (s.cliente.gratuito) return true;
    if (!s.cliente.assinaturaVenceEm) return true; // sem data = ativo
    return s.cliente.assinaturaVenceEm >= hoje;
  });

  let enviados = 0;
  let erros = 0;
  const falhas: string[] = [];

  for (const s of ativos) {
    try {
      // Personaliza com nome se disponível
      const msgFinal = s.nome
        ? mensagem.replace("🚀 *Novidade no QuitaZAP!*", `Olá, *${s.nome.split(" ")[0]}*! 👋\n\n🚀 *Novidade no QuitaZAP!*`)
        : mensagem;

      await sendWhatsApp(s.telefone, msgFinal);
      enviados++;

      // Pausa de 1s entre envios para não sobrecarregar a API
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      erros++;
      falhas.push(s.telefone);
      console.error(`[BROADCAST] Erro ao enviar para ${s.telefone}:`, err);
    }
  }

  const resumo = {
    ok: true,
    disparadoEm: new Date().toISOString(),
    totalAtivos: ativos.length,
    enviados,
    erros,
    falhas,
  };

  console.log("[BROADCAST COBRADOR]", resumo);
  return NextResponse.json(resumo);
}

// GET retorna preview da mensagem e contagem de destinatários
export async function GET(req: NextRequest) {
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

  const sessoes = await prisma.botSessao.findMany({
    where: { clienteId: { not: null } },
    select: {
      clienteId: true,
      cliente: { select: { assinaturaVenceEm: true, gratuito: true } },
    },
  });

  const hoje = new Date();
  const ativos = sessoes.filter((s) => {
    if (!s.cliente) return false;
    if (s.cliente.gratuito) return true;
    if (!s.cliente.assinaturaVenceEm) return true;
    return s.cliente.assinaturaVenceEm >= hoje;
  });

  return NextResponse.json({
    totalDestinatarios: ativos.length,
    mensagemPreview: MENSAGEM_COBRADOR,
  });
}
