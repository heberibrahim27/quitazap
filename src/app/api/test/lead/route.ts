// ─────────────────────────────────────────
// QuitaZAP — API de teste do funil de vendas
// POST /api/test/lead  →  dispara boas-vindas para um número
//
// DESATIVADA (09/09/2026): essa rota mandava uma mensagem REAL de WhatsApp
// pra QUALQUER número digitado, sem exigir que a pessoa tivesse mandado
// mensagem antes — e sem exigir login nenhum (a checagem "bloqueia em
// produção" dependia da env var ENABLE_TEST_ROUTES, que estava LIGADA em
// produção, deixando a rota aberta pra qualquer um bater nela direto, mesmo
// sem passar pela tela /testar-funil). Confirmado ao vivo: uma sequência de
// números falsos (98765-1111 até 98765-7777, tudo dígito repetido —
// claramente digitado à mão pra teste) recebeu mensagem real do funil essa
// manhã; ninguém respondeu (números não têm dono de verdade), e esse padrão
// — várias mensagens "a frio" pra número sem relação nenhuma com o negócio
// — foi exatamente o que fez o WhatsApp marcar a conta como spam e
// desconectar. Enquanto essa rota não tiver um guard de verdade (login de
// admin, número já com conversa, ou algo assim), ela fica desligada — o
// risco de banimento permanente do número é grande demais. O simulador em
// /testar-funil (lógica pura, sem mandar WhatsApp nenhum) continua
// funcionando normalmente pra testar o funil.
// ─────────────────────────────────────────

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Rota desativada — envio real de teste para número arbitrário causou denúncia de spam no WhatsApp (09/09/2026)." },
    { status: 403 }
  );
}
