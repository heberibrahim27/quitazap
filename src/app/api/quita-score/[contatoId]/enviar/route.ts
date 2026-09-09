// ─────────────────────────────────────────
// POST /api/quita-score/[contatoId]/enviar
//
// DESATIVADA (09/09/2026): decisão do Ibrahim depois do incidente de spam —
// "não podemos mais mandar mensagem pra ninguém, quem tem que chegar são
// eles no nosso bot". Essa rota gerava o PNG do QuitaScore e mandava, por
// iniciativa nossa, pro `contato.telefone` (ContatoReceber) — o cliente de
// UM ASSINANTE, que nunca falou com o número da QuitaZAP. O helper
// enviarImagemWhatsApp() usava, no branch Z-API (provider ativo hoje),
// sempre `process.env.ZAPI_INSTANCE` direto — ignorando por completo a
// `instancia` do assinante — ou seja, a imagem sempre saía pelo NOSSO
// número compartilhado. Mesmo padrão de risco do Cobrador/Receber
// (cron/lembretes). Desligada por inteiro.
// ─────────────────────────────────────────

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Envio de QuitaScore por WhatsApp desativado — não enviamos mais mensagem por iniciativa nossa (09/09/2026)." },
    { status: 403 },
  );
}
