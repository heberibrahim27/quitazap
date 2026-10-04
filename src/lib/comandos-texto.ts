// ─────────────────────────────────────────
// Comandos curtos por texto que valem nos dois canais (WhatsApp e chat nativo)
// ─────────────────────────────────────────
// Parte pura (sem banco) — a ação em si fica em desfazer-lancamento.ts.

/**
 * "desfazer", "apagar isso", "errei"... Ancorado no início da frase pra não
 * disparar em qualquer texto que contenha essas palavras soltas. Mesma
 * regra que o webhook do WhatsApp já usava (detectarComando →
 * DESFAZER_LANCAMENTO); o chat nativo não tinha e respondia "Eu sou o
 * assistente financeiro..." (achado em QA, 04/10/2026).
 */
export function pedidoDesfazerLancamento(mensagem: string): boolean {
  const m = mensagem
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return /^(desfaz(er)?|apaga(r)?\s+(isso|esse|essa|o ultimo|a ultima)|cancela(r)?\s+(o ultimo lancamento|essa despesa|esse gasto|essa receita|o ultimo gasto|o ultimo registro)|errei|foi engano|nao foi isso|nao era isso)\b/.test(m);
}
