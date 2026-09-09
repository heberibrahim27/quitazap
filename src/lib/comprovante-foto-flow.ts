// ─────────────────────────────────────────
// QuitaZAP Controle — "Comprovante Inteligente" (foto de recibo/nota fiscal)
// ─────────────────────────────────────────
// Pesquisa de concorrentes (09/09/2026 — Financinha, ZapGastos e FinanBot
// leem foto de comprovante) + decisão do Ibrahim ("Pode implementar", com
// fluxo de confirmação antes de lançar).
//
// A EXTRAÇÃO em si (GPT-4o Vision) já existia no webhook desde antes
// (PROMPT_ANALISE_IMAGEM + normalizarRespostaCompraImagem, em gasto-flow.ts)
// — usada originalmente só pro funil de vendas (contracheque pro "Raio-X do
// Salário"), mas o prompt já cobria recibo/nota/cupom de compra também, e o
// texto normalizado caía direto no cascade de gasto de texto sem
// confirmação nenhuma. O que faltava era não confiar cegamente na leitura
// da IA de visão antes de criar um Lancamento de verdade: diferente do
// cliente digitando ele mesmo, uma foto pode ter o valor borrado, um OCR
// errado de "R$ 8,50" lido como "R$ 850", nome de loja cortado etc. — e
// nesse caso o gasto seria criado errado sem o cliente perceber.
//
// Este módulo só cuida da prévia de confirmação. A extração e o lançamento
// em si continuam sendo os mesmos de sempre: assim que confirmado, o texto
// já normalizado ("Comprei em X, R$ Y") é reinjetado no MESMO cascade de
// gasto de texto (categorização, checagem de orçamento, guard de
// fatura/boleto etc. — tudo já testado) em vez de duplicar essa lógica
// aqui.
//
// Mesmo desenho do Boleto Inteligente (boleto-flow.ts) e da Fatura
// Inteligente (fatura-cartao-flow.ts): estado isolado em
// BotSessao.comprovanteFotoPendente, não entra no dividasTemp/
// confirmacaoPendente do fluxo de texto (são preocupações diferentes).

import { normalizarTextoBusca } from "@/lib/descricao-financeira";

export interface ComprovanteFotoDetectado {
  loja: string;
  valor: number;
  // Texto já normalizado ("Comprei em X, R$ Y") — reaproveitado tal como
  // está assim que confirmado, pra cair no mesmo cascade de gasto de texto
  // sem reimplementar a extração/categorização aqui.
  textoNormalizado: string;
  // URL original da imagem na Z-API — vira Lancamento.comprovanteUrl quando
  // confirmado, mesmo a confirmação chegando numa mensagem de texto
  // separada (antes essa ligação se perdia nesse caso — ver comentário no
  // webhook).
  imageUrl: string;
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function comprovanteFotoValido(c: Partial<ComprovanteFotoDetectado>): c is ComprovanteFotoDetectado {
  return (
    typeof c.loja === "string" &&
    c.loja.trim().length > 0 &&
    typeof c.valor === "number" &&
    Number.isFinite(c.valor) &&
    c.valor > 0 &&
    typeof c.textoNormalizado === "string" &&
    c.textoNormalizado.trim().length > 0 &&
    typeof c.imageUrl === "string" &&
    c.imageUrl.trim().length > 0
  );
}

export function mensagemPreviaComprovante(c: ComprovanteFotoDetectado): string {
  return (
    `📷 Encontrei nessa foto:\n\n` +
    `*${c.loja}*\n` +
    `💰 ${fmt(c.valor)}\n\n` +
    `Confirma esse gasto? Responda *sim* ou *não* (se eu li o valor errado, me diga o valor certo digitando).`
  );
}

// Mesmo padrão do Boleto/Fatura Inteligente (regex exata primeiro, grátis e
// instantânea) — quem chama cai pra classificarConfirmacaoIA quando não bate
// num desses formatos, cobrindo frases naturais tipo "isso mesmo" ou "não,
// deixa".
export function detectarRespostaComprovante(mensagem: string): "confirmar" | "negar" | null {
  const texto = normalizarTextoBusca(mensagem);
  if (/^(1|sim|s|confirmar|pode|pode lancar|pode lançar|isso|correto|certo)$/.test(texto)) return "confirmar";
  if (/^(2|nao|n|cancelar|nao lancar|nao lançar|deixa|errado)$/.test(texto)) return "negar";
  return null;
}
