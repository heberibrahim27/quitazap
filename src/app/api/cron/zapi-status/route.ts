// ─────────────────────────────────────────
// QuitaZAP — Monitor da instância Z-API (09/09/2026, Ibrahim: "bot não
// responde números diferentes do meu" + pediu uma solução pra não precisar
// ficar de olho na tela o tempo todo pra descobrir quando o bot cai).
//
// Checa direto na Z-API se a instância de WhatsApp do bot tá conectada,
// compara com o último estado salvo (MonitorZapi, ver schema.prisma) e só
// devolve `alertar: true` quando o estado MUDOU desde a última checagem —
// caiu agora, ou voltou agora. Pensado pra ser chamado periodicamente por
// uma tarefa agendada externa, que manda um WhatsApp pro Ibrahim só quando
// `alertar` vier true (nunca em loop repetido enquanto o problema persiste
// sem solução — só um aviso quando o estado realmente muda).
//
// Só leitura de status na Z-API + 1 upsert no banco. Nenhum token/QR/erro
// bruto do provedor volta na resposta.
// ─────────────────────────────────────────

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const INSTANCIA = "quitazap";

export async function GET() {
  const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE ?? "";
  const ZAPI_TOKEN = process.env.ZAPI_TOKEN ?? "";
  const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? "";

  if (!ZAPI_INSTANCE || ZAPI_INSTANCE === "SUA_INSTANCIA_AQUI") {
    return NextResponse.json({ ok: false, erro: "ZAPI_INSTANCE não configurada" });
  }

  let conectadoAgora: boolean;
  try {
    const res = await fetch(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/status`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(ZAPI_CLIENT_TOKEN ? { "Client-Token": ZAPI_CLIENT_TOKEN } : {}),
        },
      }
    );
    const corpo = await res.json().catch(() => null);
    conectadoAgora = corpo?.connected === true;
  } catch {
    // Falha de rede ao consultar a Z-API — trata como "não sabemos", não
    // como desconectado (evita falso alarme por uma falha de rede pontual
    // da nossa própria checagem, não da instância em si).
    return NextResponse.json({ ok: false, erro: "falha ao consultar a Z-API" });
  }

  const anterior = await prisma.monitorZapi.findUnique({ where: { instancia: INSTANCIA } });
  const conectadoAntes = anterior?.conectado ?? null;

  await prisma.monitorZapi.upsert({
    where: { instancia: INSTANCIA },
    create: { instancia: INSTANCIA, conectado: conectadoAgora },
    update: { conectado: conectadoAgora },
  });

  // Só alerta em transição: primeira checagem que já mostra desconectado,
  // ou mudança em relação ao estado salvo anteriormente. Continua
  // desconectado igual à última checagem → não alerta de novo (evita spam
  // repetido enquanto o Ibrahim ainda não resolveu).
  const mudouParaDesconectado = !conectadoAgora && conectadoAntes !== false;
  const mudouParaConectado = conectadoAgora && conectadoAntes === false;
  const alertar = mudouParaDesconectado || mudouParaConectado;

  const mensagem = mudouParaDesconectado
    ? "🔴 QuitaZAP — bot desconectado\n\nO WhatsApp do bot caiu. Ninguém está recebendo resposta agora.\n\nPra reconectar: entra em app.z-api.io e escaneia o QR code com o celular do número 71984034970."
    : mudouParaConectado
      ? "🟢 QuitaZAP — bot reconectado\n\nO WhatsApp do bot voltou a funcionar normalmente."
      : "";

  return NextResponse.json({
    ok: true,
    conectado: conectadoAgora,
    alertar,
    mensagem,
  });
}
