import type { Mensagem } from "./ai-bot";
import {
  formatarDataBR,
  formatarValorBR,
  processarFluxoGasto,
  type GastoDetectado,
} from "./gasto-flow";
import { parseMoneyBR } from "./money";

export const CONTROLE_FINANCEIRO_PREFIXO = "__CONTROLE_FINANCEIRO__";

export type FaturaAbertaControle = {
  cartao: string;
  valor: number;
};

export type CartaoConfiguradoControle = {
  nome: string;
  fechamento?: number;
  vencimento?: number;
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
  totalDespesasFixas: number;
  totalGastosSaldo: number;
  faturas: FaturaAbertaControle[];
  cartoes: CartaoConfiguradoControle[];
  ultimoGasto?: UltimoGastoControle;
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
    totalDespesasFixas: 0,
    totalGastosSaldo: 0,
    faturas: [],
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
    cartoes,
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
  return (estado.faturas ?? []).reduce((soma, fatura) => soma + fatura.valor, 0);
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
  if (faturas.length === 0) {
    return [`💳 *Faturas em aberto:* ${formatarValorBR(0)}`];
  }

  return faturas.map((fatura) => `💳 *Fatura ${fatura.cartao}:* ${formatarValorBR(fatura.valor)}`);
}

function linhasFaturasComCartoes(estado: EstadoControleFinanceiro, cartoes: string[]): string[] {
  const faturas = estado.faturas ?? [];
  const nomes = [...faturas.map((fatura) => fatura.cartao)];
  for (const cartao of cartoes) {
    if (cartao && !nomes.includes(cartao)) nomes.push(cartao);
  }

  if (nomes.length === 0) return [`💳 *Faturas em aberto:* ${formatarValorBR(0)}`];

  return nomes.map((cartao) => {
    const valor = faturas.find((fatura) => fatura.cartao === cartao)?.valor ?? 0;
    return `💳 *Fatura ${cartao}:* ${formatarValorBR(valor)}`;
  });
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
    };
  }

  estado = {
    ...estado,
    faturas: somarFatura(estado.faturas, novoCartao, ultimo.valor),
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

  const resposta =
    "✅ *OK! Registrado.*\n\n" +
    `✍️ *Descrição:* ${gasto.descricao || gasto.categoria}\n` +
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
