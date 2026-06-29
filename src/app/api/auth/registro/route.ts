// POST /api/auth/registro
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { criarToken } from "@/lib/auth-jwt";
import { hashSync } from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { nome, email, senha, telefone } = await req.json();

    if (!nome || !email || !senha) {
      return NextResponse.json({ error: "Nome, email e senha são obrigatórios." }, { status: 400 });
    }

    if (senha.length < 6) {
      return NextResponse.json({ error: "Senha deve ter pelo menos 6 caracteres." }, { status: 400 });
    }

    const emailNorm = email.toLowerCase().trim();

    const existente = await prisma.usuario.findUnique({ where: { email: emailNorm } });
    if (existente) {
      return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });
    }

    const senhaHash = hashSync(senha, 12);

    const usuario = await prisma.usuario.create({
      data: {
        nome: nome.trim(),
        email: emailNorm,
        senhaHash,
        telefone: telefone?.trim() ?? null,
        plano: "GRATUITO",
      },
    });

    const token = criarToken(usuario.id);

    const res = NextResponse.json({
      ok: true,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, plano: usuario.plano },
    });

    res.cookies.set("qz-auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 dias
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("[REGISTRO]", err);
    return NextResponse.json({ error: "Erro interno ao criar conta." }, { status: 500 });
  }
}
