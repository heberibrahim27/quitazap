// ─────────────────────────────────────────
// QuitaZAP — Diagnóstico TEMPORÁRIO (09/09/2026, Ibrahim reportou que o bot
// não responde números diferentes do dele) — checa direto na Z-API qual
// número de telefone está de fato conectado à instância usada pelo
// sendWhatsApp, sem expor token nenhum na resposta. Só leitura (GET),
// nenhum efeito colateral. Remover depois de diagnosticar.
// ─────────────────────────────────────────

import { NextResponse } from "next/server";

export async function GET() {
  const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE ?? "";
  const ZAPI_TOKEN = process.env.ZAPI_TOKEN ?? "";
  const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? "";

  if (!ZAPI_INSTANCE || ZAPI_INSTANCE === "SUA_INSTANCIA_AQUI") {
    return NextResponse.json({ ok: false, erro: "ZAPI_INSTANCE não configurada" });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(ZAPI_CLIENT_TOKEN ? { "Client-Token": ZAPI_CLIENT_TOKEN } : {}),
  };

  const base = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;

  async function chamar(caminho: string) {
    try {
      const res = await fetch(`${base}${caminho}`, { headers });
      const texto = await res.text();
      let corpo: unknown = texto;
      try {
        corpo = JSON.parse(texto);
      } catch {
        // mantém texto cru
      }
      return { status: res.status, corpo };
    } catch (err) {
      return { erro: String(err) };
    }
  }

  const [status, device] = await Promise.all([chamar("/status"), chamar("/device")]);

  return NextResponse.json({
    ok: true,
    status,
    device,
  });
}
