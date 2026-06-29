// GET /api/auth/me — retorna usuário autenticado
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarToken } from "@/lib/auth-jwt";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("qz-auth")?.value;
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const usuarioId = verificarToken(token);
  if (!usuarioId) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true, nome: true, email: true, telefone: true,
      plano: true, planoPago: true, wpConectado: true, wpTelefone: true,
      criadoEm: true,
    },
  });

  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  return NextResponse.json({ usuario });
}
