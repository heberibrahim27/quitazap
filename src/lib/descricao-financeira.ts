const MARCAS_E_TERMOS: Record<string, string> = {
  agua: "Água",
  aguas: "Águas",
  mercado: "Mercado",
  waifai: "Internet",
  wifi: "Internet",
  "wi-fi": "Internet",
  trasporte: "Transporte",
  tranporte: "Transporte",
  transporte: "Transporte",
  cartao: "Cartão",
  credito: "Crédito",
  debito: "Débito",
  internet: "Internet",
  net: "Internet",
  chatgpt: "ChatGPT",
  claude: "Claude",
  nubank: "Nubank",
  ifood: "iFood",
  netflix: "Netflix",
  tim: "TIM",
  uber: "Uber",
  bar: "Bar",
  banco: "Banco",
  brasil: "Brasil",
  livros: "Livros",
  materiais: "Materiais",
  estudo: "estudo",
  paes: "Pães",
  pao: "Pão",
  coca: "Coca",
  lanxe: "Lanche",
  lanche: "Lanche",
  lanches: "Lanches",
};

const CONECTORES = new Set(["de", "do", "da", "dos", "das", "e"]);

export function normalizarTextoBusca(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizarDescricaoFinanceira(texto: string): string {
  const limpo = texto
    .replace(/\([^)]*\)/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—:;,.]+|[-–—:;,.]+$/g, "")
    .trim();

  if (!limpo) return "";

  const palavras = limpo.split(" ").filter(Boolean);
  const normalizadas: string[] = [];

  for (let index = 0; index < palavras.length; index += 1) {
    const palavra = palavras[index];
    const chave = normalizarTextoBusca(palavra);
    const proxima = palavras[index + 1] ? normalizarTextoBusca(palavras[index + 1]) : "";

    if (chave === "chat" && proxima === "gpt") {
      normalizadas.push("ChatGPT");
      index += 1;
      continue;
    }

    if (MARCAS_E_TERMOS[chave]) {
      normalizadas.push(MARCAS_E_TERMOS[chave]);
      continue;
    }

    if (index > 0 && CONECTORES.has(chave)) {
      normalizadas.push(chave);
      continue;
    }

    if (/^[A-Z]{2,}$/.test(palavra)) {
      normalizadas.push(palavra);
      continue;
    }

    normalizadas.push(
      index === 0
        ? palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase()
        : palavra.toLowerCase()
    );
  }

  return normalizadas.join(" ");
}
