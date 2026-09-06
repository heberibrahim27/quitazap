// ─────────────────────────────────────────
// QuitaZAP — Assistente Admin (IA interna) — confirmar ação
// POST /api/assistente-admin/confirmar
// ─────────────────────────────────────────
// Único lugar onde uma tool de escrita do assistente realmente executa.
// Recebe exatamente {ferramenta, argumentos} que já foram mostrados na
// tela como proposta — o modelo não é consultado de novo aqui, então não
// há espaço pra ele "mudar de ideia" entre a proposta e a execução.
// Revalida antes de executar (o estado pode ter mudado desde a proposta)
// e grava auditoria sempre, sucesso ou falha.

import { NextRequest, NextResponse } from "next/server";
import { REGISTRO_FERRAMENTAS } from "@/lib/assistente-admin/ferramentas";
import { registrarAuditoria } from "@/lib/assistente-admin/auditoria";

const COOKIE_NAME = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export async function POST(req: NextRequest) {
  if (req.cookies.get(COOKIE_NAME)?.value !== COOKIE_TOKEN) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const ferramenta = typeof body?.ferramenta === "string" ? body.ferramenta : "";
  const argumentos = body?.argumentos && typeof body.argumentos === "object" ? body.argumentos : {};

  const definicao = REGISTRO_FERRAMENTAS[ferramenta];
  if (!definicao || definicao.tipo !== "escrita") {
    return NextResponse.json({ ok: false, erro: "Ferramenta inválida." }, { status: 400 });
  }

  const validado = await definicao.validarEResumir(argumentos);
  if (!validado.ok) {
    await registrarAuditoria({ ferramenta, argumentos, resumo: validado.erro, sucesso: false, erro: validado.erro });
    return NextResponse.json({ ok: false, erro: validado.erro });
  }

  try {
    const { antes, depois, resultado } = await definicao.executar(argumentos);
    await registrarAuditoria({ ferramenta, argumentos, resumo: validado.resumo, antes, depois, sucesso: true });
    return NextResponse.json({ ok: true, resumo: validado.resumo, resultado });
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Erro ao executar ação.";
    await registrarAuditoria({ ferramenta, argumentos, resumo: validado.resumo, sucesso: false, erro });
    return NextResponse.json({ ok: false, erro });
  }
}
