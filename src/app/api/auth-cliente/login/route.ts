// ─────────────────────────────────────────
// QuitaZAP Controle — Login do cliente ("Minha Conta")
// POST /api/auth-cliente/login   body: { telefone, senha }
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizarTelefone, variacoesTelefone } from "@/lib/zapi";
import { verificarSenhaCliente, criarSessaoCliente } from "@/lib/cliente-auth";
import { COOKIE_CLIENTE } from "@/lib/get-cliente";

const ERRO_CREDENCIAIS = { error: "Telefone ou senha incorretos." };

// Throttle simples em memória contra tentativa de força bruta: no máximo 5
// tentativas por telefone a cada 5 minutos. Não sobrevive a cold start nem
// funciona entre múltiplas instâncias serverless — mesma limitação já aceita
// no dedupe do webhook; o custo do bcrypt (fator 12) já é a defesa principal.
const TENTATIVAS = new Map<string, { contagem: number; desde: number }>();
const JANELA_MS = 5 * 60 * 1000;
const MAX_TENTATIVAS = 5;

function bloqueadoPorExcesso(telefone: string): boolean {
  const agora = Date.now();
  const registro = TENTATIVAS.get(telefone);
  if (!registro || agora - registro.desde > JANELA_MS) {
    TENTATIVAS.set(telefone, { contagem: 1, desde: agora });
    if (TENTATIVAS.size > 500) {
      const primeiraChave = TENTATIVAS.keys().next().value;
      if (primeiraChave !== undefined) TENTATIVAS.delete(primeiraChave);
    }
    return false;
  }
  registro.contagem += 1;
  return registro.contagem > MAX_TENTATIVAS;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const telefoneBruto = String(body?.telefone ?? "").trim();
  const senha = String(body?.senha ?? "");

  if (!telefoneBruto || !senha) {
    return NextResponse.json({ error: "Informe telefone e senha." }, { status: 400 });
  }

  const telefone = normalizarTelefone(telefoneBruto);

  if (bloqueadoPorExcesso(telefone)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
      { status: 429 }
    );
  }

  const cliente = await prisma.cliente.findFirst({
    where: { telefone: { in: variacoesTelefone(telefone) } },
    select: { id: true, senhaHash: true },
  });

  const senhaOk = verificarSenhaCliente(senha, cliente?.senhaHash ?? null);
  if (!cliente || !senhaOk) {
    return NextResponse.json(ERRO_CREDENCIAIS, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_CLIENTE, criarSessaoCliente(cliente.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
