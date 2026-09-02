// ─────────────────────────────────────────
// QuitaZAP Controle — Cartões conhecidos
// ─────────────────────────────────────────
// Lista curada dos bancos/emissores mais comuns entre os clientes, cada um
// com uma cor de marca própria (gradiente), pra já dar uma cara "de banco
// de verdade" antes de existir arte real. Qualquer nome fora dessa lista
// (o cliente digita o que quiser ao cadastrar um cartão) cai no gradiente
// genérico único — não inventamos cor por banco que não conhecemos.
//
// Quando as artes reais (logos) forem enviadas pelo Drive, o plano é trocar
// só `imagemUrl` aqui por banco — nada na UI que consome isso precisa mudar,
// já que ela sempre pede a entrada do mapa por nome, nunca a cor direto.

export type CartaoConhecido = {
  gradiente: [string, string];
  imagemUrl?: string;
};

export const CARTOES_CONHECIDOS: Record<string, CartaoConhecido> = {
  Nubank: { gradiente: ["#A526D6", "#5C0280"] },
  Inter: { gradiente: ["#FF9A3D", "#E85D00"] },
  "Itaú": { gradiente: ["#FF8C00", "#EC5F00"] },
  Bradesco: { gradiente: ["#E6003C", "#8C0026"] },
  Santander: { gradiente: ["#FF3D3D", "#B30000"] },
  Caixa: { gradiente: ["#2D6FE0", "#0047AB"] },
  "Banco do Brasil": { gradiente: ["#FFD400", "#F2B90C"] },
  "C6 Bank": { gradiente: ["#4A4A4A", "#1A1A1A"] },
  PicPay: { gradiente: ["#3BDB6B", "#0A8F3C"] },
  XP: { gradiente: ["#1A1A1A", "#000000"] },
  Next: { gradiente: ["#00E0A4", "#00A87A"] },
  Neon: { gradiente: ["#1BD3D3", "#0A8F8F"] },
  BTG: { gradiente: ["#0A2E4D", "#001830"] },
  "Will Bank": { gradiente: ["#7B3FE4", "#4A1FA0"] },
  PagBank: { gradiente: ["#3AC1E0", "#0080A8"] },
};

/** Gradiente único pra qualquer cartão fora da lista de conhecidos. */
export const GRADIENTE_GENERICO: [string, string] = ["#5B7A9E", "#2E4A66"];

export function gradienteDoCartao(nome: string): [string, string] {
  return CARTOES_CONHECIDOS[nome]?.gradiente ?? GRADIENTE_GENERICO;
}

export function imagemDoCartao(nome: string): string | undefined {
  return CARTOES_CONHECIDOS[nome]?.imagemUrl;
}

export const NOMES_CARTOES_CONHECIDOS = Object.keys(CARTOES_CONHECIDOS);
