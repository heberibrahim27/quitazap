// ─────────────────────────────────────────
// QuitaZAP — Webhook Z-API (mensagens recebidas)
// POST /api/webhook/zapi
// Suporta: texto, áudio (Whisper) e imagem (GPT-4o Vision)
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, normalizarTelefone } from "@/lib/zapi";
import { processarMensagemIA, type Mensagem } from "@/lib/ai-bot";
import { gerarRelatorio } from "@/lib/plano";

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
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "nosso site";
      await sendWhatsApp(telefone, `Para acessar o QuitaZAP, faça sua assinatura em ${siteUrl}`);
      return NextResponse.json({ ok: true });
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

    // ── Documento (PDF, etc.) ────────────────
    if (tipoEntrada === "documento") {
      await sendWhatsApp(sessao.telefone, "Recebi um documento, mas ainda não consigo lê-lo. Pode digitar ou me mandar uma foto da parte com os valores?");
      return NextResponse.json({ ok: true });
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

    const resultado = await processarMensagemIA(
      historico,
      mensagem,
      sessao.nome ?? "cliente"
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
    if (qstashToken && siteUrl && sessao.etapa === "COLETANDO_DIVIDAS") {
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
