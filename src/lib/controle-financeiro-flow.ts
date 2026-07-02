import type { Mensagem } from "./ai-bot";
import {
  formatarDataBR,
  formatarValorBR,
  processarFluxoGasto,
  type GastoDetectado,
} from "./gasto-flow";
import { parseMoneyBR } from "./money";
import { normalizarDescricaoFinanceira } from "./descricao-financeira";
import type { FinanceiroIntent, ItemFinanceiroInterpretado } from "./ia/financeiro-intent-schema";

export const CONTROLE_FINANCEIRO_PREFIXO = "__CONTROLE_FINANCEIRO__";

export type FaturaAbertaControle = {
  cartao: string;
  valor: number;
};

export type FaturaFechadaControle = {
  cartao: string;
  valor: number;
};

export type CartaoConfiguradoControle = {
  nome: string;
  fechamento?: number;
  vencimento?: number;
};

export type DespesaFixaRegistradaControle = {
  descricao: string;
  valor: number;
};

export type ConfirmacaoPendenteControle = {
  tipo: "atualizar_despesa_fixa";
  nomeNormalizado: string;
  nomeExibido: string;
  valorAnterior: number;
  novoValor: number;
} | {
  tipo: "cadastrar_despesas_fixas";
  itens: Array<{ descricao: string; valor: number }>;
} | {
  tipo: "interpretacao_financeira";
  intent: FinanceiroIntent;
} | {
  tipo: "substituir_fatura_fechada";
  cartao: string;
  valorAnterior: number;
  novoValor: number;
};

export type UltimoGastoControle = {
  descricao: string;
  valor: number;
  categoria: string;
  data: string;
  origem: "SALDO" | "CARTAO";
  cartao?: string;
};

export type EstadoControleFinanceiro = {
  rendaMensal: number;
  totalReceitasAvulsas: number;
  totalDespesasFixas: number;
  despesasFixas: DespesaFixaRegistradaControle[];
  totalGastosSaldo: number;
  faturas: FaturaAbertaControle[];
  faturasFechadas: FaturaFechadaControle[];
  cartoes: CartaoConfiguradoControle[];
  confirmacaoPendente?: ConfirmacaoPendenteControle;
  ultimoGasto?: UltimoGastoControle;
};

export type ResultadoGastoControle = {
  resposta: string;
  estado: EstadoControleFinanceiro;
  atualizouEstado: boolean;
  etapa?: string;
};

const DESPESAS_FIXAS_ANTERIORES = "Despesas fixas anteriores";
const RESPOSTA_SEM_CONFIRMACAO_PENDENTE =
  "Não tenho nenhuma confirmação pendente agora. Pode me mandar um gasto, receita, despesa fixa ou pedir um resumo.";

const CARTOES_CONHECIDOS: Array<{ aliases: string[]; nome: string }> = [
  { aliases: ["mercado pago"], nome: "Mercado Pago" },
  { aliases: ["banco do brasil"], nome: "Banco do Brasil" },
  { aliases: ["nubank"], nome: "Nubank" },
  { aliases: ["pagbank"], nome: "PagBank" },
  { aliases: ["inter"], nome: "Inter" },
  { aliases: ["bradesco"], nome: "Bradesco" },
  { aliases: ["santander"], nome: "Santander" },
  { aliases: ["caixa"], nome: "Caixa" },
  { aliases: ["itau", "itaú"], nome: "Itaú" },
  { aliases: ["picpay"], nome: "PicPay" },
  { aliases: ["neon"], nome: "Neon" },
  { aliases: ["bb"], nome: "Banco do Brasil" },
  { aliases: ["c6"], nome: "C6" },
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

function estadoVazio(rendaMensal?: number | null): EstadoControleFinanceiro {
  return {
    rendaMensal: Number.isFinite(rendaMensal ?? NaN) ? Number(rendaMensal) : 0,
    totalReceitasAvulsas: 0,
    totalDespesasFixas: 0,
    despesasFixas: [],
    totalGastosSaldo: 0,
    faturas: [],
    faturasFechadas: [],
    cartoes: [],
  };
}

function sanitizarEstado(valor: unknown, rendaMensal?: number | null): EstadoControleFinanceiro {
  const base = estadoVazio(rendaMensal);
  if (!valor || typeof valor !== "object") return base;

  const raw = valor as Partial<EstadoControleFinanceiro>;
  const faturas = Array.isArray(raw.faturas)
    ? raw.faturas
        .map((fatura) => ({
          cartao: typeof fatura?.cartao === "string" ? fatura.cartao : "",
          valor: Number(fatura?.valor),
        }))
        .filter((fatura) => fatura.cartao && Number.isFinite(fatura.valor) && fatura.valor > 0)
    : [];
  const faturasFechadas = Array.isArray(raw.faturasFechadas)
    ? raw.faturasFechadas
        .map((fatura) => ({
          cartao: typeof fatura?.cartao === "string" ? fatura.cartao : "",
          valor: Number(fatura?.valor),
        }))
        .filter((fatura) => fatura.cartao && Number.isFinite(fatura.valor) && fatura.valor > 0)
    : [];
  const cartoes = Array.isArray(raw.cartoes)
    ? raw.cartoes
        .map((cartao) => {
          const fechamento = Number(cartao?.fechamento);
          const vencimento = Number(cartao?.vencimento);
          return {
            nome: typeof cartao?.nome === "string" ? cartao.nome : "",
            fechamento: Number.isInteger(fechamento) && fechamento >= 1 && fechamento <= 31
              ? fechamento
              : undefined,
            vencimento: Number.isInteger(vencimento) && vencimento >= 1 && vencimento <= 31
              ? vencimento
              : undefined,
          };
        })
        .filter((cartao) => cartao.nome)
    : [];
  const despesasFixas = Array.isArray(raw.despesasFixas)
    ? raw.despesasFixas
        .map((despesa) => ({
          descricao: typeof despesa?.descricao === "string" ? despesa.descricao : "",
          valor: Number(despesa?.valor),
        }))
        .filter((despesa) => despesa.descricao && Number.isFinite(despesa.valor) && despesa.valor > 0)
    : [];
  const totalLegadoDespesasFixas =
    Number.isFinite(raw.totalDespesasFixas) && Number(raw.totalDespesasFixas) > 0
      ? Number(raw.totalDespesasFixas)
      : 0;
  const despesasFixasCompat = despesasFixas.length > 0
    ? despesasFixas
    : totalLegadoDespesasFixas > 0
      ? [{ descricao: "Despesas fixas anteriores", valor: totalLegadoDespesasFixas }]
      : [];
  const totalDespesasFixas = despesasFixasCompat.reduce((soma, despesa) => soma + despesa.valor, 0);
  let confirmacaoPendente: ConfirmacaoPendenteControle | undefined;
  if (
    raw.confirmacaoPendente &&
    raw.confirmacaoPendente.tipo === "atualizar_despesa_fixa" &&
    typeof raw.confirmacaoPendente.nomeNormalizado === "string" &&
    typeof raw.confirmacaoPendente.nomeExibido === "string" &&
    Number.isFinite(raw.confirmacaoPendente.valorAnterior) &&
    Number.isFinite(raw.confirmacaoPendente.novoValor) &&
    raw.confirmacaoPendente.valorAnterior > 0 &&
    raw.confirmacaoPendente.novoValor > 0
  ) {
    confirmacaoPendente = {
      tipo: "atualizar_despesa_fixa",
      nomeNormalizado: raw.confirmacaoPendente.nomeNormalizado,
      nomeExibido: raw.confirmacaoPendente.nomeExibido,
      valorAnterior: Number(raw.confirmacaoPendente.valorAnterior),
      novoValor: Number(raw.confirmacaoPendente.novoValor),
    };
  } else if (
    raw.confirmacaoPendente &&
    raw.confirmacaoPendente.tipo === "cadastrar_despesas_fixas" &&
    Array.isArray(raw.confirmacaoPendente.itens)
  ) {
    const itens = raw.confirmacaoPendente.itens
      .map((item) => ({
        descricao: typeof item?.descricao === "string" ? item.descricao : "",
        valor: Number(item?.valor),
      }))
      .filter((item) => item.descricao && Number.isFinite(item.valor) && item.valor > 0);
    confirmacaoPendente = itens.length > 0
      ? { tipo: "cadastrar_despesas_fixas", itens }
      : undefined;
  } else if (
    raw.confirmacaoPendente &&
    raw.confirmacaoPendente.tipo === "interpretacao_financeira" &&
    raw.confirmacaoPendente.intent &&
    typeof raw.confirmacaoPendente.intent === "object"
  ) {
    confirmacaoPendente = {
      tipo: "interpretacao_financeira",
      intent: raw.confirmacaoPendente.intent as FinanceiroIntent,
    };
  } else if (
    raw.confirmacaoPendente &&
    raw.confirmacaoPendente.tipo === "substituir_fatura_fechada" &&
    typeof raw.confirmacaoPendente.cartao === "string" &&
    Number.isFinite(raw.confirmacaoPendente.valorAnterior) &&
    Number.isFinite(raw.confirmacaoPendente.novoValor) &&
    raw.confirmacaoPendente.valorAnterior > 0 &&
    raw.confirmacaoPendente.novoValor > 0
  ) {
    confirmacaoPendente = {
      tipo: "substituir_fatura_fechada",
      cartao: raw.confirmacaoPendente.cartao,
      valorAnterior: Number(raw.confirmacaoPendente.valorAnterior),
      novoValor: Number(raw.confirmacaoPendente.novoValor),
    };
  }

  return {
    rendaMensal: Number.isFinite(raw.rendaMensal) && Number(raw.rendaMensal) > 0
      ? Number(raw.rendaMensal)
      : base.rendaMensal,
    totalReceitasAvulsas: Number.isFinite(raw.totalReceitasAvulsas) && Number(raw.totalReceitasAvulsas) > 0
      ? Number(raw.totalReceitasAvulsas)
      : 0,
    totalDespesasFixas,
    despesasFixas: despesasFixasCompat,
    totalGastosSaldo: Number.isFinite(raw.totalGastosSaldo) && Number(raw.totalGastosSaldo) > 0
      ? Number(raw.totalGastosSaldo)
      : 0,
    faturas,
    faturasFechadas,
    cartoes,
    confirmacaoPendente,
    ultimoGasto:
      raw.ultimoGasto &&
      typeof raw.ultimoGasto.descricao === "string" &&
      Number.isFinite(raw.ultimoGasto.valor) &&
      raw.ultimoGasto.valor > 0 &&
      (raw.ultimoGasto.origem === "SALDO" || raw.ultimoGasto.origem === "CARTAO")
        ? {
            descricao: raw.ultimoGasto.descricao,
            valor: Number(raw.ultimoGasto.valor),
            categoria: typeof raw.ultimoGasto.categoria === "string" ? raw.ultimoGasto.categoria : "Outros",
            data: typeof raw.ultimoGasto.data === "string" ? raw.ultimoGasto.data : "",
            origem: raw.ultimoGasto.origem,
            cartao: typeof raw.ultimoGasto.cartao === "string" ? raw.ultimoGasto.cartao : undefined,
          }
        : undefined,
  };
}

export function carregarEstadoControle(
  historico: Mensagem[],
  rendaMensal?: number | null
): EstadoControleFinanceiro {
  const ultimo = [...historico]
    .reverse()
    .find((item) => item.role === "system" && item.content.startsWith(CONTROLE_FINANCEIRO_PREFIXO));

  if (!ultimo) return estadoVazio(rendaMensal);

  try {
    return sanitizarEstado(JSON.parse(ultimo.content.slice(CONTROLE_FINANCEIRO_PREFIXO.length)), rendaMensal);
  } catch {
    return estadoVazio(rendaMensal);
  }
}

export function criarMensagemEstadoControle(estado: EstadoControleFinanceiro): Mensagem {
  return {
    role: "system",
    content: `${CONTROLE_FINANCEIRO_PREFIXO}${JSON.stringify(estado)}`,
  };
}

export function atualizarDespesasFixasControle(
  estado: EstadoControleFinanceiro,
  totalDespesasFixas: number,
  rendaMensal?: number | null,
  despesasFixas?: DespesaFixaRegistradaControle[]
): EstadoControleFinanceiro {
  return {
    ...estado,
    rendaMensal: Number.isFinite(rendaMensal ?? NaN) && Number(rendaMensal) > 0
      ? Number(rendaMensal)
      : estado.rendaMensal,
    totalDespesasFixas: Number.isFinite(totalDespesasFixas) && totalDespesasFixas > 0
      ? totalDespesasFixas
      : 0,
    despesasFixas: despesasFixas ?? estado.despesasFixas ?? [],
  };
}

export function criarEstadoComConfirmacaoInterpretacaoFinanceira(
  estado: EstadoControleFinanceiro,
  intent: FinanceiroIntent
): EstadoControleFinanceiro {
  return {
    ...estado,
    faturas: estado.faturas ?? [],
    faturasFechadas: estado.faturasFechadas ?? [],
    cartoes: estado.cartoes ?? [],
    despesasFixas: estado.despesasFixas ?? [],
    confirmacaoPendente: {
      tipo: "interpretacao_financeira",
      intent,
    },
  };
}

export function calcularSaldoDisponivelControle(estado: EstadoControleFinanceiro): number {
  return estado.rendaMensal + (estado.totalReceitasAvulsas ?? 0) - estado.totalDespesasFixas - estado.totalGastosSaldo;
}

export function totalFaturasAbertasControle(estado: EstadoControleFinanceiro): number {
  return (estado.faturas ?? []).reduce((soma, fatura) => soma + fatura.valor, 0);
}

export function totalFaturasFechadasControle(estado: EstadoControleFinanceiro): number {
  return (estado.faturasFechadas ?? []).reduce((soma, fatura) => soma + fatura.valor, 0);
}

function formatarDescricaoDespesaFixa(texto: string): string {
  const limpo = texto
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—:;,.]+|[-–—:;,.]+$/g, "")
    .replace(/^(de|do|da|dos|das)\s+/i, "");
  return normalizarDescricaoFinanceira(limpo);
}

function chaveDespesaFixa(descricao: string): string {
  return normalizarTexto(descricao).replace(/\s+/g, "");
}

function ehDespesaFixaCompatibilidade(despesa: DespesaFixaRegistradaControle): boolean {
  return chaveDespesaFixa(despesa.descricao) === chaveDespesaFixa(DESPESAS_FIXAS_ANTERIORES);
}

function recalcularDespesasFixas(despesasFixas: DespesaFixaRegistradaControle[]): number {
  return despesasFixas.reduce((soma, despesa) => soma + despesa.valor, 0);
}

function despesasFixasCompatControle(estado: EstadoControleFinanceiro): DespesaFixaRegistradaControle[] {
  const despesasFixas = estado.despesasFixas ?? [];
  if (despesasFixas.length > 0) return despesasFixas;

  return Number.isFinite(estado.totalDespesasFixas) && estado.totalDespesasFixas > 0
    ? [{ descricao: DESPESAS_FIXAS_ANTERIORES, valor: estado.totalDespesasFixas }]
    : [];
}

function resumoDespesasFixasAtualizado(estado: EstadoControleFinanceiro): string {
  return (
    "📊 *Resumo atualizado*\n\n" +
    "Renda mensal\n" +
    `${formatarValorBR(estado.rendaMensal)}\n\n` +
    "Despesas fixas\n" +
    `${formatarValorBR(estado.totalDespesasFixas)}\n\n` +
    "Saldo antes dos gastos do dia a dia\n" +
    `${formatarValorBR(estado.rendaMensal - estado.totalDespesasFixas)}`
  );
}

function detectarAcaoDespesaFixa(mensagem: string): "adicionar" | "corrigir" | "remover" | "listar" | null {
  const texto = normalizarTexto(mensagem);
  const mencionaDespesaFixa = /\bdespesas?\s+fixas?\b/.test(texto);
  const mencionaRecorrencia =
    /\btodo\s+mes\b/.test(texto) ||
    /\bdespesa\s+mensal\b/.test(texto) ||
    /\bmensalidade\b/.test(texto) ||
    /\bassinatura\b/.test(texto) ||
    /\bconta\s+mensal\b/.test(texto) ||
    /\bpagamento\s+mensal\b/.test(texto) ||
    /\bgasto\s+fixo\b/.test(texto) ||
    /\bconta\s+fixa\b/.test(texto);

  if (mencionaDespesaFixa && /\b(listar|mostrar|quais|ver)\b/.test(texto)) return "listar";
  if (mencionaDespesaFixa && /\b(remover|apagar|excluir|tirar)\b/.test(texto)) return "remover";
  if (
    (mencionaDespesaFixa && /\b(corrigir|alterar|mudar|atualizar)\b/.test(texto)) ||
    (/\b(corrigir|alterar|mudar|atualizar)\b/.test(texto) && /\bnas?\s+despesas?\s+fixas?\b/.test(texto))
  ) {
    return "corrigir";
  }
  if (
    (mencionaDespesaFixa && /\b(adicionar|incluir|colocar|cadastrar)\b/.test(texto)) ||
    /\bcolocar\b.+\bcomo\s+despesa\s+fixa\b/.test(texto) ||
    /\badicionar\s+nas?\s+despesas?\s+fixas?\b/.test(texto) ||
    mencionaRecorrencia
  ) {
    return "adicionar";
  }

  return null;
}

function limparTextoDespesaFixa(linha: string): string {
  return linha
    .replace(/\b(adicionar|incluir|colocar|cadastrar|corrigir|alterar|mudar|atualizar|remover|apagar|excluir|tirar)\b/gi, " ")
    .replace(/\bcomo\s+despesa\s+fixa\b/gi, " ")
    .replace(/\b(nas?|minhas?)?\s*despesas?\s+fixas?\b/gi, " ")
    .replace(/\btodo\s+m[eê]s(?:\s+(?:pago|tenho))?\b/gi, " ")
    .replace(/\b(despesa\s+mensal|mensalidade|assinatura|conta\s+mensal|pagamento\s+mensal|gasto\s+fixo|conta\s+fixa)\b/gi, " ")
    .replace(/\bpara\b/gi, " ")
    .replace(/:/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extrairItemDespesaFixa(linha: string): DespesaFixaRegistradaControle | null {
  const limpa = limparTextoDespesaFixa(linha);
  const valorMatch = limpa.match(/(?:r\$\s*)?\d[\d.,]*(?:\s*(?:reais|real))?/i);
  if (!valorMatch) return null;

  const valor = parseMoneyBR(valorMatch[0]);
  if (!valor) return null;

  const descricao = formatarDescricaoDespesaFixa(
    `${limpa.slice(0, valorMatch.index ?? 0)} ${limpa.slice((valorMatch.index ?? 0) + valorMatch[0].length)}`
  );
  if (!descricao) return null;

  return { descricao, valor };
}

function extrairDescricaoDespesaFixa(mensagem: string): string | null {
  const limpa = limparTextoDespesaFixa(mensagem);
  const semValor = limpa.replace(/(?:r\$\s*)?\d[\d.,]*(?:\s*(?:reais|real))?/gi, " ");
  const descricao = formatarDescricaoDespesaFixa(semValor);
  return descricao || null;
}

function pareceLinhaGastoCartaoControle(linha: string): boolean {
  const texto = normalizarTexto(linha);
  return /\b\d[\d.,]*\b/.test(texto) && /\b(?:no|na|pelo|pela)\s+(?:cart\S*|banco\s+)?\S+/.test(texto);
}

function pareceLoteGastosCartaoControle(mensagem: string): boolean {
  const linhas = mensagem
    .split(/\r?\n|;/)
    .map((linha) => linha.trim())
    .filter(Boolean);
  return linhas.length >= 2 && linhas.every(pareceLinhaGastoCartaoControle);
}

function parsearItensDespesaFixa(mensagem: string): DespesaFixaRegistradaControle[] {
  return mensagem
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .filter((linha) => !pareceLinhaGastoCartaoControle(linha))
    .map(extrairItemDespesaFixa)
    .filter((item): item is DespesaFixaRegistradaControle => Boolean(item));
}

function adicionarItemDetectado(
  itens: DespesaFixaRegistradaControle[],
  descricao: string,
  valorTexto: string | undefined
): void {
  if (!valorTexto) return;
  const valor = parseMoneyBR(valorTexto);
  if (!valor) return;

  const item = {
    descricao: formatarDescricaoDespesaFixa(descricao),
    valor,
  };
  if (!item.descricao) return;

  const chave = chaveDespesaFixa(item.descricao);
  if (!itens.some((existente) => chaveDespesaFixa(existente.descricao) === chave)) {
    itens.push(item);
  }
}

function contarValoresFinanceirosNaMensagem(mensagem: string): number {
  const texto = normalizarTexto(mensagem);
  return [...texto.matchAll(/\b\d[\d.,]*\s*(?:conto|contos|real|reais)?\b/g)].length;
}

function parsearDespesasFixasFraseCorrida(mensagem: string): DespesaFixaRegistradaControle[] {
  if (/\r?\n/.test(mensagem)) return [];

  const texto = normalizarTexto(mensagem);
  if (contarValoresFinanceirosNaMensagem(mensagem) < 2) return [];

  const itens: DespesaFixaRegistradaControle[] = [];
  const valor = "(\\d[\\d.,]*)\\s*(?:conto|contos|real|reais)?";

  const internet = texto.match(new RegExp(`\\b(?:waifai|wifi|wi-fi|internet)(?:\\s+(?:da|de))?\\s*(tim)?[^.?!]*?\\b${valor}\\b`));
  if (internet) {
    adicionarItemDetectado(itens, internet[1] ? "Internet TIM" : "Internet", internet[2]);
  }

  const livros =
    texto.match(new RegExp(`\\b${valor}\\s+de\\s+livros?\\b`)) ??
    texto.match(new RegExp(`\\blivros?[^.?!]*?\\b${valor}\\b`));
  if (livros) {
    adicionarItemDetectado(itens, "Livros", livros[1]);
  }

  const transporte = texto.match(new RegExp(`\\btransporte[^.?!]*?(?:de\\s+)?\\b${valor}\\b`));
  if (transporte) {
    adicionarItemDetectado(itens, "Transporte", transporte[1]);
  }

  const materiais = texto.match(new RegExp(`\\b(?:coisas?|materiais?)[^.?!]*(?:estudar|estudo)[^.?!]*?\\b${valor}\\b`));
  if (materiais) {
    adicionarItemDetectado(itens, "Materiais de estudo", materiais[1]);
  }

  return itens;
}

function respostaConfirmarDespesasFixasDetectadas(itens: DespesaFixaRegistradaControle[]): string {
  const linhas = itens.map((item, index) =>
    `${index + 1}. ${item.descricao} — ${formatarValorBR(item.valor)}`
  );

  return (
    "Entendi que você quer cadastrar estas despesas fixas:\n\n" +
    `${linhas.join("\n")}\n\n` +
    "Confirma que todas são despesas fixas mensais?\n\n" +
    "1️⃣ Sim, cadastrar tudo\n" +
    "2️⃣ Não, quero corrigir"
  );
}

function respostaReenviarDespesasFixasEmLista(): string {
  return (
    "Identifiquei vários valores na sua mensagem, mas não tenho certeza de todos os itens.\n\n" +
    "Pode me mandar em lista, assim?\n\n" +
    "```\n" +
    "Internet 30\n" +
    "Livros 140\n" +
    "Transporte 180\n" +
    "Materiais de estudo 300\n" +
    "```"
  );
}

function linhasDespesasFixasSimples(itens: DespesaFixaRegistradaControle[]): string[] {
  return itens.flatMap((item) => [
    item.descricao,
    formatarValorBR(item.valor),
    "",
  ]);
}

function valoresIguais(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

function encontrarIndiceDespesaFixa(
  despesas: DespesaFixaRegistradaControle[],
  item: DespesaFixaRegistradaControle
): number {
  const chave = chaveDespesaFixa(item.descricao);
  return despesas.findIndex((despesa) =>
    !ehDespesaFixaCompatibilidade(despesa) && chaveDespesaFixa(despesa.descricao) === chave
  );
}

function adicionarDespesasFixasSemDuplicar(
  despesasAtuais: DespesaFixaRegistradaControle[],
  itens: DespesaFixaRegistradaControle[]
): {
  lista: DespesaFixaRegistradaControle[];
  adicionados: DespesaFixaRegistradaControle[];
  duplicados: DespesaFixaRegistradaControle[];
  conflitos: Array<{ atual: DespesaFixaRegistradaControle; novo: DespesaFixaRegistradaControle }>;
} {
  let lista = [...despesasAtuais];
  const adicionados: DespesaFixaRegistradaControle[] = [];
  const duplicados: DespesaFixaRegistradaControle[] = [];
  const conflitos: Array<{ atual: DespesaFixaRegistradaControle; novo: DespesaFixaRegistradaControle }> = [];

  for (const item of itens) {
    const indice = encontrarIndiceDespesaFixa(lista, item);
    if (indice >= 0) {
      const atual = lista[indice];
      if (valoresIguais(atual.valor, item.valor)) {
        duplicados.push(atual);
      } else {
        conflitos.push({ atual, novo: item });
      }
      continue;
    }

    lista.push(item);
    adicionados.push(item);
  }

  return { lista, adicionados, duplicados, conflitos };
}

function detectarRespostaConfirmacaoDespesaFixa(mensagem: string): "confirmar" | "negar" | null {
  const texto = normalizarTexto(mensagem);
  if (/^(1|sim|confirmar|atualizar|cadastrar)$/.test(texto)) return "confirmar";
  if (/^(2|nao|manter|corrigir)$/.test(texto)) return "negar";
  return null;
}

function ehRespostaConfirmacaoSolta(mensagem: string): boolean {
  return /^(1|2|sim|nao|confirmar|corrigir)$/.test(normalizarTexto(mensagem));
}

function respostaDespesaFixaAtualizada(
  descricao: string,
  valorAnterior: number,
  novoValor: number,
  estado: EstadoControleFinanceiro
): string {
  return (
    "✅ *Despesa fixa atualizada.*\n\n" +
    "Descrição\n" +
    `${descricao}\n\n` +
    "Valor anterior\n" +
    `${formatarValorBR(valorAnterior)}\n\n` +
    "Novo valor\n" +
    `${formatarValorBR(novoValor)}\n\n` +
    resumoDespesasFixasAtualizado(estado)
  );
}

function descricaoItemFinanceiro(item: ItemFinanceiroInterpretado): string {
  return normalizarDescricaoFinanceira(
    item.descricaoNormalizada || item.descricaoOriginal || item.categoria || "Lançamento"
  );
}

function valorValidoItemFinanceiro(item: ItemFinanceiroInterpretado): number | null {
  const valor = Number(item.valor);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

function linhasItensFinanceiros(
  itens: Array<{ descricao: string; categoria?: string; valor: number }>
): string[] {
  return itens.map((item, index) =>
    `${index + 1}. ${item.descricao}${item.categoria ? ` — ${item.categoria}` : ""} — ${formatarValorBR(item.valor)}`
  );
}

function resumoAtualizadoMes(estado: EstadoControleFinanceiro): string {
  return (
    "📊 *Resumo atualizado do mês*\n\n" +
    `💰 *Saldo disponível:* ${formatarValorBR(calcularSaldoDisponivelControle(estado))}\n` +
    `📌 *Despesas fixas:* ${formatarValorBR(estado.totalDespesasFixas)}\n` +
    `💳 *Faturas fechadas:* ${formatarValorBR(totalFaturasFechadasControle(estado))}\n` +
    `💳 *Faturas em aberto:* ${formatarValorBR(totalFaturasAbertasControle(estado))}`
  );
}

export function salvarItensConfirmadosIA(
  estadoAtual: EstadoControleFinanceiro,
  intent: FinanceiroIntent
): ResultadoGastoControle {
  const itens = Array.isArray(intent.itens) ? intent.itens : [];
  const tiposPermitidos = new Set(["receita", "despesa_variavel", "despesa_fixa"]);
  const itensValidos: Array<ItemFinanceiroInterpretado & { valor: number }> = [];
  const tiposBloqueados = new Set<string>();

  for (const item of itens) {
    if (!tiposPermitidos.has(item.tipo)) {
      tiposBloqueados.add(item.tipo || "desconhecido");
      continue;
    }

    const valor = valorValidoItemFinanceiro(item);
    const descricao = descricaoItemFinanceiro(item);
    if (!valor || !descricao) {
      return {
        resposta:
          "Não consegui salvar essa confirmação com segurança.\n\n" +
          "Encontrei um item sem valor ou descrição válida. Me envie novamente em lista.",
        estado: {
          ...estadoAtual,
          confirmacaoPendente: undefined,
        },
        atualizouEstado: true,
      };
    }

    itensValidos.push({ ...item, valor });
  }

  if (tiposBloqueados.size > 0) {
    return {
      resposta:
        "Ainda não salvei essa confirmação.\n\n" +
        "Ela tem tipo financeiro que precisa de tratamento específico: " +
        `${[...tiposBloqueados].join(", ")}.\n\n` +
        "Me envie esse item separadamente para eu registrar com segurança.",
      estado: {
        ...estadoAtual,
        confirmacaoPendente: undefined,
      },
      atualizouEstado: true,
    };
  }

  if (itensValidos.length === 0) {
    return {
      resposta:
        "Não encontrei lançamentos válidos para salvar.\n\n" +
        "Me envie novamente em lista.",
      estado: {
        ...estadoAtual,
        confirmacaoPendente: undefined,
      },
      atualizouEstado: true,
    };
  }

  const receitas = itensValidos
    .filter((item) => item.tipo === "receita")
    .map((item) => ({
      descricao: descricaoItemFinanceiro(item),
      categoria: item.categoria || "Receita",
      valor: item.valor,
    }));
  const variaveis = itensValidos
    .filter((item) => item.tipo === "despesa_variavel")
    .map((item) => ({
      descricao: descricaoItemFinanceiro(item),
      categoria: item.categoria || "Outros",
      valor: item.valor,
      origem: item.origem ?? null,
      cartao: typeof item.cartao === "string" && item.cartao.trim() ? item.cartao.trim() : null,
    }));
  const variaveisCartao = variaveis.filter((item) => item.origem === "cartao" && item.cartao);
  const variaveisSaldo = variaveis.filter((item) => item.origem !== "cartao");
  if (variaveis.some((item) => item.origem === "cartao" && !item.cartao)) {
    return {
      resposta:
        "Não consegui salvar essa confirmação com segurança.\n\n" +
        "Encontrei gasto de cartão sem nome do cartão. Me envie novamente em lista.",
      estado: {
        ...estadoAtual,
        confirmacaoPendente: undefined,
      },
      atualizouEstado: true,
    };
  }
  const fixas = itensValidos
    .filter((item) => item.tipo === "despesa_fixa")
    .map((item) => ({
      descricao: descricaoItemFinanceiro(item),
      valor: item.valor,
    }));

  const despesasAtuais = despesasFixasCompatControle(estadoAtual);
  const resultadoFixas = adicionarDespesasFixasSemDuplicar(despesasAtuais, fixas);
  const totalReceitas = receitas.reduce((soma, item) => soma + item.valor, 0);
  const totalVariaveisSaldo = variaveisSaldo.reduce((soma, item) => soma + item.valor, 0);
  const totalVariaveisCartao = variaveisCartao.reduce((soma, item) => soma + item.valor, 0);
  const faturasComVariaveisCartao = variaveisCartao.reduce(
    (faturas, item) => somarFatura(faturas, item.cartao as string, item.valor),
    estadoAtual.faturas ?? []
  );
  const totalFixasAdicionadas = resultadoFixas.adicionados.reduce((soma, item) => soma + item.valor, 0);
  const ultimoVariavel = variaveis.at(-1);
  const estado: EstadoControleFinanceiro = {
    ...estadoAtual,
    totalReceitasAvulsas: (estadoAtual.totalReceitasAvulsas ?? 0) + totalReceitas,
    totalGastosSaldo: (estadoAtual.totalGastosSaldo ?? 0) + totalVariaveisSaldo,
    despesasFixas: resultadoFixas.lista,
    totalDespesasFixas: recalcularDespesasFixas(resultadoFixas.lista),
    faturas: faturasComVariaveisCartao,
    faturasFechadas: estadoAtual.faturasFechadas ?? [],
    cartoes: estadoAtual.cartoes ?? [],
    confirmacaoPendente: undefined,
    ultimoGasto: ultimoVariavel
      ? {
          descricao: ultimoVariavel.descricao,
          valor: ultimoVariavel.valor,
          categoria: ultimoVariavel.categoria,
          data: formatarDataBR(new Date()),
          origem: ultimoVariavel.origem === "cartao" ? "CARTAO" as const : "SALDO" as const,
          ...(ultimoVariavel.origem === "cartao" && ultimoVariavel.cartao
            ? { cartao: ultimoVariavel.cartao }
            : {}),
        }
      : estadoAtual.ultimoGasto,
  };

  if (receitas.length === 1 && variaveis.length === 0 && fixas.length === 0) {
    const receita = receitas[0];
    return {
      resposta:
        "✅ *Receita registrada.*\n\n" +
        `Descrição: ${receita.descricao}\n` +
        `Categoria: ${receita.categoria}\n` +
        `Valor: ${formatarValorBR(receita.valor)}\n\n` +
        "Esse valor foi somado ao seu saldo do mês.\n\n" +
        resumoAtualizadoMes(estado),
      estado,
      atualizouEstado: true,
    };
  }

  const linhas: string[] = ["✅ *Lançamentos registrados.*", ""];

  if (receitas.length > 0) {
    linhas.push("Receitas:", ...linhasItensFinanceiros(receitas), "");
  }

  if (variaveisSaldo.length > 0) {
    linhas.push("Despesa variável:", ...linhasItensFinanceiros(variaveisSaldo), "");
  }

  if (variaveisCartao.length > 0) {
    linhas.push(
      "Gastos no cartão:",
      ...variaveisCartao.map((item, index) =>
        `${index + 1}. ${item.descricao} — Cartão ${item.cartao} — ${formatarValorBR(item.valor)}`
      ),
      ""
    );
  }

  if (resultadoFixas.adicionados.length > 0) {
    linhas.push(
      "Despesas fixas mensais:",
      ...linhasItensFinanceiros(resultadoFixas.adicionados.map((item) => ({
        descricao: item.descricao,
        valor: item.valor,
      }))),
      ""
    );
  }

  if (resultadoFixas.duplicados.length > 0) {
    linhas.push(
      "Despesas fixas já cadastradas:",
      ...linhasItensFinanceiros(resultadoFixas.duplicados.map((item) => ({
        descricao: item.descricao,
        valor: item.valor,
      }))),
      "Não dupliquei esses lançamentos.",
      ""
    );
  }

  if (resultadoFixas.conflitos.length > 0) {
    linhas.push("Despesas fixas com conflito:", "");
    for (const conflito of resultadoFixas.conflitos) {
      linhas.push(
        conflito.atual.descricao,
        `Valor cadastrado: ${formatarValorBR(conflito.atual.valor)}`,
        `Valor informado: ${formatarValorBR(conflito.novo.valor)}`,
        ""
      );
    }
    linhas.push("Não alterei esses itens automaticamente. Envie uma correção específica para atualizar.", "");
  }

  linhas.push("Resumo:");
  if (totalReceitas > 0) linhas.push(`Receitas registradas: ${formatarValorBR(totalReceitas)}`);
  if (totalFixasAdicionadas > 0) linhas.push(`Despesas fixas adicionadas: ${formatarValorBR(totalFixasAdicionadas)}`);
  if (totalVariaveisSaldo > 0) linhas.push(`Despesas variáveis registradas: ${formatarValorBR(totalVariaveisSaldo)}`);
  if (totalVariaveisCartao > 0) linhas.push(`Gastos no cartão registrados: ${formatarValorBR(totalVariaveisCartao)}`);
  if (resultadoFixas.duplicados.length > 0) linhas.push(`Despesas fixas duplicadas ignoradas: ${resultadoFixas.duplicados.length}`);
  if (resultadoFixas.conflitos.length > 0) linhas.push(`Despesas fixas com conflito: ${resultadoFixas.conflitos.length}`);
  linhas.push("", resumoAtualizadoMes(estado));

  return {
    resposta: linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    estado,
    atualizouEstado: true,
  };
}

function processarConfirmacaoPendenteDespesaFixa(
  mensagem: string,
  estadoAtual: EstadoControleFinanceiro
): ResultadoGastoControle | null {
  const pendente = estadoAtual.confirmacaoPendente;
  if (!pendente) {
    if (!ehRespostaConfirmacaoSolta(mensagem)) return null;

    return {
      resposta: RESPOSTA_SEM_CONFIRMACAO_PENDENTE,
      estado: estadoAtual,
      atualizouEstado: false,
    };
  }

  const resposta = detectarRespostaConfirmacaoDespesaFixa(mensagem);
  if (!resposta) return null;

  const despesasAtuais = despesasFixasCompatControle(estadoAtual);

  if (pendente.tipo === "cadastrar_despesas_fixas") {
    if (resposta === "negar") {
      return {
        resposta:
          "Tudo bem, não cadastrei nada.\n\n" +
          "Pode me mandar a lista corrigida assim:\n\n" +
          "```\n" +
          "Internet 30\n" +
          "Livros 140\n" +
          "Transporte 180\n" +
          "Materiais de estudo 300\n" +
          "```",
        estado: {
          ...estadoAtual,
          despesasFixas: despesasAtuais,
          totalDespesasFixas: recalcularDespesasFixas(despesasAtuais),
          confirmacaoPendente: undefined,
        },
        atualizouEstado: true,
      };
    }

    const resultadoAdicao = adicionarDespesasFixasSemDuplicar(despesasAtuais, pendente.itens);
    const despesasFixas = resultadoAdicao.lista;
    const totalAdicionado = resultadoAdicao.adicionados.reduce((soma, item) => soma + item.valor, 0);
    const totalDespesasFixas = recalcularDespesasFixas(despesasFixas);
    const estado = {
      ...estadoAtual,
      despesasFixas,
      totalDespesasFixas,
      confirmacaoPendente: undefined,
      faturas: estadoAtual.faturas ?? [],
      cartoes: estadoAtual.cartoes ?? [],
    };
    const linhasResposta: string[] = [];

    if (
      resultadoAdicao.adicionados.length === 0 &&
      resultadoAdicao.conflitos.length === 0 &&
      resultadoAdicao.duplicados.length > 0
    ) {
      linhasResposta.push(
        "ℹ️ *Despesas fixas já cadastradas.*",
        "",
        "Identifiquei que estes itens já estavam na sua lista:",
        "",
        ...linhasDespesasFixasSimples(resultadoAdicao.duplicados),
        "Não dupliquei esses lançamentos.",
        "",
        resumoDespesasFixasAtualizado(estado)
      );
    } else {
      linhasResposta.push(
        resultadoAdicao.adicionados.length > 0
          ? "✅ *Despesas fixas adicionadas.*"
          : "ℹ️ *Nenhuma despesa fixa nova adicionada.*",
        ""
      );

      if (resultadoAdicao.adicionados.length > 0) {
        linhasResposta.push(
          "Adicionadas",
          "",
          ...linhasDespesasFixasSimples(resultadoAdicao.adicionados),
          "Total adicionado",
          formatarValorBR(totalAdicionado),
          ""
        );
      }

      if (resultadoAdicao.duplicados.length > 0) {
        linhasResposta.push(
          "Duplicadas ignoradas",
          "",
          ...linhasDespesasFixasSimples(resultadoAdicao.duplicados),
          "Não dupliquei esses lançamentos.",
          ""
        );
      }

      if (resultadoAdicao.conflitos.length > 0) {
        linhasResposta.push("Conflitos não alterados", "");
        for (const conflito of resultadoAdicao.conflitos) {
          linhasResposta.push(
            conflito.atual.descricao,
            `Valor cadastrado: ${formatarValorBR(conflito.atual.valor)}`,
            `Valor informado: ${formatarValorBR(conflito.novo.valor)}`,
            ""
          );
        }
        linhasResposta.push("Para alterar algum valor, envie uma correção específica.", "");
      }

      linhasResposta.push(resumoDespesasFixasAtualizado(estado));
    }

    return {
      resposta: linhasResposta.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      estado,
      atualizouEstado: true,
      etapa: "AGUARDANDO_GASTOS",
    };
  }

  if (pendente.tipo === "interpretacao_financeira") {
    const estado = {
      ...estadoAtual,
      despesasFixas: despesasAtuais,
      totalDespesasFixas: recalcularDespesasFixas(despesasAtuais),
      confirmacaoPendente: undefined,
    };

    if (resposta === "negar") {
      return {
        resposta: "Tudo bem, não salvei nada. Pode reenviar os lançamentos corrigidos.",
        estado,
        atualizouEstado: true,
      };
    }

    return salvarItensConfirmadosIA(estado, pendente.intent);
  }

  if (pendente.tipo !== "atualizar_despesa_fixa") return null;

  if (resposta === "negar") {
    const estado = {
      ...estadoAtual,
      despesasFixas: despesasAtuais,
      totalDespesasFixas: recalcularDespesasFixas(despesasAtuais),
      confirmacaoPendente: undefined,
    };

    return {
      resposta:
        "Tudo bem, mantive como está.\n\n" +
        `${pendente.nomeExibido}\n` +
        `${formatarValorBR(pendente.valorAnterior)}`,
      estado,
      atualizouEstado: true,
    };
  }

  const indice = despesasAtuais.findIndex((despesa) =>
    !ehDespesaFixaCompatibilidade(despesa) && chaveDespesaFixa(despesa.descricao) === pendente.nomeNormalizado
  );

  if (indice < 0) {
    return {
      resposta: "Não encontrei essa despesa fixa para atualizar.",
      estado: {
        ...estadoAtual,
        despesasFixas: despesasAtuais,
        totalDespesasFixas: recalcularDespesasFixas(despesasAtuais),
        confirmacaoPendente: undefined,
      },
      atualizouEstado: true,
    };
  }

  const anterior = despesasAtuais[indice];
  const despesasFixas = despesasAtuais.map((despesa, index) =>
    index === indice ? { ...despesa, valor: pendente.novoValor } : despesa
  );
  const estado = {
    ...estadoAtual,
    despesasFixas,
    totalDespesasFixas: recalcularDespesasFixas(despesasFixas),
    confirmacaoPendente: undefined,
  };

  return {
    resposta: respostaDespesaFixaAtualizada(
      anterior.descricao,
      anterior.valor,
      pendente.novoValor,
      estado
    ),
    estado,
    atualizouEstado: true,
  };
}

export function gerenciarDespesasFixasControle(
  mensagem: string,
  estadoAtual: EstadoControleFinanceiro
): ResultadoGastoControle | null {
  const confirmacao = processarConfirmacaoPendenteDespesaFixa(mensagem, estadoAtual);
  if (confirmacao) return confirmacao;
  if (pareceLoteGastosCartaoControle(mensagem)) return null;

  const acao = detectarAcaoDespesaFixa(mensagem);
  if (!acao) return null;

  const despesasAtuais = despesasFixasCompatControle(estadoAtual);

  if (acao === "listar") {
    const total = recalcularDespesasFixas(despesasAtuais);
    const linhas = despesasAtuais.flatMap((despesa) => [
      despesa.descricao,
      formatarValorBR(despesa.valor),
      "",
    ]);
    linhas.push("Total fixo mensal", formatarValorBR(total));

    return {
      resposta: "📌 *Suas despesas fixas*\n\n" + linhas.join("\n").trim(),
      estado: {
        ...estadoAtual,
        despesasFixas: despesasAtuais,
        totalDespesasFixas: total,
      },
      atualizouEstado: false,
    };
  }

  if (acao === "adicionar") {
    const itensFraseCorrida = parsearDespesasFixasFraseCorrida(mensagem);
    if (itensFraseCorrida.length >= 2) {
      return {
        resposta: respostaConfirmarDespesasFixasDetectadas(itensFraseCorrida),
        estado: {
          ...estadoAtual,
          despesasFixas: despesasAtuais,
          totalDespesasFixas: recalcularDespesasFixas(despesasAtuais),
          confirmacaoPendente: {
            tipo: "cadastrar_despesas_fixas",
            itens: itensFraseCorrida,
          },
          faturas: estadoAtual.faturas ?? [],
          cartoes: estadoAtual.cartoes ?? [],
        },
        atualizouEstado: true,
      };
    }

    if (!/\r?\n/.test(mensagem) && contarValoresFinanceirosNaMensagem(mensagem) >= 2) {
      return {
        resposta: respostaReenviarDespesasFixasEmLista(),
        estado: estadoAtual,
        atualizouEstado: false,
      };
    }

    const itens = parsearItensDespesaFixa(mensagem);
    if (itens.length === 0) return null;

    const resultadoAdicao = adicionarDespesasFixasSemDuplicar(despesasAtuais, itens);
    const despesasFixas = resultadoAdicao.lista;
    const totalDespesasFixas = recalcularDespesasFixas(despesasFixas);
    const estado = {
      ...estadoAtual,
      despesasFixas,
      totalDespesasFixas,
      faturas: estadoAtual.faturas ?? [],
      cartoes: estadoAtual.cartoes ?? [],
    };

    if (resultadoAdicao.adicionados.length === 0 && resultadoAdicao.conflitos.length === 0 && resultadoAdicao.duplicados.length > 0) {
      const duplicado = resultadoAdicao.duplicados[0];
      return {
        resposta:
          "ℹ️ *Despesa fixa já cadastrada.*\n\n" +
          `${duplicado.descricao}\n` +
          `${formatarValorBR(duplicado.valor)}\n\n` +
          "Não dupliquei esse lançamento.",
        estado: estadoAtual,
        atualizouEstado: false,
      };
    }

    if (resultadoAdicao.adicionados.length === 0 && resultadoAdicao.conflitos.length > 0) {
      const conflito = resultadoAdicao.conflitos[0];
      const estadoComPendencia = {
        ...estadoAtual,
        despesasFixas: despesasAtuais,
        totalDespesasFixas: recalcularDespesasFixas(despesasAtuais),
        faturas: estadoAtual.faturas ?? [],
        cartoes: estadoAtual.cartoes ?? [],
        confirmacaoPendente: {
          tipo: "atualizar_despesa_fixa" as const,
          nomeNormalizado: chaveDespesaFixa(conflito.atual.descricao),
          nomeExibido: conflito.atual.descricao,
          valorAnterior: conflito.atual.valor,
          novoValor: conflito.novo.valor,
        },
      };
      return {
        resposta:
          "⚠️ *Despesa fixa já existe.*\n\n" +
          `${conflito.atual.descricao} está cadastrada por ${formatarValorBR(conflito.atual.valor)}.\n\n` +
          `Você quis atualizar para ${formatarValorBR(conflito.novo.valor)}?\n\n` +
          "Responda:\n" +
          "1️⃣ Sim, atualizar\n" +
          "2️⃣ Não, manter como está",
        estado: estadoComPendencia,
        atualizouEstado: true,
      };
    }

    if (resultadoAdicao.adicionados.length === 1 && resultadoAdicao.duplicados.length === 0 && resultadoAdicao.conflitos.length === 0) {
      const item = resultadoAdicao.adicionados[0];
      return {
        resposta:
          "✅ *Despesa fixa adicionada.*\n\n" +
          "Descrição\n" +
          `${item.descricao}\n\n` +
          "Valor mensal\n" +
          `${formatarValorBR(item.valor)}\n\n` +
          resumoDespesasFixasAtualizado(estado),
        estado,
        atualizouEstado: true,
      };
    }

    const totalAdicionado = resultadoAdicao.adicionados.reduce((soma, item) => soma + item.valor, 0);
    const linhasItens = resultadoAdicao.adicionados.flatMap((item) => [
      item.descricao,
      formatarValorBR(item.valor),
      "",
    ]);
    linhasItens.push("Total adicionado", formatarValorBR(totalAdicionado));
    if (resultadoAdicao.duplicados.length > 0) {
      linhasItens.push(
        "",
        "Duplicadas ignoradas",
        ...resultadoAdicao.duplicados.flatMap((item) => [item.descricao, formatarValorBR(item.valor), ""])
      );
    }
    if (resultadoAdicao.conflitos.length > 0) {
      linhasItens.push(
        "",
        "Conflitos não alterados",
        ...resultadoAdicao.conflitos.flatMap((conflito) => [
          `${conflito.atual.descricao} atual`,
          formatarValorBR(conflito.atual.valor),
          `${conflito.atual.descricao} informado`,
          formatarValorBR(conflito.novo.valor),
          "",
        ])
      );
    }

    return {
      resposta:
        `${resultadoAdicao.adicionados.length > 0 ? "✅ *Despesas fixas adicionadas.*" : "ℹ️ *Nenhuma despesa fixa nova adicionada.*"}\n\n` +
        `${linhasItens.join("\n").trim()}\n\n` +
        resumoDespesasFixasAtualizado(estado),
      estado,
      atualizouEstado: resultadoAdicao.adicionados.length > 0,
    };
  }

  if (acao === "corrigir") {
    const item = extrairItemDespesaFixa(mensagem);
    if (!item) return null;

    const indice = encontrarIndiceDespesaFixa(despesasAtuais, item);
    if (indice < 0) {
      return {
        resposta: "Não encontrei essa despesa fixa para atualizar.",
        estado: estadoAtual,
        atualizouEstado: false,
      };
    }

    const anterior = despesasAtuais[indice];
    const despesasFixas = despesasAtuais.map((despesa, index) => index === indice ? item : despesa);
    const estado = {
      ...estadoAtual,
      despesasFixas,
      totalDespesasFixas: recalcularDespesasFixas(despesasFixas),
    };

    return {
      resposta:
        "✅ *Despesa fixa atualizada.*\n\n" +
        "Descrição\n" +
        `${item.descricao}\n\n` +
        "Valor anterior\n" +
        `${formatarValorBR(anterior.valor)}\n\n` +
        "Novo valor\n" +
        `${formatarValorBR(item.valor)}\n\n` +
        resumoDespesasFixasAtualizado(estado),
      estado,
      atualizouEstado: true,
    };
  }

  const descricao = extrairDescricaoDespesaFixa(mensagem);
  if (!descricao) return null;

  const chave = chaveDespesaFixa(descricao);
  const removida = despesasAtuais.find((despesa) =>
    !ehDespesaFixaCompatibilidade(despesa) && chaveDespesaFixa(despesa.descricao) === chave
  );
  if (!removida) {
    return {
      resposta: "Não encontrei essa despesa fixa para remover.",
      estado: estadoAtual,
      atualizouEstado: false,
    };
  }

  const despesasFixas = despesasAtuais.filter((despesa) =>
    ehDespesaFixaCompatibilidade(despesa) || chaveDespesaFixa(despesa.descricao) !== chave
  );
  const estado = {
    ...estadoAtual,
    despesasFixas,
    totalDespesasFixas: recalcularDespesasFixas(despesasFixas),
  };

  return {
    resposta:
      "✅ *Despesa fixa removida.*\n\n" +
      "Descrição\n" +
      `${removida.descricao}\n\n` +
      "Valor removido\n" +
      `${formatarValorBR(removida.valor)}\n\n` +
      resumoDespesasFixasAtualizado(estado),
    estado,
    atualizouEstado: true,
  };
}

export function corrigirRendaControle(
  mensagem: string,
  estadoAtual: EstadoControleFinanceiro
): ResultadoGastoControle | null {
  const texto = normalizarTexto(mensagem);
  const mencionaRenda = /\b(renda|salario|salario liquido|ganho|recebo|entra por mes|entra no mes)\b/.test(texto);
  const rendaAnterior = Number.isFinite(estadoAtual.rendaMensal) && estadoAtual.rendaMensal > 0
    ? estadoAtual.rendaMensal
    : 0;
  const pareceCorrecao =
    /\b(corrija|corrigir|conserte|ajuste|atualize|correta)\b/.test(texto) ||
    /\brenda\s*=/.test(mensagem.toLowerCase()) ||
    (rendaAnterior > 0 && /\bminha renda\b/.test(texto));

  if (!mencionaRenda || !pareceCorrecao) return null;

  const novaRenda = parseMoneyBR(mensagem);
  if (!novaRenda) return null;

  const estado: EstadoControleFinanceiro = {
    ...estadoAtual,
    faturas: estadoAtual.faturas ?? [],
    cartoes: estadoAtual.cartoes ?? [],
    rendaMensal: novaRenda,
  };

  const linhasResposta = rendaAnterior > 0
    ? [
        "✅ *Renda atualizada.*",
        "",
        "Renda anterior",
        formatarValorBR(rendaAnterior),
        "",
        "Nova renda",
        formatarValorBR(novaRenda),
      ]
    : [
        "✅ *Renda registrada.*",
        "",
        "Renda mensal",
        formatarValorBR(novaRenda),
      ];

  if (estado.totalDespesasFixas > 0) {
    linhasResposta.push(
      "",
      "📊 *Resumo atualizado*",
      "",
      "Renda mensal",
      formatarValorBR(estado.rendaMensal),
      "",
      "Despesas fixas",
      formatarValorBR(estado.totalDespesasFixas),
      "",
      "Saldo antes dos gastos do dia a dia",
      formatarValorBR(estado.rendaMensal - estado.totalDespesasFixas)
    );
  }

  return {
    resposta: linhasResposta.join("\n"),
    estado,
    atualizouEstado: true,
  };
}

function detectarCartao(mensagem: string): string | null {
  const texto = normalizarTexto(mensagem);

  for (const cartao of CARTOES_CONHECIDOS) {
    for (const alias of cartao.aliases) {
      const aliasNormalizado = normalizarTexto(alias);
      const regex = new RegExp(`\\b(?:no|na|pelo|pela|cartao|cartão)\\s+${aliasNormalizado.replace(/\s+/g, "\\s+")}\\b`);
      if (regex.test(texto)) return cartao.nome;
    }
  }

  return null;
}

export function normalizarNomeCartaoControle(mensagem: string): string | null {
  const texto = normalizarTexto(mensagem);

  for (const cartao of CARTOES_CONHECIDOS) {
    for (const alias of cartao.aliases) {
      const aliasNormalizado = normalizarTexto(alias).replace(/\s+/g, "\\s+");
      const regex = new RegExp(`\\b${aliasNormalizado}\\b`);
      if (regex.test(texto)) return cartao.nome;
    }
  }

  return null;
}

function extrairDiaCartaoControle(mensagem: string, tipo: "fechamento" | "vencimento"): number | null {
  const texto = normalizarTexto(mensagem);
  const regex = tipo === "fechamento"
    ? /\bfecha(?:mento)?(?:\s+dia)?\s+(\d{1,2})\b/
    : /\b(?:vence|vencimento)(?:\s+dia)?\s+(\d{1,2})\b/;
  const match = texto.match(regex);
  return match ? Number(match[1]) : null;
}

function contemPedidoConfiguracaoCartao(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return /\b(?:fecha|fechamento|vence|vencimento)\b/.test(texto);
}

function diaValido(dia: number | null): boolean {
  return dia === null || (Number.isInteger(dia) && dia >= 1 && dia <= 31);
}

function formatarDiaCartao(dia: number): string {
  return dia < 10 ? `0${dia}` : String(dia);
}

function respostaDiaInvalido(tipo: "fechamento" | "vencimento", cartao: string): string {
  return (
    `Não consegui salvar esse ${tipo}.\n\n` +
    "O dia precisa estar entre 1 e 31.\n\n" +
    "Exemplo:\n" +
    `${cartao} ${tipo === "fechamento" ? "fecha" : "vence"} dia 05`
  );
}

function obterCartaoConfigurado(
  estado: EstadoControleFinanceiro,
  cartao: string | null
): CartaoConfiguradoControle | undefined {
  if (!cartao) return undefined;
  return (estado.cartoes ?? []).find((item) => item.nome === cartao);
}

function removerFaturaAbertaCartao(
  faturas: FaturaAbertaControle[],
  cartao: string
): FaturaAbertaControle[] {
  return (faturas ?? []).filter((fatura) => fatura.cartao !== cartao);
}

function substituirFaturaFechada(
  faturasFechadas: FaturaFechadaControle[],
  cartao: string,
  valor: number
): FaturaFechadaControle[] {
  return [
    ...(faturasFechadas ?? []).filter((fatura) => fatura.cartao !== cartao),
    { cartao, valor },
  ];
}

function detectarPagamentoFaturaCartao(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return /\b(?:paguei|pagar|paga|quitei|quitar|pagamento)\b/.test(texto) && /\bfatura\b/.test(texto);
}

function detectarFechamentoFaturaCartao(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return /\bfatura\b/.test(texto) && /\b(?:fechou|fechada|fechar)\b/.test(texto);
}

function respostaPagamentoFaturaNaoImplementado(): string {
  return (
    "Entendi que você quer registrar pagamento de fatura, mas esse fluxo ainda será conectado. " +
    "Por enquanto, posso registrar a fatura fechada ou gastos no cartão."
  );
}

function respostaFaturaFechadaRegistrada(
  estado: EstadoControleFinanceiro,
  cartao: string,
  valor: number
): string {
  const cartaoConfigurado = obterCartaoConfigurado(estado, cartao);
  const linhas = [
    "✅ *Fatura fechada registrada.*",
    "",
    `Cartão: ${cartao}`,
    `Valor fechado: ${formatarValorBR(valor)}`,
  ];

  if (cartaoConfigurado?.vencimento) {
    linhas.push(`Vencimento: dia ${formatarDiaCartao(cartaoConfigurado.vencimento)}`);
  } else {
    linhas.push(`Vencimento ainda não informado. Para configurar, envie: ${cartao} vence dia 05`);
  }

  linhas.push("", `Nova fatura aberta: ${formatarValorBR(estado.faturas.find((fatura) => fatura.cartao === cartao)?.valor ?? 0)}`);

  return linhas.join("\n");
}

export function gerenciarFaturaCartaoControle(
  mensagem: string,
  estadoAtual: EstadoControleFinanceiro
): ResultadoGastoControle | null {
  const pendente = estadoAtual.confirmacaoPendente;
  const respostaConfirmacao = detectarRespostaConfirmacaoDespesaFixa(mensagem);

  if (pendente?.tipo === "substituir_fatura_fechada") {
    if (!respostaConfirmacao) return null;

    const estadoBase = {
      ...estadoAtual,
      faturas: estadoAtual.faturas ?? [],
      faturasFechadas: estadoAtual.faturasFechadas ?? [],
      cartoes: estadoAtual.cartoes ?? [],
      confirmacaoPendente: undefined,
    };

    if (respostaConfirmacao === "negar") {
      return {
        resposta:
          "Tudo bem, mantive a fatura fechada como está.\n\n" +
          `Cartão: ${pendente.cartao}\n` +
          `Valor fechado: ${formatarValorBR(pendente.valorAnterior)}`,
        estado: estadoBase,
        atualizouEstado: true,
      };
    }

    const estado = {
      ...estadoBase,
      faturasFechadas: substituirFaturaFechada(
        estadoBase.faturasFechadas,
        pendente.cartao,
        pendente.novoValor
      ),
    };

    return {
      resposta:
        "✅ *Fatura fechada substituída.*\n\n" +
        `Cartão: ${pendente.cartao}\n` +
        `Valor anterior: ${formatarValorBR(pendente.valorAnterior)}\n` +
        `Novo valor fechado: ${formatarValorBR(pendente.novoValor)}`,
      estado,
      atualizouEstado: true,
    };
  }

  if (detectarPagamentoFaturaCartao(mensagem)) {
    return {
      resposta: respostaPagamentoFaturaNaoImplementado(),
      estado: estadoAtual,
      atualizouEstado: false,
    };
  }

  if (!detectarFechamentoFaturaCartao(mensagem)) return null;

  const cartao = normalizarNomeCartaoControle(mensagem);
  const valor = parseMoneyBR(mensagem);
  if (!cartao || !valor) return null;

  const faturasFechadasAtuais = estadoAtual.faturasFechadas ?? [];
  const existente = faturasFechadasAtuais.find((fatura) => fatura.cartao === cartao);

  if (existente) {
    if (valoresIguais(existente.valor, valor)) {
      return {
        resposta:
          "ℹ️ *Fatura fechada já registrada.*\n\n" +
          `Cartão: ${cartao}\n` +
          `Valor fechado: ${formatarValorBR(existente.valor)}\n\n` +
          "Não dupliquei esse registro.",
        estado: {
          ...estadoAtual,
          faturas: estadoAtual.faturas ?? [],
          faturasFechadas: faturasFechadasAtuais,
          cartoes: estadoAtual.cartoes ?? [],
        },
        atualizouEstado: false,
      };
    }

    return {
      resposta:
        `Já existe uma fatura fechada do ${cartao} por ${formatarValorBR(existente.valor)}.\n` +
        `Você quer substituir por ${formatarValorBR(valor)}?\n\n` +
        "1️⃣ Sim, substituir\n" +
        "2️⃣ Não, manter como está",
      estado: {
        ...estadoAtual,
        faturas: estadoAtual.faturas ?? [],
        faturasFechadas: faturasFechadasAtuais,
        cartoes: estadoAtual.cartoes ?? [],
        confirmacaoPendente: {
          tipo: "substituir_fatura_fechada",
          cartao,
          valorAnterior: existente.valor,
          novoValor: valor,
        },
      },
      atualizouEstado: true,
    };
  }

  const estado = {
    ...estadoAtual,
    faturas: removerFaturaAbertaCartao(estadoAtual.faturas ?? [], cartao),
    faturasFechadas: substituirFaturaFechada(faturasFechadasAtuais, cartao, valor),
    cartoes: estadoAtual.cartoes ?? [],
    confirmacaoPendente: undefined,
  };

  return {
    resposta: respostaFaturaFechadaRegistrada(estado, cartao, valor),
    estado,
    atualizouEstado: true,
  };
}

export function configurarCartaoControle(
  mensagem: string,
  estadoAtual: EstadoControleFinanceiro
): ResultadoGastoControle | null {
  if (!contemPedidoConfiguracaoCartao(mensagem)) return null;

  const nomeCartao = normalizarNomeCartaoControle(mensagem);
  if (!nomeCartao) return null;

  const fechamentoInformado = extrairDiaCartaoControle(mensagem, "fechamento");
  const vencimentoInformado = extrairDiaCartaoControle(mensagem, "vencimento");
  if (fechamentoInformado === null && vencimentoInformado === null) return null;

  if (!diaValido(fechamentoInformado)) {
    return {
      resposta: respostaDiaInvalido("fechamento", nomeCartao),
      estado: estadoAtual,
      atualizouEstado: false,
    };
  }

  if (!diaValido(vencimentoInformado)) {
    return {
      resposta: respostaDiaInvalido("vencimento", nomeCartao),
      estado: estadoAtual,
      atualizouEstado: false,
    };
  }

  const existente = (estadoAtual.cartoes ?? []).find((cartao) => cartao.nome === nomeCartao);
  const cartaoAtualizado: CartaoConfiguradoControle = {
    nome: nomeCartao,
    fechamento: fechamentoInformado ?? existente?.fechamento,
    vencimento: vencimentoInformado ?? existente?.vencimento,
  };
  const estado: EstadoControleFinanceiro = {
    ...estadoAtual,
    faturas: estadoAtual.faturas ?? [],
    faturasFechadas: estadoAtual.faturasFechadas ?? [],
    cartoes: [
      ...(estadoAtual.cartoes ?? []).filter((cartao) => cartao.nome !== nomeCartao),
      cartaoAtualizado,
    ],
  };

  const linhas = [
    existente ? "✅ *Cartão atualizado.*" : "✅ *Cartão configurado.*",
    "",
    `💳 *Cartão:* ${nomeCartao}`,
  ];

  if (cartaoAtualizado.fechamento) {
    linhas.push(`📅 *Fechamento:* dia ${formatarDiaCartao(cartaoAtualizado.fechamento)}`);
  }

  if (cartaoAtualizado.vencimento) {
    linhas.push(`📆 *Vencimento:* dia ${formatarDiaCartao(cartaoAtualizado.vencimento)}`);
  }

  linhas.push("");

  if (existente) {
    linhas.push("Atualizei os dados desse cartão. 👌");
  } else if (cartaoAtualizado.fechamento && cartaoAtualizado.vencimento) {
    linhas.push("Vou usar essas datas para organizar as compras no mês certo. 👌");
  } else if (cartaoAtualizado.vencimento) {
    linhas.push(
      "Quando souber o fechamento, pode me dizer assim:\n" +
      `${nomeCartao} fecha dia 25`
    );
  } else {
    linhas.push(
      "Quando souber o vencimento, pode me dizer assim:\n" +
      `${nomeCartao} vence dia 10`
    );
  }

  return {
    resposta: linhas.join("\n"),
    estado,
    atualizouEstado: true,
  };
}

function removerTrechoCartao(mensagem: string, cartao: string | null): string {
  if (!cartao) return mensagem;
  let limpa = mensagem;

  for (const item of CARTOES_CONHECIDOS) {
    if (item.nome !== cartao) continue;
    for (const alias of item.aliases) {
      limpa = limpa.replace(new RegExp(`\\b(?:no|na|pelo|pela|cart[aã]o)\\s+${alias.replace(/\s+/g, "\\s+")}\\b`, "gi"), " ");
    }
  }

  return limpa.replace(/\s+/g, " ").trim();
}

function deveBloquearGastoUnicoPorMultiplosValores(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  const valores = texto.match(/\b\d[\d.,]*\b/g) ?? [];
  if (valores.length < 2) return false;
  if (/\b(?:cada|cada uma|cada um|unidade|por unidade|a unidade)\b/.test(texto)) return false;
  return true;
}

function somarFatura(
  faturas: FaturaAbertaControle[],
  cartao: string,
  valor: number
): FaturaAbertaControle[] {
  const faturasAtuais = faturas ?? [];
  const existentes = faturasAtuais.filter((fatura) => fatura.cartao !== cartao);
  const atual = faturasAtuais.find((fatura) => fatura.cartao === cartao)?.valor ?? 0;
  return [...existentes, { cartao, valor: atual + valor }];
}

function subtrairFatura(
  faturas: FaturaAbertaControle[],
  cartao: string,
  valor: number
): FaturaAbertaControle[] {
  const faturasAtuais = faturas ?? [];
  const atual = faturasAtuais.find((fatura) => fatura.cartao === cartao)?.valor ?? 0;
  const novoValor = Math.max(atual - valor, 0);
  const outras = faturasAtuais.filter((fatura) => fatura.cartao !== cartao);
  return novoValor > 0 ? [...outras, { cartao, valor: novoValor }] : outras;
}

function linhasFaturas(estado: EstadoControleFinanceiro): string[] {
  const faturas = estado.faturas ?? [];
  const linhas = [
    `💳 *Faturas fechadas:* ${formatarValorBR(totalFaturasFechadasControle(estado))}`,
    `💳 *Faturas em aberto:* ${formatarValorBR(totalFaturasAbertasControle(estado))}`,
  ];
  if (faturas.length === 0) {
    return linhas;
  }

  return [
    ...linhas,
    ...faturas.map((fatura) => `💳 *Fatura ${fatura.cartao}:* ${formatarValorBR(fatura.valor)}`),
  ];
}

function linhasFaturasComCartoes(estado: EstadoControleFinanceiro, cartoes: string[]): string[] {
  const faturas = estado.faturas ?? [];
  const nomes = [...faturas.map((fatura) => fatura.cartao)];
  for (const cartao of cartoes) {
    if (cartao && !nomes.includes(cartao)) nomes.push(cartao);
  }

  const linhas = [
    `💳 *Faturas fechadas:* ${formatarValorBR(totalFaturasFechadasControle(estado))}`,
    `💳 *Faturas em aberto:* ${formatarValorBR(totalFaturasAbertasControle(estado))}`,
  ];

  if (nomes.length === 0) return linhas;

  return [...linhas, ...nomes.map((cartao) => {
    const valor = faturas.find((fatura) => fatura.cartao === cartao)?.valor ?? 0;
    return `💳 *Fatura ${cartao}:* ${formatarValorBR(valor)}`;
  })];
}

function ajustarDescricaoControle(gasto: GastoDetectado): GastoDetectado {
  if (normalizarTexto(gasto.descricao) === "cerveja") {
    return { ...gasto, descricao: "Cerveja Bar" };
  }

  return gasto;
}

export function detectarCorrecaoOrigemCartao(mensagem: string): string | null {
  const texto = normalizarTexto(mensagem);

  for (const cartao of CARTOES_CONHECIDOS) {
    for (const alias of cartao.aliases) {
      const aliasNormalizado = normalizarTexto(alias).replace(/\s+/g, "\\s+");
      const regex = new RegExp(
        `\\b(?:foi|paguei|coloca|coloque|coloquei)\\s+(?:no|na|pelo|pela)?\\s*(?:cartao|cartão)?\\s*${aliasNormalizado}\\b`
      );
      if (regex.test(texto)) return cartao.nome;
    }
  }

  return null;
}

export function corrigirOrigemUltimoGastoControle(
  mensagem: string,
  estadoAtual: EstadoControleFinanceiro
): ResultadoGastoControle | null {
  const novoCartao = detectarCorrecaoOrigemCartao(mensagem);
  if (!novoCartao) return null;

  const ultimo = estadoAtual.ultimoGasto;
  if (!ultimo) {
    return {
      resposta:
        "Não encontrei um gasto recente para atualizar.\n\n" +
        "Me envie o gasto novamente informando o cartão.\n" +
        "Exemplo:\n" +
        "gastei 65 de cerveja no Nubank",
      estado: estadoAtual,
      atualizouEstado: false,
    };
  }

  let estado: EstadoControleFinanceiro = { ...estadoAtual };
  const origemAnterior = ultimo.origem === "CARTAO" && ultimo.cartao
    ? `Cartão ${ultimo.cartao}`
    : "Saldo do mês";

  if (ultimo.origem === "SALDO") {
    estado = {
      ...estado,
      totalGastosSaldo: Math.max(estado.totalGastosSaldo - ultimo.valor, 0),
    };
  } else if (ultimo.cartao) {
    estado = {
      ...estado,
      faturas: subtrairFatura(estado.faturas, ultimo.cartao, ultimo.valor),
      faturasFechadas: estado.faturasFechadas ?? [],
    };
  }

  estado = {
    ...estado,
    faturas: somarFatura(estado.faturas, novoCartao, ultimo.valor),
    faturasFechadas: estado.faturasFechadas ?? [],
    ultimoGasto: {
      ...ultimo,
      origem: "CARTAO",
      cartao: novoCartao,
    },
  };

  const cartoesParaMostrar = [ultimo.cartao, novoCartao].filter((cartao): cartao is string => Boolean(cartao));
  const linhasAtualizacao = [
    `💰 *Saldo disponível:* ${formatarValorBR(calcularSaldoDisponivelControle(estado))}`,
    ...linhasFaturasComCartoes(estado, cartoesParaMostrar),
  ];

  const resposta =
    "✅ *Origem atualizada.*\n\n" +
    `✍️ *Descrição:* ${ultimo.descricao}\n` +
    `💰 *Valor:* ${formatarValorBR(ultimo.valor)}\n\n` +
    `💳 *Origem anterior:* ${origemAnterior}\n` +
    `💳 *Nova origem:* Cartão ${novoCartao}\n\n` +
    "📊 *Atualização do mês*\n\n" +
    `${linhasAtualizacao.join("\n")}\n\n` +
    "Atualizei seu controle. 👌";

  return {
    resposta,
    estado,
    atualizouEstado: true,
  };
}

export function registrarGastoControle(
  mensagem: string,
  estadoAtual: EstadoControleFinanceiro,
  agora = new Date()
): ResultadoGastoControle | null {
  if (detectarPagamentoFaturaCartao(mensagem) || detectarFechamentoFaturaCartao(mensagem)) return null;
  if (deveBloquearGastoUnicoPorMultiplosValores(mensagem)) return null;

  const cartao = detectarCartao(mensagem);
  const mensagemSemCartao = removerTrechoCartao(mensagem, cartao);
  const gastoDetectado = processarFluxoGasto(mensagemSemCartao, agora);

  if (!gastoDetectado) return null;
  const gasto = ajustarDescricaoControle(gastoDetectado);

  if (!gasto.valor) {
    return {
      resposta: gasto.resposta,
      estado: estadoAtual,
      atualizouEstado: false,
    };
  }

  const estado = cartao
    ? {
        ...estadoAtual,
        cartoes: estadoAtual.cartoes ?? [],
        faturasFechadas: estadoAtual.faturasFechadas ?? [],
        faturas: somarFatura(estadoAtual.faturas ?? [], cartao, gasto.valor),
        ultimoGasto: {
          descricao: gasto.descricao || gasto.categoria,
          valor: gasto.valor,
          categoria: gasto.categoria,
          data: formatarDataBR(gasto.data),
          origem: "CARTAO" as const,
          cartao,
        },
      }
    : {
        ...estadoAtual,
        cartoes: estadoAtual.cartoes ?? [],
        faturas: estadoAtual.faturas ?? [],
        faturasFechadas: estadoAtual.faturasFechadas ?? [],
        totalGastosSaldo: (estadoAtual.totalGastosSaldo ?? 0) + gasto.valor,
        ultimoGasto: {
          descricao: gasto.descricao || gasto.categoria,
          valor: gasto.valor,
          categoria: gasto.categoria,
          data: formatarDataBR(gasto.data),
          origem: "SALDO" as const,
        },
      };
  const origem = cartao ? `Cartão ${cartao}` : "Saldo do mês";
  const cartaoConfigurado = obterCartaoConfigurado(estado, cartao);
  const linhasAtualizacao = [
    `💰 *Saldo disponível:* ${formatarValorBR(calcularSaldoDisponivelControle(estado))}`,
    ...linhasFaturas(estado),
  ];
  if (cartaoConfigurado?.vencimento) {
    linhasAtualizacao.push(`📆 *Vencimento:* dia ${formatarDiaCartao(cartaoConfigurado.vencimento)}`);
  }
  const final = cartao
    ? "Esse valor será considerado na fatura do cartão. 👌"
    : "Pode mandar mais que eu vou organizando tudo pra você. 👌";
  const alertaApostas = gasto.categoria === "Apostas"
    ? "\n\n⚠️ Atenção: gastos com apostas podem comprometer seu controle financeiro rapidamente."
    : "";
  const linhasQuantidade = gasto.quantidade && gasto.valorUnitario
    ? `🔢 *Quantidade:* ${gasto.quantidade}\n` +
      `💵 *Valor unitário:* ${formatarValorBR(gasto.valorUnitario)}\n`
    : "";

  const resposta =
    "✅ *OK! Registrado.*\n\n" +
    `✍️ *Descrição:* ${gasto.descricao || gasto.categoria}\n` +
    linhasQuantidade +
    `💰 *Valor:* ${formatarValorBR(gasto.valor)}\n` +
    `🏷️ *Categoria:* ${gasto.categoria}\n` +
    `💳 *Origem:* ${origem}\n` +
    `📅 *Data:* ${formatarDataBR(gasto.data)}\n\n` +
    "📊 *Atualização do mês*\n\n" +
    `${linhasAtualizacao.join("\n")}\n\n` +
    final +
    alertaApostas;

  return {
    resposta,
    estado,
    atualizouEstado: true,
  };
}
