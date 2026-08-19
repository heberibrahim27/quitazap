// ─────────────────────────────────────────
// QuitaZAP Controle — Solicita link de acesso ("minha conta")
// POST /api/auth-cliente/solicitar   body: { telefone }
// Sempre responde a mesma mensagem genérica, exista ou não o telefone
// cadastrado — evita que alguém descubra quais números são clientes.
// ─────────────────────────────────────────

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, normalizarTelefone, variacoesTelefone } from "@/lib/zapi";
import { urlLinkAcessoCliente } from "@/lib/cliente-auth";

const MENSAGEM_GENERICA = {
  ok: true,
  mensagem: "Se esse número estiver cadastrado, você vai receber um link de acesso no WhatsApp em instantes.",
};

// Throttle simples em memória: no máximo 1 pedido por telefone a cada 60s.
// Suficiente pra essa escala (evita clique duplo / spam trivial); não
// sobrevive a cold start, mesma limitação já aceita no dedupe do webhook.
const ULTIMO_PEDIDO_MS = new Map<string, number>();
const JANELA_THROTTLE_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const telefoneBruto = String(body?.telefone ?? "").trim();
    if (!telefoneBruto) {
      return NextResponse.json({ error: "Informe o telefone." }, { status: 400 });
    }

    const telefone = normalizarTelefone(telefoneBruto);

    const agora = Date.now();
    const ultimoPedido = ULTIMO_PEDIDO_MS.get(telefone);
    if (ultimoPedido && agora - ultimoPedido < JANELA_THROTTLE_MS) {
      return NextResponse.json(MENSAGEM_GENERICA);
    }
    // Map preserva ordem de inserção, não de atualização — remove e reinsere
    // pra ir pro fim (senão a expulsão abaixo pode derrubar um telefone
    // recém-visto antes de um realmente parado há muito tempo).
    ULTIMO_PEDIDO_MS.delete(telefone);
    ULTIMO_PEDIDO_MS.set(telefone, agora);
    if (ULTIMO_PEDIDO_MS.size > 500) {
      const primeiraChave = ULTIMO_PEDIDO_MS.keys().next().value;
      if (primeiraChave !== undefined) ULTIMO_PEDIDO_MS.delete(primeiraChave);
    }

    const cliente = await prisma.cliente.findFirst({
      where: { telefone: { in: variacoesTelefone(telefone) } },
      select: { id: true, nome: true, telefone: true },
    });

    // O envio roda depois da resposta (after), não antes — senão o tempo de
    // resposta em si já entregaria se o telefone existe ou não (a chamada pra
    // API do WhatsApp é bem mais lenta que a consulta no banco).
    if (cliente) {
      after(async () => {
        const link = urlLinkAcessoCliente(cliente.id);
        // Log temporário: a instância Z-API do QuitaZAP está desviada pro
        // BancaZAP no momento, então o envio abaixo não chega no WhatsApp de
        // ninguém. Enquanto isso, o link sai aqui no log do servidor pra dar
        // pra testar o fluxo mesmo assim. Remover quando o WhatsApp voltar.
        console.log(`[AUTH-CLIENTE] Link de acesso gerado (cliente ${cliente.id}): ${link}`);
        try {
          const primeiroNome = cliente.nome.split(" ")[0];
          await sendWhatsApp(
            cliente.telefone,
            `Oi, ${primeiroNome}! 👋\n\nAqui está seu link de acesso à Minha Conta do QuitaZAP:\n👉 ${link}\n\n_Válido por 15 minutos. Se não foi você quem pediu, pode ignorar essa mensagem._`
          );
        } catch (err) {
          console.error("[AUTH-CLIENTE] Erro ao enviar link de acesso:", err);
        }
      });
    }

    return NextResponse.json(MENSAGEM_GENERICA);
  } catch (err) {
    console.error("[AUTH-CLIENTE] Erro ao solicitar acesso:", err);
    return NextResponse.json(MENSAGEM_GENERICA);
  }
}
