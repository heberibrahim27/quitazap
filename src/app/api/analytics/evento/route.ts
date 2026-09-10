// ─────────────────────────────────────────
// QuitaZAP — Analytics de uso (área /minha-conta)
// POST /api/analytics/evento
// Registra pageview/clique do assinante logado. clienteId nunca vem do
// corpo da requisição — sempre resolvido pelo cookie de sessão (mesmo
// padrão de autenticação do resto de /minha-conta), pra ninguém conseguir
// forjar evento em nome de outro cliente.
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";

const TIPOS_VALIDOS = ["pageview", "click"];
const CAMINHO_MAX_LEN = 200;

export async function POST(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  try {
    const body = await req.json();
    const tipo = String(body.tipo ?? "");
    const caminho = String(body.caminho ?? "").slice(0, CAMINHO_MAX_LEN);

    if (!TIPOS_VALIDOS.includes(tipo) || !caminho) {
      return NextResponse.json({ error: "tipo/caminho inválidos" }, { status: 400 });
    }

    await prisma.eventoAnalytics.create({
      data: { clienteId, tipo, caminho },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Analytics nunca deve quebrar a experiência do assinante — loga e
    // responde 200 mesmo em erro inesperado (o cliente dispara isso em
    // fire-and-forget, sem tratar falha).
    console.error("[ANALYTICS] Erro ao registrar evento:", err);
    return NextResponse.json({ ok: false });
  }
}
