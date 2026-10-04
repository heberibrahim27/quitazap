// ─────────────────────────────────────────
// Meta "Respiro" — comando do cliente (parte pura)
// ─────────────────────────────────────────
// O Respiro é o colchão pequeno (7 dias do dia a dia) pra um imprevisto não virar
// dívida de novo. A meta só é criada quando o CLIENTE pede ("criar respiro"): o
// próprio Orientador ensina o comando no passo RESPIRO, então esse pedido é a
// confirmação explícita — nada é criado em silêncio.

const REGEX_CRIAR_RESPIRO =
  /^\s*(?:(?:sim|ok|pode)[\s,]+)?(?:eu\s+)?(?:quero\s+|vou\s+|bora\s+|pode\s+)?(?:criar|montar|fazer|abrir)\s+(?:a\s+|o\s+|minha\s+|meu\s+|uma\s+|um\s+)?(?:meta\s+(?:de\s+|do\s+)?)?(?:respiro|colch[aã]o)(?:\s+(?:agora|pra\s+mim|para\s+mim|por\s+favor))?\s*[.!]?\s*$/i;

export function detectarCriarRespiro(mensagem: string): boolean {
  return REGEX_CRIAR_RESPIRO.test(mensagem);
}

/** Arredonda pra cima de 10 em 10 — meta redonda é mais fácil de acompanhar. */
export function arredondarAlvoRespiro(valor: number): number {
  return Math.ceil(valor / 10) * 10;
}
