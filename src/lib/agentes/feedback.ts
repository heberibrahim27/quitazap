// ─────────────────────────────────────────
// Feedback do cliente sobre alertas proativos (parte pura)
// ─────────────────────────────────────────
// "útil" / "errado" / "parar esse alerta" — tratados ANTES do pipeline do
// chat/WhatsApp (senão "errado" cairia na IA de intenção). Casamento exato
// da frase inteira, de propósito: uma mensagem comum que só contém a palavra
// ("o valor ficou errado, corrige") não pode ser engolida aqui.

export type FeedbackAlerta = "UTIL" | "ERRADO" | "PARAR_TIPO" | "PARAR_TODOS" | "RELIGAR";

function normalizar(m: string): string {
  return (m ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectarFeedbackAlerta(mensagem: string): FeedbackAlerta | null {
  const m = normalizar(mensagem);
  if (!m || m.length > 60) return null;

  if (/^(ativar|ligar|religar|reativar) (os )?alertas?$|^voltar a receber alertas?$|^quero (receber )?alertas? (de )?(novo|novamente)$/.test(m)) return "RELIGAR";

  if (
    /^(parar|pare|para|desativar|desligar|cancelar) (todos )?(os )?alertas?$|^(nao quero|nao quero mais) (receber )?(nenhum |os )?alertas?$|^pare de (me )?(mandar|enviar) alertas?$/.test(m)
  ) {
    return "PARAR_TODOS";
  }

  if (
    /^(parar|pare|para|silenciar|desativar|desligar) (esse|este|esses|estes) alertas?$|^nao quero (mais )?(esse|este|esses|estes) (tipo de )?alertas?$|^🔕$/.test(m) ||
    m === "🔕"
  ) {
    return "PARAR_TIPO";
  }

  if (/^(errado|esta errado|esta errada|alerta errado|informacao errada|isso esta errado|calculo errado|👎|❌)$/.test(m)) return "ERRADO";

  if (/^(util|foi util|muito util|ajudou|me ajudou|👍)$/.test(m)) return "UTIL";

  return null;
}
