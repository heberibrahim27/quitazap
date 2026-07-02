import { parseMoneyBR } from "./money";
import { normalizarDescricaoFinanceira } from "./descricao-financeira";

export type CategoriaGasto =
  | "Mercado"
  | "Alimentação"
  | "Transporte"
  | "Moradia"
  | "Contas da casa"
  | "Saúde/Farmácia"
  | "Educação"
  | "Filhos/Família"
  | "Assinaturas"
  | "Apostas"
  | "Lazer"
  | "Beleza/Cuidados"
  | "Trabalho/Negócio"
  | "Dívidas/Cartões"
  | "Outros";

export type GastoDetectado = {
  pareceGasto: boolean;
  valor?: number;
  quantidade?: number;
  valorUnitario?: number;
  descricao: string;
  categoria: CategoriaGasto;
  data: Date;
  resposta: string;
};

const PERGUNTA_VALOR = "Qual foi o valor desse gasto?";

const CATEGORIAS: Array<{ categoria: CategoriaGasto; palavras: string[] }> = [
  { categoria: "Mercado", palavras: ["mercado", "supermercado", "atacadao", "assai", "atacarejo"] },
  { categoria: "Alimentação", palavras: ["ifood", "lanche", "lanches", "restaurante", "pizza", "almoco", "comida", "coca", "pao", "paes"] },
  { categoria: "Transporte", palavras: ["uber", "99", "onibus", "gasolina", "combustivel", "transporte", "trasporte", "tranporte"] },
  { categoria: "Moradia", palavras: ["aluguel", "condominio", "prestacao da casa"] },
  { categoria: "Contas da casa", palavras: ["energia", "luz", "agua", "internet", "celular", "gas"] },
  { categoria: "Saúde/Farmácia", palavras: ["remedio", "farmacia", "consulta", "exame", "medico"] },
  { categoria: "Educação", palavras: ["escola", "curso", "faculdade", "material escolar"] },
  { categoria: "Filhos/Família", palavras: ["filho", "filha", "fralda", "leite", "pensao", "brinquedo"] },
  { categoria: "Assinaturas", palavras: ["netflix", "spotify", "chatgpt", "chat gpt", "claude", "assinatura", "prime"] },
  { categoria: "Apostas", palavras: ["aposta", "apostas", "bet", "betano", "blaze", "tigrinho", "jogo do tigrinho", "cassino", "cassino online", "roleta", "foguetinho", "pix bet", "banca", "casa de aposta", "jogo online"] },
  { categoria: "Lazer", palavras: ["cerveja", "cinema", "festa", "bar", "viagem", "lazer"] },
  { categoria: "Beleza/Cuidados", palavras: ["cabelo", "unha", "perfume", "skincare", "academia", "barbearia"] },
  { categoria: "Trabalho/Negócio", palavras: ["fornecedor", "ferramenta", "anuncio", "trafego", "sistema", "negocio"] },
  { categoria: "Dívidas/Cartões", palavras: ["cartao", "nubank", "fatura", "emprestimo", "parcela"] },
];

const PALAVRAS_GASTO = [
  "gastei",
  "gasto",
  "apostei",
  "paguei",
  "pago",
  "comprei",
  "compra",
  "pix",
  "uber",
  "ifood",
  "lanche",
  "lanches",
  "agua",
  "aguas",
  "pao",
  "paes",
  "coca",
  "transporte",
  "trasporte",
  "tranporte",
  "mercado",
  "supermercado",
  "farmacia",
  "remedio",
  "aluguel",
  "energia",
  "internet",
  "net",
  "chatgpt",
  "chat gpt",
  "claude",
  "nubank",
  "cartao",
  "credito",
  "debito",
  "netflix",
  "spotify",
  "aposta",
  "apostas",
  "bet",
  "betano",
  "blaze",
  "tigrinho",
  "cassino",
  "roleta",
  "foguetinho",
  "banca",
];

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s,./$-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalizar(texto: string): string {
  return normalizarDescricaoFinanceira(texto);
}

export function detectarMensagemDeGasto(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  if (!texto) return false;
  if (/\b(?:fecha|fechamento|vence|vencimento)\b/.test(texto)) return false;

  return PALAVRAS_GASTO.some((palavra) => {
    const escaped = palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(texto);
  });
}

export function extrairValorGasto(mensagem: string): number | undefined {
  const texto = normalizarTexto(mensagem);
  const candidatos = texto.match(/(?:r\$\s*)?\d[\d.,]*(?:\s*(?:reais|real))?/gi) ?? [];
  const candidatosComFormatoFinanceiro = candidatos.filter((candidato) =>
    /r\$|,|\.\d{1,2}\b|\b(reais|real)\b/i.test(candidato)
  );

  for (const candidato of candidatosComFormatoFinanceiro) {
    const valor = parseMoneyBR(candidato);
    if (valor) return valor;
  }

  for (const inteiro of candidatos) {
    if (inteiro.length >= 5) continue;
    if (inteiro === "99" && /\b99\b/.test(texto)) continue;
    const valor = parseMoneyBR(inteiro);
    if (valor) return valor;
  }

  return undefined;
}

function extrairDescricaoQuantidade(
  mensagem: string,
  quantidade: number,
  indiceValorUnitario: number
): string {
  const primeiraParte = /[,.]\s/.test(mensagem) ? mensagem.split(/[,.]\s/)[0]?.trim() : "";
  const primeiraParteLimpa = primeiraParte && !/\b(comprei|paguei|gastei|custou)\b/i.test(primeiraParte)
    ? primeiraParte
    : "";
  const base = primeiraParteLimpa || mensagem.slice(0, indiceValorUnitario);
  const semRuido = base
    .replace(new RegExp(`\\b${quantidade}\\b`, "g"), " ")
    .replace(
      /\b(gastei|gasto|apostei|paguei|pago|comprei|compra|pix|custou|de|do|da|no|na|em|com|pra|para|mim|mais|uma|um|duas|dois|amigos?|cada|unidade)\b/gi,
      " "
    )
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalizarDescricaoFinanceira(semRuido) || "Item";
}

function detectarQuantidadeValorUnitario(mensagem: string): {
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  descricao: string;
} | null {
  const texto = normalizarTexto(mensagem);
  const unitarioMatch = texto.match(/\b(\d[\d.,]*)\s*(?:reais?\s*)?(?:cada uma|cada um|cada|a unidade|por unidade|unidade)\b/i);
  if (!unitarioMatch || unitarioMatch.index === undefined) return null;

  const valorUnitario = parseMoneyBR(unitarioMatch[1]);
  if (!valorUnitario) return null;

  const trechoAntesValorUnitario = texto.slice(0, unitarioMatch.index);
  const quantidade = [...trechoAntesValorUnitario.matchAll(/\b\d+\b/g)]
    .map((match) => Number(match[0]))
    .find((valor) => Number.isInteger(valor) && valor > 0 && valor < 100);
  if (!quantidade) return null;

  const valorTotal = Math.round(quantidade * valorUnitario * 100) / 100;
  const descricaoBase = extrairDescricaoQuantidade(mensagem, quantidade, unitarioMatch.index);

  return {
    quantidade,
    valorUnitario,
    valorTotal,
    descricao: `${descricaoBase} — ${quantidade} ${quantidade === 1 ? "unidade" : "unidades"}`,
  };
}

export function definirCategoriaGasto(mensagem: string): CategoriaGasto {
  const texto = normalizarTexto(mensagem);

  for (const item of CATEGORIAS) {
    if (item.palavras.some((palavra) => {
      const escaped = palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(texto);
    })) {
      return item.categoria;
    }
  }

  return "Outros";
}

export function extrairDescricaoGasto(mensagem: string, categoria: CategoriaGasto): string {
  let texto = normalizarTexto(mensagem);
  texto = texto
    .replace(/r\$\s*\d{1,3}(?:\.\d{3})*,\d{1,2}/gi, " ")
    .replace(/\d{1,3}(?:\.\d{3})*,\d{1,2}\s*(?:reais|real)?/gi, " ")
    .replace(/\d+(?:[.,]\d{1,2})?\s*(?:reais|real)/gi, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\b(gastei|gasto|apostei|paguei|pago|comprei|compra|pix|custou|cada|unidade|de|do|da|no|na|em|com|hoje|ontem)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const descricao = capitalizar(texto);
  return descricao || categoria;
}

export function definirDataGasto(mensagem: string, agora = new Date()): Date {
  const texto = normalizarTexto(mensagem);
  const base = new Date(agora);

  if (/\bontem\b/.test(texto)) {
    base.setDate(base.getDate() - 1);
  }

  const dataExplicita = texto.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (dataExplicita) {
    const dia = Number(dataExplicita[1]);
    const mes = Number(dataExplicita[2]);
    const anoInformado = dataExplicita[3] ? Number(dataExplicita[3]) : base.getFullYear();
    const ano = anoInformado < 100 ? 2000 + anoInformado : anoInformado;
    const data = new Date(ano, mes - 1, dia);
    if (
      Number.isFinite(data.getTime()) &&
      data.getFullYear() === ano &&
      data.getMonth() === mes - 1 &&
      data.getDate() === dia
    ) {
      return data;
    }
  }

  return base;
}

export function formatarValorBR(valor: number): string {
  if (!Number.isFinite(valor)) return "R$ 0,00";
  return valor
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/\u00a0|\u202f/g, " ");
}

export function formatarDataBR(data: Date): string {
  if (!Number.isFinite(data.getTime())) return new Date().toLocaleDateString("pt-BR");
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

export function formatarRespostaGasto(opts: {
  descricao: string;
  valor: number;
  quantidade?: number;
  valorUnitario?: number;
  categoria: CategoriaGasto;
  data: Date;
}): string {
  const linhasQuantidade = opts.quantidade && opts.valorUnitario
    ? `🔢 *Quantidade:* ${opts.quantidade}\n` +
      `💵 *Valor unitário:* ${formatarValorBR(opts.valorUnitario)}\n`
    : "";

  return (
    "✅ *OK! Registrado.*\n\n" +
    `✍️ *Descrição:* ${opts.descricao || opts.categoria}\n` +
    linhasQuantidade +
    `💰 *Valor:* ${formatarValorBR(opts.valor)}\n` +
    `🏷️ *Categoria:* ${opts.categoria}\n` +
    `📅 *Data:* ${formatarDataBR(opts.data)}\n\n` +
    "Pode mandar mais que eu vou organizando tudo pra você. 👌"
  );
}

export function processarFluxoGasto(mensagem: string, agora = new Date()): GastoDetectado | null {
  if (!detectarMensagemDeGasto(mensagem)) return null;

  const quantidadeUnitario = detectarQuantidadeValorUnitario(mensagem);
  const categoria = definirCategoriaGasto(mensagem);
  const descricao = quantidadeUnitario?.descricao ?? extrairDescricaoGasto(mensagem, categoria);
  const data = definirDataGasto(mensagem, agora);
  const valor = quantidadeUnitario?.valorTotal ?? extrairValorGasto(mensagem);

  if (!valor) {
    return {
      pareceGasto: true,
      descricao,
      categoria,
      data,
      resposta: PERGUNTA_VALOR,
    };
  }

  return {
    pareceGasto: true,
    valor,
    quantidade: quantidadeUnitario?.quantidade,
    valorUnitario: quantidadeUnitario?.valorUnitario,
    descricao,
    categoria,
    data,
    resposta: formatarRespostaGasto({
      descricao,
      valor,
      quantidade: quantidadeUnitario?.quantidade,
      valorUnitario: quantidadeUnitario?.valorUnitario,
      categoria,
      data,
    }),
  };
}
