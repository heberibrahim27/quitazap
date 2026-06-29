// Helper para extrair usuarioId autenticado nas API routes
import { NextRequest, NextResponse } from "next/server";
import { verificarToken } from "@/lib/auth-jwt";

export function getUsuarioId(req: NextRequest): string | null {
  const token = req.cookies.get("qz-auth")?.value;
  if (!token) return null;
  return verificarToken(token);
}

export function erroNaoAutenticado() {
  return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
}
