// ─────────────────────────────────────────
// Classificador leve de confirmação (sim/não) por IA.
//
// Só entra em jogo quando já existe uma confirmação pendente no fluxo
// (ex: "cadastro essas despesas fixas?") e a resposta do cliente não bate
// no formato exato esperado ("sim"/"1"/"confirmar"...) — algo como
// "beleza, pode ser" ou "não, deixa quieto por enquanto". Escopo bem
// restrito de propósito: só duas saídas possíveis, sempre dentro de um
// fluxo que já está esperando confirmar/negar, nunca uma interpretação
// livre da mensagem.
// ─────────────────────────────────────────

export async function classificarConfirmacaoIA(
  mensagem: string
): Promise<"confirmar" | "negar" | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-proj-SUA")) return null;
  // Resposta de confirmação não deveria ser longa — mensagem grande é sinal
  // de que o cliente mudou de assunto, não vale a pena gastar chamada de IA.
  if (!mensagem || mensagem.length > 300) return null;

  const body = {
    model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Você classifica se uma resposta curta de WhatsApp confirma ou nega uma pergunta anterior de " +
          'sim/não. Responda APENAS com JSON: {"resposta":"confirmar"} ou {"resposta":"negar"} ou ' +
          '{"resposta":"indefinido"} se a mensagem não for claramente uma confirmação nem uma negação ' +
          "(ex: uma pergunta, ou um assunto totalmente diferente).",
      },
      { role: "user", content: mensagem },
    ],
    temperature: 0,
    max_tokens: 20,
    response_format: { type: "json_object" },
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;

    const parsed = JSON.parse(content);
    if (parsed.resposta === "confirmar" || parsed.resposta === "negar") return parsed.resposta;
    return null;
  } catch {
    return null;
  }
}
