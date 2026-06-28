// ─────────────────────────────────────────
// QuitaZAP — API Cobrador Automático
// GET    /api/cobrador?clienteId=xxx       → lista cobranças
// POST   /api/cobrador                     → cria cobrança
// PATCH  /api/cobrador                     → atualiza status (paga/cancelada)
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizarTelefone } from "@/lib/zapi";
import { verificarTokenCobrador } from "@/lib/cobrador-token";

// GET — lista cobranças de um cliente (ou todas para admin)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clienteId = searchParams.get("clienteId");
  const token     = searchParams.get("token");
  const status    = searchParams.get("status"); // opcional: filtrar por status
  const page      = parseInt(searchParams.get("page") ?? "1");
  const limit     = parseInt(searchParams.get("limit") ?? "50");

  // Se vier token, valida — caso contrário assume acesso admin (sem filtro)
  if (clienteId && token && !verificarTokenCobrador(clienteId, token)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const where: Record<string, unknown> = {};
  if (clienteId) where.clienteId = clienteId;
  if (status)    where.status    = status;

  const [cobrancas, total] = await Promise.all([
    prisma.cobranca.findMany({
      where,
      orderBy: { vencimento: "asc" },
      skip:  (page - 1) * limit,
      take:  limit,
      include: { cliente: { select: { nome: true, telefone: true } } },
    }),
    prisma.cobranca.count({ where }),
  ]);

  return NextResponse.json({ cobrancas, total, page, limit });
}

// POST — cria nova cobrança
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      clienteId,
      credorNome,
      devedorNome,
      devedorFone,
      valor,
      diaVencimento, // número do dia (1-31) do mês atual/próximo
      vencimento,    // data ISO completa (alternativo ao diaVencimento)
      mensagem,
      pixChave,
    } = body;

    if (!clienteId || !devedorNome || !devedorFone || !valor) {
      return NextResponse.json(
        { error: "Campos obrigatórios: clienteId, devedorNome, devedorFone, valor" },
        { status: 400 }
      );
    }

    // Calcula a data de vencimento
    let dataVencimento: Date;
    if (vencimento) {
      dataVencimento = new Date(vencimento);
    } else if (diaVencimento) {
      const hoje = new Date();
      dataVencimento = new Date(hoje.getFullYear(), hoje.getMonth(), diaVencimento);
      // Se o dia já passou neste mês, agenda para o próximo mês
      if (dataVencimento < hoje) {
        dataVencimento = new Date(hoje.getFullYear(), hoje.getMonth() + 1, diaVencimento);
      }
    } else {
      dataVencimento = new Date(); // hoje
    }

    const foneNormalizado = normalizarTelefone(String(devedorFone));

    // Busca o nome e telefone do credor se não fornecido
    let nomeCredor = credorNome;
    let chavePixCredor = pixChave;
    if (!nomeCredor || !chavePixCredor) {
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { nome: true, telefone: true },
      });
      if (!nomeCredor)    nomeCredor    = cliente?.nome ?? "QuitaZAP";
      if (!chavePixCredor) chavePixCredor = cliente?.telefone ?? "";
    }

    const cobranca = await prisma.cobranca.create({
      data: {
        clienteId,
        credorNome:  nomeCredor,
        devedorNome: String(devedorNome).trim(),
        devedorFone: foneNormalizado,
        valor:       parseFloat(String(valor)),
        vencimento:  dataVencimento,
        mensagem:    mensagem ? String(mensagem).trim() : null,
        pixChave:    chavePixCredor || null,
        status:      "PENDENTE",
        etapa:       1,
      },
    });

    return NextResponse.json({ ok: true, cobranca });
  } catch (err) {
    console.error("[COBRADOR] Erro ao criar cobrança:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH — atualiza status de uma cobrança (PAGA, CANCELADA)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, obs, clienteId, token } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "id e status são obrigatórios" }, { status: 400 });
    }

    // Valida token se vier de cliente (não admin)
    if (clienteId && token && !verificarTokenCobrador(clienteId, token)) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }
    // Se tiver clienteId+token válido, garante que a cobrança pertence ao cliente
    if (clienteId && token) {
      const cobrancaCheck = await prisma.cobranca.findFirst({ where: { id, clienteId } });
      if (!cobrancaCheck) {
        return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });
      }
    }

    const statusValidos = ["PAGA", "CANCELADA", "PENDENTE", "ENVIADA"];
    if (!statusValidos.includes(status)) {
      return NextResponse.json({ error: `Status inválido. Use: ${statusValidos.join(", ")}` }, { status: 400 });
    }

    const cobranca = await prisma.cobranca.update({
      where: { id },
      data: {
        status,
        ...(obs ? { mensagem: obs } : {}),
        ...(status === "PAGA" ? { atualizadoEm: new Date() } : {}),
      },
    });

    return NextResponse.json({ ok: true, cobranca });
  } catch (err) {
    console.error("[COBRADOR] Erro ao atualizar cobrança:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
