import type { Mensagem } from "./ai-bot";
import {
  formatarDataBR,
  formatarValorBR,
  processarFluxoGasto,
  type GastoDetectado,
} from "./gasto-flow";

export const CONTROLE_FINANCEIRO_PREFIXO = "__CONTROLE_FINANCEIRO__";

export type FaturaAbertaControle = {
  cartao: string;
  valor: number;
};

export type EstadoControleFinanceiro = {
  rendaMensal: number;
  totalDespesasFixas: number;
  totalGastosSaldo: number;
  faturas: FaturaAbertaControle[];
};

export type ResultadoGastoControle = {
  resposta: string;
  estado: EstadoControleFinanceiro;
  atualizouEstado: boolean;
};

const CARTOES_CONHECIDOS: Array<{ aliases: string[]; nome: string }> = [
  { aliases: ["mercado pago"], nome: "Mercado Pago" },
  { aliases: ["banco do brasil"], nome: "Banco do Brasil" },
  { aliases: ["nubank"], nome: "Nubank" },
  { aliases: ["pagbank"], nome: "PagBank" },
  { aliases: ["inter"], nome: "Inter" },
  { aliases: ["bradesco"], nome: "Bradesco" },
  { aliases: ["itau", "itaú"], nome: "Itaú" },
  { aliases: ["bb"], nome: "BB" },
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
    totalDespesasFixas: 0,
    totalGastosSaldo: 0,
    faturas: [],
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

  return {
    rendaMensal: Number.isFinite(raw.rendaMensal) && Number(raw.rendaMensal) > 0
      ? Number(raw.rendaMensal)
      : base.rendaMensal,
    totalDespesasFixas: Number.isFinite(raw.totalDespesasFixas) && Number(raw.totalDespesasFixas) > 0
      ? Number(raw.totalDespesasFixas)
      : 0,
    totalGastosSaldo: Number.isFinite(raw.totalGastosSaldo) && Number(raw.totalGastosSaldo) > 0
      ? Number(raw.totalGastosSaldo)
      : 0,
    faturas,
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
  rendaMensal?: number | null
): EstadoControleFinanceiro {
  return {
    ...estado,
    rendaMensal: Number.isFinite(rendaMensal ?? NaN) && Number(rendaMensal) > 0
      ? Number(rendaMensal)
      : estado.rendaMensal,
    totalDespesasFixas: Number.isFinite(totalDespesasFixas) && totalDespesasFixas > 0
      ? totalDespesasFixas
      : 0,
  };
}

export function calcularSaldoDisponivelControle(estado: EstadoControleFinanceiro): number {
  return estado.rendaMensal - estado.totalDespesasFixas - estado.totalGastosSaldo;
}

export function totalFaturasAbertasControle(estado: EstadoControleFinanceiro): number {
  return estado.faturas.reduce((soma, fatura) => soma + fatura.valor, 0);
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

function somarFatura(
  faturas: FaturaAbertaControle[],
  cartao: string,
  valor: number
): FaturaAbertaControle[] {
  const existentes = faturas.filter((fatura) => fatura.cartao !== cartao);
  const atual = faturas.find((fatura) => fatura.cartao === cartao)?.valor ?? 0;
  return [...existentes, { cartao, valor: atual + valor }];
}

function linhasFaturas(estado: EstadoControleFinanceiro): string[] {
  if (estado.faturas.length === 0) {
    return [`💳 *Faturas em aberto:* ${formatarValorBR(0)}`];
  }

  return estado.faturas.map((fatura) => `💳 *Fatura ${fatura.cartao}:* ${formatarValorBR(fatura.valor)}`);
}

function ajustarDescricaoControle(gasto: GastoDetectado): GastoDetectado {
  if (normalizarTexto(gasto.descricao) === "cerveja") {
    return { ...gasto, descricao: "Cerveja Bar" };
  }

  return gasto;
}

export function registrarGastoControle(
  mensagem: string,
  estadoAtual: EstadoControleFinanceiro,
  agora = new Date()
): ResultadoGastoControle | null {
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
        faturas: somarFatura(estadoAtual.faturas, cartao, gasto.valor),
      }
    : {
        ...estadoAtual,
        totalGastosSaldo: estadoAtual.totalGastosSaldo + gasto.valor,
      };
  const origem = cartao ? `Cartão ${cartao}` : "Saldo do mês";
  const linhasAtualizacao = [
    `💰 *Saldo disponível:* ${formatarValorBR(calcularSaldoDisponivelControle(estado))}`,
    ...linhasFaturas(estado),
  ];
  const final = cartao
    ? "Esse valor será considerado na fatura do cartão. 👌"
    : "Pode mandar mais que eu vou organizando tudo pra você. 👌";

  const resposta =
    "✅ *OK! Registrado.*\n\n" +
    `✍️ *Descrição:* ${gasto.descricao || gasto.categoria}\n` +
    `💰 *Valor:* ${formatarValorBR(gasto.valor)}\n` +
    `🏷️ *Categoria:* ${gasto.categoria}\n` +
    `💳 *Origem:* ${origem}\n` +
    `📅 *Data:* ${formatarDataBR(gasto.data)}\n\n` +
    "📊 *Atualização do mês*\n\n" +
    `${linhasAtualizacao.join("\n")}\n\n` +
    final;

  return {
    resposta,
    estado,
    atualizouEstado: true,
  };
}
