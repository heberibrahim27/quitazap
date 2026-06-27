import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const clientes = await prisma.cliente.findMany({
    include: {
      dividas: {
        include: {
          parcelas: true,
          pagamentos: true,
        },
      },
      planosEnviados: true,
    },
    orderBy: { criadoEm: "asc" },
  });

  const payload = {
    exportadoEm: new Date().toISOString(),
    versao: "1.0",
    totalClientes: clientes.length,
    clientes,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="quitazap-backup-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
