import { parseMoneyBR, valorComMultiplicadorEscrito } from "./money";
import { normalizarDescricaoFinanceira } from "./descricao-financeira";
import { valorPorExtenso, removerValorPorExtenso } from "./numero-por-extenso";

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
  | "Compras pessoais"
  | "Impostos/Taxas"
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

export const CATEGORIAS: Array<{ categoria: CategoriaGasto; palavras: string[] }> = [
  { categoria: "Mercado", palavras: ["mercado", "mercadinho", "mercadin", "mercadao", "mercearia", "feira", "supermercado", "hipermercado", "atacadao", "assai", "atacarejo"] },
  { categoria: "Alimentação", palavras: ["ifood", "lanche", "lanxe", "lanches", "restaurante", "restarante", "padaria", "padoca", "lanchonete", "pizza", "almoco", "comida", "coca", "pao", "paes"] },
  { categoria: "Transporte", palavras: ["uber", "99", "onibus", "gasolina", "gazolina", "combustivel", "posto", "transporte", "trasporte", "tranporte"] },
  { categoria: "Moradia", palavras: ["aluguel", "condominio", "prestacao da casa"] },
  { categoria: "Contas da casa", palavras: ["energia", "luz", "agua", "internet", "celular", "gas"] },
  { categoria: "Saúde/Farmácia", palavras: ["remedio", "farmacia", "farmasa", "drogaria", "consulta", "exame", "medico"] },
  { categoria: "Educação", palavras: ["escola", "curso", "faculdade", "material escolar"] },
  { categoria: "Filhos/Família", palavras: ["filho", "filha", "fralda", "leite", "pensao", "brinquedo"] },
  { categoria: "Assinaturas", palavras: ["netflix", "spotify", "chatgpt", "chat gpt", "claude", "assinatura", "prime"] },
  { categoria: "Apostas", palavras: ["aposta", "apostas", "bet", "betano", "blaze", "tigrinho", "jogo do tigrinho", "cassino", "cassino online", "roleta", "foguetinho", "pix bet", "banca", "casa de aposta", "jogo online"] },
  { categoria: "Lazer", palavras: ["cerveja", "cinema", "festa", "bar", "viagem", "lazer"] },
  { categoria: "Beleza/Cuidados", palavras: ["cabelo", "unha", "perfume", "skincare", "academia", "barbearia"] },
  // Revisão com o ChatGPT (09/09/2026): categoria pra "comprei uma camisa
  // 90"/"tenis novo"/"celular novo" — antes caía sem boa opção em Outros,
  // Lazer ou Beleza/Cuidados.
  { categoria: "Compras pessoais", palavras: ["roupa", "roupas", "camisa", "camiseta", "calca", "tenis", "sapato", "celular", "eletronico", "eletronicos", "presente"] },
  // IPVA/IPTU/multa/tarifa — não é "dívida" nem despesa fixa de moradia,
  // categoria própria pra não poluir Outros nem Dívidas/Cartões.
  { categoria: "Impostos/Taxas", palavras: ["ipva", "iptu", "multa", "tarifa", "taxa", "imposto", "documento do carro", "licenciamento"] },
  { categoria: "Trabalho/Negócio", palavras: ["fornecedor", "ferramenta", "anuncio", "trafego", "sistema", "negocio"] },
  { categoria: "Dívidas/Cartões", palavras: ["cartao", "nubank", "fatura", "emprestimo", "parcela"] },
];

// Lista de nomes pra popular selects no Controle (web) — mesma ordem do
// catálogo acima, com "Outros" (o fallback do bot) no fim.
export const NOMES_CATEGORIAS_GASTO: CategoriaGasto[] = [...CATEGORIAS.map((c) => c.categoria), "Outros"];

// Categorias de entrada (Receita) — lista própria, sem nada a ver com as
// de gasto acima: "Salário" ou "Prêmio" não fazem sentido junto de
// "Mercado"/"Apostas" no mesmo select.
export type CategoriaReceita =
  | "Salário"
  | "Bico/Freelance"
  | "Dividendos/Investimentos"
  | "Aluguel recebido"
  | "Venda"
  | "Benefício/Auxílio"
  | "Prêmio"
  | "Gorjeta"
  | "Reembolso"
  | "Outros";

export const NOMES_CATEGORIAS_RECEITA: CategoriaReceita[] = [
  "Salário",
  "Bico/Freelance",
  "Dividendos/Investimentos",
  // Pedido do Ibrahim (09/09/2026): ele mesmo tem casas alugadas e quer
  // separar aluguel recebido de "Bico/Freelance"/"Dividendos" — renda
  // passiva de imóvel é categoria própria, não cabe bem em nenhuma das
  // outras.
  "Aluguel recebido",
  // Sugestão do ChatGPT: "vendi minha TV por 800"/"vendi roupa" não é
  // salário nem freelance — venda avulsa de bem próprio.
  "Venda",
  // Benefício/auxílio/pensão/aposentadoria/programa social — não é
  // "trabalho" (Salário/Bico) nem "investimento".
  "Benefício/Auxílio",
  "Prêmio",
  "Gorjeta",
  "Reembolso",
  "Outros",
];

const PALAVRAS_GASTO = [
  "gastei",
  "gasto",
  "apostei",
  "paguei",
  // Gírias muito comuns pra "gastei" (achado em teste ao vivo, 09/09/2026) —
  // sem elas, "torrei 200 no rolê"/"desembolsei 300 pro conserto" nunca
  // eram detectados como gasto em lugar nenhum.
  "torrei",
  "desembolsei",
  "pago",
  "comprei",
  "compra",
  // Bug achado em teste ao vivo (09/09/2026): "passei 2 mil no cartao
  // nubank" — jeito bem comum de dizer "usei o cartão pra comprar algo" —
  // nunca era reconhecido como gasto. registrarGastoControle (em
  // controle-financeiro-flow.ts) remove o trecho do cartão ("no cartao
  // nubank") ANTES de checar se a mensagem parece um gasto — e como
  // "cartao"/"nubank" eram as ÚNICAS palavras da lista que apareciam na
  // frase, sobrava só "passei 2 mil", que não batia em nada aqui.
  "passei",

  "pix",
  "uber",
  "ifood",
  "lanche",
  "lanxe",
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
  // Achado em teste ao vivo (09/09/2026): "dei 20 de gorjeta" e "rachei a
  // conta, minha parte foi 40" são jeitos comuns de descrever um gasto que
  // não usam nenhum verbo já coberto acima ("gastei"/"paguei"/...) — sem
  // essas palavras, a mensagem inteira nunca era reconhecida como gasto.
  "gorjeta",
  "rachei",
];

const TERMOS_APOSTAS =
  /\b(?:apostei|aposta|apostas|bet|betano|blaze|tigrinho|jogo\s+do\s+tigrinho|jogo\s+de\s+aposta|cassino|cassino\s+online|roleta|foguetinho|pix\s+bet|banca|casa\s+de\s+aposta|jogo\s+online)\b/;

// Saudação/marcador de conversa e de horário do dia — nunca fazem parte da
// descrição do gasto (bug achado em teste ao vivo, set/2026: "oi bom dia
// gastei 45 no mercadin hoje de manha" virava descrição "Oi bom dia mercadin
// manha"). Removidos só da DESCRIÇÃO — a extração de data (definirDataGasto)
// lê a mensagem original à parte, então "ontem"/"hoje" continuam valendo lá.
const SAUDACOES_E_MARCADORES_TEMPO =
  "oi|ola|opa|eae|oie|bom|boa|dia|tarde|noite|manha|cedo|agora|fala|blz|beleza";

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
    return new RegExp(`(^|\\s)${escaped}(\\s|$|[,.])`).test(texto);
  });
}

export function extrairValorGasto(mensagem: string): number | undefined {
  const texto = normalizarTexto(mensagem);

  // Bug achado em teste ao vivo (09/09/2026): "gastei 8 mil no conserto do
  // carro", "comprei uma moto de 15 mil" — a regex de candidato logo abaixo
  // (\d[\d.,]*) sempre cortava o dígito ANTES de "mil"/"milhão" (ex.: "8" de
  // "8 mil"), então parseMoneyBR nunca via o padrão completo e devolvia 8 em
  // vez de 8000 — silenciosamente 1000x menor, sem erro nenhum. Precisa
  // rodar ANTES da extração de candidato normal, na mensagem crua, senão o
  // "mil"/"milhão" já foi perdido.
  const valorComMil = valorComMultiplicadorEscrito(texto);
  if (valorComMil !== undefined) return valorComMil;

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

  // Sem nenhum dígito na mensagem ("gastei cem reais no mercado", "recebi
  // mil e duzentos") — tenta ler o valor por extenso antes de desistir (bug
  // achado em teste ao vivo, set/2026: sem isso, o bot ignorava o valor que
  // o cliente já tinha informado e perguntava de novo "Qual foi o valor?").
  return valorPorExtenso(texto);
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
      // "a" adicionado (achado em teste ao vivo, 09/09/2026): "comprei 3
      // refrigerantes a 5 cada" sobrava com "Refrigerantes a" na descrição
      // — a preposição "a" (de "a X reais cada"/"a X cada") não estava
      // nessa lista de palavras a remover.
      /\b(gastei|gasto|apostei|paguei|pago|comprei|compra|pix|custou|de|do|da|no|na|em|com|pra|para|mim|mais|uma|um|duas|dois|amigos?|cada|unidade|a)\b/gi,
      " "
    )
    .replace(new RegExp(`\\b(${SAUDACOES_E_MARCADORES_TEMPO})\\b`, "gi"), " ")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const textoBusca = normalizarTexto(semRuido);
  if (/\baguas?\b/.test(textoBusca)) return "Água";
  if (/\blanxes?\b|\blanches?\b/.test(textoBusca)) return "Lanches";
  if (/\bpaes?\b|\bpao\b/.test(textoBusca)) return "Pães";
  if (/\bcoca\b/.test(textoBusca)) return "Coca";

  return normalizarDescricaoFinanceira(semRuido) || "Item";
}

function detectarQuantidadeValorUnitario(mensagem: string): {
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  descricao: string;
} | null {
  const texto = normalizarTexto(mensagem);
  const valorAntes = texto.match(/\b(\d[\d.,]*)\s*(?:reais?\s*)?(?:cada uma|cada um|cada|a unidade|por unidade|unidade)\b/i);
  const valorDepois = texto.match(/\b(?:cada uma|cada um|cada)\s+(?:foi|saiu|custou|deu|ficou)\s+(\d[\d.,]*)\b/i);
  const unitarioMatch = valorAntes ?? valorDepois;
  const valorUnitarioTexto = valorAntes?.[1] ?? valorDepois?.[1];
  if (!unitarioMatch || unitarioMatch.index === undefined || !valorUnitarioTexto) return null;

  const valorUnitario = parseMoneyBR(valorUnitarioTexto);
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

  if (TERMOS_APOSTAS.test(texto)) return "Apostas";

  if (/\baguas?\b/.test(texto)) {
    if (/\b(conta|boleto|embasa|servico|residencial|casa|energia|despesa fixa|todo mes)\b/.test(texto)) {
      return "Contas da casa";
    }
    if (/\b(comprei|comprada|comprar|garrafa|beber|bebida|cada|unidade|mercado|lanche|amigo|amigos|mim)\b/.test(texto)) {
      return "Alimentação";
    }
  }

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
  if (categoria === "Apostas") return "Apostas";

  let texto = normalizarTexto(mensagem);
  texto = texto
    .replace(/r\$\s*\d{1,3}(?:\.\d{3})*,\d{1,2}/gi, " ")
    .replace(/\d{1,3}(?:\.\d{3})*,\d{1,2}\s*(?:reais|real)?/gi, " ")
    .replace(/\d+(?:[.,]\d{1,2})?\s*(?:reais|real)/gi, " ")
    // Bug achado em teste ao vivo (09/09/2026): "gastei 5k no mercado" e
    // "gastei 1.5k na consulta" sobravam com "5k"/"1.5k" na descrição —
    // "5k" é um único token (dígito colado na letra "k", sem fronteira de
    // palavra entre eles), então o \b\d+\b logo abaixo nunca casava nele.
    // Precisa de uma regex própria, igual ao "mil" já tratado por
    // removerValorPorExtenso.
    .replace(/\b\d+(?:[.,]\d{1,2})?\s*k\b/gi, " ")
    .replace(/\b\d+\b/g, " ");
  texto = removerValorPorExtenso(texto);
  texto = texto
    // "rachei a conta, minha parte foi" (achado em teste ao vivo, 09/09/2026)
    // — remove a locução inteira antes do strip de palavra única abaixo, pra
    // não sobrar "minha parte foi" grudado na descrição.
    .replace(/\bminha parte (?:foi|ficou|deu)\b/g, " ")
    .replace(/\b(gastei|gasto|apostei|paguei|pago|comprei|compra|pix|custou|cada|unidade|de|do|da|no|na|em|com|hoje|ontem)\b/g, " ")
    .replace(new RegExp(`\\b(${SAUDACOES_E_MARCADORES_TEMPO})\\b`, "gi"), " ")
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

// Recibo de compra (foto) tem CNPJ, data, número de pedido etc. — números "a
// mais" que a IA de visão pode incluir na resposta mesmo pedindo pra não
// incluir. processarFluxoGasto (via deveBloquearGastoUnicoPorMultiplosValores)
// descarta o lançamento inteiro, sem avisar o cliente, se ver mais de um
// valor solto na frase — então garante aqui, no código, que só sobra "loja" +
// "valor" antes de repassar adiante, em vez de confiar só na instrução do
// prompt de visão computacional.
export function normalizarRespostaCompraImagem(texto: string): string {
  // Valor: só dígitos/./,  que realmente formam um valor (evita pegar um "."
  // de fim de frase — "R$ 85,30." virando "85,30." e sendo lido como 8530).
  const match = texto.match(
    /compr(?:ei|a)\s+em\s+(.+?)[,:-]?\s*r\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+)/i
  );
  if (!match) return texto;

  // Nome do estabelecimento pode ter número (ex: "Posto Ipiranga 24 Horas") —
  // isso sozinho já derrubaria o lançamento inteiro mais adiante (mais de um
  // valor solto na frase), então tira dígitos do nome, só o valor pode ficar.
  const loja = match[1]
    .replace(/\d+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[,:-]+$/, "");
  if (!loja) return texto;

  return `Comprei em ${loja}, R$ ${match[2]}`;
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
