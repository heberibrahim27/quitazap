// ─────────────────────────────────────────
// POST /api/quita-score/[contatoId]/enviar
// Gera o PNG do QuitaScore e envia via WhatsApp para o contato
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioId, erroNaoAutenticado } from "@/lib/get-usuario";
import { calcularQuitaScore } from "@/lib/quita-score";
import { normalizarTelefone } from "@/lib/zapi";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ contatoId: string }> },
) {
  const usuarioId = getUsuarioId(req);
  if (!usuarioId) return erroNaoAutenticado();

  const { contatoId } = await params;

  // ── Busca contato + pendências + instância do usuário ──
  const [contato, usuario] = await Promise.all([
    prisma.contatoReceber.findFirst({
      where: { id: contatoId, usuarioId },
      include: {
        pendencias: {
          select: {
            status:    true,
            valor:     true,
            vencimento: true,
            pagoEm:    true,
          },
        },
      },
    }),
    prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { wpInstancia: true, wpConectado: true },
    }),
  ]);

  if (!contato) {
    return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  }

  // ── Calcula score ──────────────────────
  const info = calcularQuitaScore(contato.pendencias);

  // ── Gera PNG via rota GET (chamada interna) ────────────
  // Constrói a URL absoluta da rota de imagem usando o host da requisição
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("host")}`;

  const imageUrl = `${baseUrl}/api/quita-score/${contatoId}`;

  // Faz o fetch interno com o cookie de autenticação
  const cookie = req.headers.get("cookie") ?? "";
  const imageRes = await fetch(imageUrl, {
    headers: { cookie },
  });

  if (!imageRes.ok) {
    return NextResponse.json(
      { error: "Falha ao gerar imagem do score." },
      { status: 500 },
    );
  }

  // Converte buffer → base64 data URL
  // Z-API e Evolution API aceitam "data:image/png;base64,..." no campo image/media
  const arrayBuffer = await imageRes.arrayBuffer();
  const base64      = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl     = `data:image/png;base64,${base64}`;

  // ── Legenda da mensagem ────────────────
  const emojis: Record<string, string> = {
    EXCELENTE: "🟢",
    BOM:       "🟡",
    REGULAR:   "🟠",
    CRÍTICO:   "🔴",
  };
  const emoji = emojis[info.classificacao] ?? "⚪";

  const legenda =
    `${emoji} *QuitaScore de ${contato.nome}*\n` +
    `\n` +
    `📊 Score: *${info.score}/1000* — ${info.classificacao}\n` +
    `✅ Pagas: ${info.pagas}  |  ❌ Vencidas: ${info.vencidas}  |  ⏳ Pendentes: ${info.pendentes}\n` +
    `\n` +
    `_Gerado pelo QuitaZAP_`;

  // ── Envia via WhatsApp ─────────────────
  const telefone = normalizarTelefone(contato.telefone);

  try {
    await enviarImagemWhatsApp(
      telefone,
      dataUrl,
      legenda,
      usuario?.wpInstancia ?? null,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Falha ao enviar WhatsApp: ${msg}` }, { status: 502 });
  }

  return NextResponse.json({
    ok:            true,
    score:         info.score,
    classificacao: info.classificacao,
    telefone,
  });
}

// ── Envia imagem via WhatsApp (suporta Z-API e Evolution API) ──────────────
// Aceita URL pública ou base64 data URL ("data:image/png;base64,...")
async function enviarImagemWhatsApp(
  phone: string,
  imageUrlOrBase64: string,
  caption: string,
  instancia: string | null,
) {
  const PROVIDER = process.env.WHATSAPP_PROVIDER ?? "zapi";

  if (PROVIDER === "evolution") {
    const EVO_URL    = process.env.EVO_URL    ?? "";
    const EVO_APIKEY = process.env.EVO_APIKEY ?? "";
    const inst       = instancia ?? process.env.EVO_INSTANCE ?? "";

    if (!EVO_URL || !inst || !EVO_APIKEY) {
      console.warn("[EVO] Credenciais não configuradas — imagem não enviada.");
      console.log(`[EVO MOCK] Score image para: ${phone}`);
      return;
    }

    const url = `${EVO_URL}/message/sendMedia/${inst}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_APIKEY },
      body: JSON.stringify({
        number:    phone,
        mediatype: "image",
        media:     imageUrlOrBase64,
        caption,
      }),
    });
    if (!res.ok) throw new Error(`Evolution API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  // ── Z-API ────────────────────────────────
  const ZAPI_INSTANCE     = process.env.ZAPI_INSTANCE     ?? "";
  const ZAPI_TOKEN        = process.env.ZAPI_TOKEN        ?? "";
  const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? "";

  if (!ZAPI_INSTANCE || ZAPI_INSTANCE === "SUA_INSTANCIA_AQUI") {
    console.warn("[ZAPI] Credenciais não configuradas — imagem não enviada.");
    console.log(`[ZAPI MOCK] Score image para: ${phone}`);
    return;
  }

  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-image`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ZAPI_CLIENT_TOKEN ? { "Client-Token": ZAPI_CLIENT_TOKEN } : {}),
    },
    body: JSON.stringify({ phone, image: imageUrlOrBase64, caption }),
  });
  if (!res.ok) throw new Error(`Z-API ${res.status}: ${await res.text()}`);
  return res.json();
}

