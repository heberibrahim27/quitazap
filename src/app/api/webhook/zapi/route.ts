// ─────────────────────────────────────────
// QuitaZAP — Webhook Z-API (mensagens recebidas)
// POST /api/webhook/zapi
// Suporta: texto, áudio (Whisper), imagem (GPT-4o Vision) e PDF (pdf-parse)
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, normalizarTelefone } from "@/lib/zapi";
import { processarMensagemIA, type Mensagem } from "@/lib/ai-bot";
import { processarLeadVendas } from "@/lib/sales-bot";
import {
  gerarRelatorio,
  gerarResumoMensal,
  gerarResumoSemana,
  gerarDespesasMes,
  gerarListaComandos,
  calcularTotalParcelas,
} from "@/lib/plano";

// ── Transcrição de áudio via Whisper ─────
async function transcreverAudio(audioUrl: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY!;

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`Falha ao baixar áudio: ${audioRes.status}`);

  const audioBuffer = await audioRes.arrayBuffer();
  const contentType = audioRes.headers.get("content-type") || "audio/ogg";
  const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("mpeg") ? "mp3" : "ogg";

  const audioBlob = new Blob([audioBuffer], { type: contentType });

  const formData = new FormData();
  formData.append("file", audioBlob, `audio.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("language", "pt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper erro ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.text?.trim() ?? "";
}

// ── Análise de imagem via GPT-4o Vision ──
async function analisarImagem(imageUrl: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY!;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analise esta imagem financeira (pode ser boleto, fatura de cartão, extrato, comprovante de empréstimo, carnê, etc).

Extraia as seguintes informações se presentes:
- Credor / banco / loja
- Valor total da dívida ou da fatura
- Valor da parcela mensal
- Número de parcelas restantes
- Data de vencimento
- Se está em atraso

Responda de forma direta e simples, como se o próprio cliente estivesse descrevendo a dívida em uma conversa. Exemplo:
"Fatura Nubank de R$ 1.500 vencendo dia 15. Mínimo R$ 150."
"Boleto Casas Bahia R$ 350 vence dia 20, em 3x."

Se a imagem NÃO for financeira (foto de pessoa, paisagem, etc), responda apenas: [NAO_FINANCEIRA]`,
            },
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "low" },
            },
          ],
        },
      ],
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPT-4o Vision erro ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ── Leitura de PDF via pdf-parse ─────────
async function extrairTextoPDF(pdfUrl: string): Promise<string> {
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`Falha ao baixar PDF: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  // Importação dinâmica — compatível com CJS e ESM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfMod = await import("pdf-parse") as any;
  const pdfParse = pdfMod.default ?? pdfMod;
  const data = await pdfParse(buffer);
  return data.text?.trim() ?? "";
}

// ── Detecção de comandos rápidos ──────────
function detectarComando(msg: string): string | null {
  // Remove acentos para comparação robusta
  const m = msg
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (/resumo|saldo do mes|resumo do mes|resumo simples/.test(m)) return "RESUMO_MES";
  if (/despesas? do mes|quanto devo por mes|minhas despesas/.test(m)) return "DESPESAS_MES";
  if (/quanto preciso (ganhar|faturar)|receita da semana|preciso ganhar|quanto tenho que ganhar/.test(m)) return "RECEITA_SEMANA";
  if (/posso gastar quanto|quanto posso gastar|quanto sobra essa semana/.test(m)) return "GASTAR_SEMANA";
  if (/^(ajuda|comandos|menu|help|o que voce faz|o que posso perguntar)/.test(m)) return "AJUDA";
  if (/^(resetar|reiniciar|recomecar|comecar de novo|apagar tudo|novo inicio|limpar)/.test(m)) return "RESETAR";
  return null;
}

// ── Deduplicação de mensagens ─────────────
const mensagensProcessadas = new Set<string>();
function jáProcessou(id: string): boolean {
  if (!id) return false;
  if (mensagensProcessadas.has(id)) return true;
  mensagensProcessadas.add(id);
  if (mensagensProcessadas.size > 500) {
    const primeiro = mensagensProcessadas.values().next().value;
    if (primeiro) mensagensProcessadas.delete(primeiro);
  }
  return false;
}

// ── Webhook principal ─────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Ignora mensagens enviadas pelo próprio bot
    if (body.fromMe === true) return NextResponse.json({ ok: true });

    // Ignora duplicatas (Z-API pode enviar o mesmo webhook 2x)
    const msgId = body.messageId ?? body.message?.messageId ?? "";
    if (msgId && jáProcessou(msgId)) {
      console.log(`[Z-API] Duplicata ignorada: ${msgId}`);
      return NextResponse.json({ ok: true });
    }

    // Tipo de entrada: texto, áudio ou imagem
    let mensagem = "";
    let tipoEntrada = "texto";

    if (body.type === "ReceivedCallback") {
      if (body.text?.message) {
        mensagem = body.text.message.trim();
        tipoEntrada = "texto";
      } else if (body.audio?.audioUrl) {
        tipoEntrada = "audio";
      } else if (body.image?.imageUrl) {
        tipoEntrada = "imagem";
      } else if (body.document?.documentUrl) {
        tipoEntrada = "documento";
      }
    }

    if (!mensagem && tipoEntrada === "texto") return NextResponse.json({ ok: true });

    const rawPhone = body.phone ?? "";
    const telefone = normalizarTelefone(rawPhone);
    console.log(`[Z-API] phone raw="${rawPhone}" normalizado="${telefone}" tipo="${tipoEntrada}"`);
    if (telefone.length < 10) return NextResponse.json({ ok: true });

    const telefoneAlt = telefone.length === 13
      ? telefone.slice(0, 4) + telefone.slice(5)
      : telefone.length === 12
      ? telefone.slice(0, 4) + "9" + telefone.slice(4)
      : null;

    const sessao = await prisma.botSessao.findFirst({
      where: { telefone: { in: [telefone, ...(telefoneAlt ? [telefoneAlt] : [])] } }
    });

    console.log(`[Z-API] sessao=${sessao ? `id=${sessao.id} etapa=${sessao.etapa}` : "null"}`);

    if (!sessao) {
      // Verifica se é cliente cadastrado (sem sessão de bot ativa)
      const clienteCadastrado = await prisma.cliente.findFirst({
        where: { telefone: { in: [telefone, ...(telefoneAlt ? [telefoneAlt] : [])] } },
        select: { id: true },
      });

      if (clienteCadastrado) {
        // Cliente existe mas sem sessão bot — provavelmente precisa reativar
        await sendWhatsApp(
          telefone,
          `Olá! 👋 Para reativar seu acesso ao QuitaZAP, entre em contato com o suporte. 😊`
        );
      } else {
        // Número desconhecido → funil de vendas
        // Busca lead existente para garantir que usamos o telefone no formato correto
        const leadExistente = await prisma.leadVendas.findFirst({
          where: { telefone: { in: [telefone, ...(telefoneAlt ? [telefoneAlt] : [])] } },
          select: { telefone: true },
        });
        const telefoneParaFunil = leadExistente?.telefone ?? telefone;
        console.log(`[FUNIL] raw="${rawPhone}" norm="${telefone}" alt="${telefoneAlt}" leadExistente="${leadExistente?.telefone ?? "null"}" → usando="${telefoneParaFunil}"`);
        await processarLeadVendas(telefoneParaFunil, mensagem);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Verifica assinatura vencida (só para clientes pagantes) ──
    if (sessao.clienteId) {
      const clienteAtual = await prisma.cliente.findUnique({
        where: { id: sessao.clienteId },
        select: { assinaturaVenceEm: true, gratuito: true },
      });
      const venceEm = clienteAtual?.assinaturaVenceEm;
      const isGratuito = clienteAtual?.gratuito ?? false;

      if (!isGratuito && venceEm && venceEm < new Date()) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "nosso site";
        await sendWhatsApp(
          telefone,
          `⚠️ Sua assinatura do QuitaZAP venceu em ${venceEm.toLocaleDateString("pt-BR")}.\n\nPara continuar acessando seu plano financeiro, renove pelo link:\n👉 ${siteUrl}\n\nSe já renovou, aguarde alguns minutos e tente novamente. 😊`
        );
        return NextResponse.json({ ok: true });
      }
    }

    // ── Processa áudio ───────────────────────
    if (tipoEntrada === "audio") {
      try {
        await sendWhatsApp(sessao.telefone, "🎤 Recebi seu áudio! Transcrevendo...");
        mensagem = await transcreverAudio(body.audio.audioUrl);
        console.log(`[Z-API] Áudio transcrito: "${mensagem}"`);
        if (!mensagem) {
          await sendWhatsApp(sessao.telefone, "Não consegui entender o áudio. Pode digitar a informação?");
          return NextResponse.json({ ok: true });
        }
      } catch (err) {
        console.error("[Z-API] Erro ao transcrever áudio:", err);
        await sendWhatsApp(sessao.telefone, "Não consegui processar o áudio. Pode digitar a informação?");
        return NextResponse.json({ ok: true });
      }
    }

    // ── Processa imagem ──────────────────────
    if (tipoEntrada === "imagem") {
      try {
        await sendWhatsApp(sessao.telefone, "📷 Recebi sua imagem! Analisando...");
        const analise = await analisarImagem(body.image.imageUrl);
        console.log(`[Z-API] Imagem analisada: "${analise}"`);

        if (!analise || analise.includes("[NAO_FINANCEIRA]")) {
          await sendWhatsApp(sessao.telefone, "Não identifiquei informações financeiras nessa imagem. Pode me descrever a dívida em texto?");
          return NextResponse.json({ ok: true });
        }

        mensagem = analise;
      } catch (err) {
        console.error("[Z-API] Erro ao analisar imagem:", err);
        await sendWhatsApp(sessao.telefone, "Não consegui ler essa imagem. Pode digitar as informações?");
        return NextResponse.json({ ok: true });
      }
    }

    // ── Documento (PDF) ──────────────────────
    if (tipoEntrada === "documento") {
      const docUrl = body.document?.documentUrl ?? body.document?.fileUrl ?? "";
      if (!docUrl) {
        await sendWhatsApp(sessao.telefone, "Recebi um documento, mas não consegui acessar o arquivo. Pode tirar uma foto e me enviar como imagem?");
        return NextResponse.json({ ok: true });
      }
      try {
        await sendWhatsApp(sessao.telefone, "📄 Recebi seu PDF! Lendo o documento...");
        const texto = await extrairTextoPDF(docUrl);
        if (!texto || texto.length < 30) {
          await sendWhatsApp(sessao.telefone, "Consegui abrir o PDF mas ele parece ser uma imagem escaneada — não consigo extrair o texto. Pode tirar uma foto do documento e enviar como imagem? 📷");
          return NextResponse.json({ ok: true });
        }
        console.log(`[Z-API] PDF extraído (${texto.length} chars)`);
        mensagem = `[Cliente enviou um PDF. Conteúdo extraído automaticamente — use esses dados para preencher o diagnóstico financeiro:]\n\n${texto.slice(0, 6000)}`;
        tipoEntrada = "texto";
      } catch (err) {
        console.error("[Z-API] Erro ao ler PDF:", err);
        await sendWhatsApp(sessao.telefone, "Tive dificuldade para ler esse PDF. Pode tirar uma foto e enviar como imagem? 📷");
        return NextResponse.json({ ok: true });
      }
    }

    // ── Comando RESETAR (funciona em qualquer etapa) ──
    if (detectarComando(mensagem) === "RESETAR") {
      if (sessao.clienteId) {
        await prisma.divida.deleteMany({ where: { clienteId: sessao.clienteId } });
        await prisma.planoEnviado.deleteMany({ where: { clienteId: sessao.clienteId } });
        await prisma.cliente.update({
          where: { id: sessao.clienteId },
          data: { statusAtendimento: "NOVO", rendaMensal: null },
        });
      }
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: { etapa: "COLETANDO_DIVIDAS", dividasTemp: "[]", renda: null },
      });
      await sendWhatsApp(telefone,
        `✅ Tudo zerado! Vamos recomeçar do zero.\n\nOi, ${sessao.nome ?? "cliente"}! 😊 Para montar seu novo plano, me conta 3 coisas rápidas:\n\n1️⃣ *Como você trabalha?* CLT, autônomo, MEI, empresário ou freelancer?\n2️⃣ *Qual é seu objetivo principal agora?* Quitar as dívidas, criar reserva ou investir?\n3️⃣ *Você tem dependentes?* Companheiro(a), filhos ou alguém que depende de você?`
      );
      return NextResponse.json({ ok: true });
    }

    // ── Comandos rápidos (responde sem reativar sessão) ──
    const comando = detectarComando(mensagem);
    if (comando && sessao.renda && sessao.renda > 0) {
      const nome = sessao.nome ?? "cliente";
      let resposta = "";

      if (sessao.clienteId) {
        const dividasDB = await prisma.divida.findMany({
          where: { clienteId: sessao.clienteId, status: "ATIVA" },
          select: { credor: true, valorTotal: true, diaVencimento: true, emAtraso: true, obs: true },
        });
        const totalParcelas = calcularTotalParcelas(dividasDB);
        const dividasFormatadas = dividasDB.map((d) => ({
          credor: d.credor,
          valorParcela: calcularTotalParcelas([d]),
          diaVencimento: d.diaVencimento,
          emAtraso: d.emAtraso,
        }));

        switch (comando) {
          case "RESUMO_MES":
            resposta = gerarResumoMensal(nome, sessao.renda, totalParcelas);
            break;
          case "DESPESAS_MES":
            resposta = gerarDespesasMes(dividasFormatadas);
            break;
          case "RECEITA_SEMANA":
            resposta = gerarResumoSemana(nome, sessao.renda, totalParcelas, "receita");
            break;
          case "GASTAR_SEMANA":
            resposta = gerarResumoSemana(nome, sessao.renda, totalParcelas, "gastar");
            break;
          case "AJUDA":
            resposta = gerarListaComandos(nome);
            break;
        }
      } else if (comando === "AJUDA") {
        resposta = gerarListaComandos(nome);
      }

      if (resposta) {
        await sendWhatsApp(telefone, resposta);
        return NextResponse.json({ ok: true });
      }
    }

    // Reativa sessão se plano já gerado
    if (sessao.etapa === "PLANO_GERADO") {
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: { etapa: "COLETANDO_DIVIDAS" },
      });
      sessao.etapa = "COLETANDO_DIVIDAS";
    }

    // ── Processa com IA ──────────────────────
    const historico: Mensagem[] = JSON.parse(sessao.dividasTemp || "[]");

    // Busca se cliente é gratuito para log de IA
    let clienteGratuito = false;
    if (sessao.clienteId) {
      const cli = await prisma.cliente.findUnique({
        where: { id: sessao.clienteId },
        select: { gratuito: true },
      });
      clienteGratuito = cli?.gratuito ?? false;
    }

    const resultado = await processarMensagemIA(
      historico,
      mensagem,
      sessao.nome ?? "cliente",
      sessao.clienteId,
      clienteGratuito
    );

    const historicoAtualizado: Mensagem[] = [
      ...historico,
      { role: "user", content: mensagem },
    ];

    // ── Gera diagnóstico completo ────────────
    if (resultado.diagnostico) {
      const diag = resultado.diagnostico;
      const relatorio = gerarRelatorio(diag);
      const rendaTotal = diag.renda?.totalFamiliar ?? diag.renda?.salarioLiquido ?? 0;

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          etapa: "PLANO_GERADO",
          renda: rendaTotal,
          dividasTemp: JSON.stringify([
            ...historicoAtualizado,
            { role: "assistant", content: relatorio },
          ]),
        },
      });

      if (sessao.clienteId) {
        await prisma.cliente.update({
          where: { id: sessao.clienteId },
          data: { rendaMensal: rendaTotal, statusAtendimento: "PLANO_GERADO" },
        });

        for (const d of diag.dividas ?? []) {
          await prisma.divida.create({
            data: {
              clienteId: sessao.clienteId,
              credor: d.credor,
              valorTotal: d.saldoAtual ?? d.valorOriginal ?? 0,
              tipo: d.tipo ?? "OUTRO",
              status: "ATIVA",
              diaVencimento: d.diaVencimento ?? null,
              emAtraso: d.emAtraso ?? false,
              diasAtraso: d.diasAtraso ?? null,
              obs: `${d.parcelasRestantes}x de R$${d.valorParcela} — via bot QuitaZAP`,
            },
          });
        }

        await prisma.planoEnviado.create({
          data: { clienteId: sessao.clienteId, texto: relatorio },
        });
      }

      if (relatorio.length > 3800) {
        const partes = dividirMensagem(relatorio, 3800);
        for (const parte of partes) {
          await sendWhatsApp(telefone, parte);
          await new Promise((r) => setTimeout(r, 1200));
        }
      } else {
        await sendWhatsApp(telefone, relatorio);
      }

      // Envia lista de comandos como segunda mensagem
      await new Promise((r) => setTimeout(r, 2000));
      await sendWhatsApp(telefone, gerarListaComandos(sessao.nome ?? "cliente"));

      return NextResponse.json({ ok: true });
    }

    // ── Resposta conversacional ──────────────
    await prisma.botSessao.updateMany({
      where: { id: sessao.id },
      data: {
        dividasTemp: JSON.stringify([
          ...historicoAtualizado,
          { role: "assistant", content: resultado.resposta },
        ]),
      },
    });

    await sendWhatsApp(telefone, resultado.resposta);

    // ── Agenda resumo automático via QStash (10 min) ──
    const qstashToken = process.env.QSTASH_TOKEN;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (qstashToken && siteUrl && sessao.etapa !== "PLANO_GERADO") {
      try {
        await fetch(`https://qstash.upstash.io/v2/publish/${siteUrl}/api/cron/resumo`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${qstashToken}`,
            "Content-Type": "application/json",
            "Upstash-Delay": "600s",
          },
          body: JSON.stringify({
            telefone: sessao.telefone,
            agendadoEm: new Date().toISOString(),
          }),
        });
        console.log(`[QSTASH] Resumo agendado para ${sessao.telefone} em 10 min`);
      } catch (err) {
        console.error("[QSTASH] Erro ao agendar resumo:", err);
      }
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[Z-API] Erro no webhook:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function dividirMensagem(texto: string, maxChars: number): string[] {
  const partes: string[] = [];
  const linhas = texto.split("\n");
  let atual = "";

  for (const linha of linhas) {
    if ((atual + "\n" + linha).length > maxChars) {
      if (atual) partes.push(atual.trim());
      atual = linha;
    } else {
      atual = atual ? atual + "\n" + linha : linha;
    }
  }

  if (atual.trim()) partes.push(atual.trim());
  return partes;
}
