import { parseMoneyBR } from "./money";
import { normalizarDescricaoFinanceira } from "./descricao-financeira";

export const RESET_CONTROLE_MENSAGEM_1 =
  "✅ *Tudo zerado.*\n\n" +
  "Vamos recomeçar seu controle financeiro do zero.";
export const ETAPA_AGUARDANDO_DESPESAS_FIXAS = "AGUARDANDO_DESPESAS_FIXAS";
export const ETAPA_AGUARDANDO_GASTOS = "AGUARDANDO_GASTOS";

// Decisão do Ibrahim (set/2026): acabou o onboarding guiado — o bot não
// pergunta mais "quanto entra por mês" nem conduz um diálogo antes de
// aceitar lançamentos. A mensagem de boas-vindas agora só explica o que o
// bot faz e convida o cliente a mandar qualquer coisa (gasto, receita,
// dívida, etc.) desde a primeira mensagem, sem etapa obrigatória.
export function mensagemInicioControle(nome: string): string {
  const nomeSeguro = nome?.trim() || "cliente";

  return (
    `Olá, ${nomeSeguro}! 👋\n\n` +
    "Eu sou o *QuitaZAP Controle*, sua IA de organização financeira pelo WhatsApp.\n\n" +
    "Pode me mandar qualquer coisa: um gasto, uma receita, uma dívida, um cartão, uma meta... eu já entendo e registro pra você, sem precisar seguir um roteiro.\n\n" +
    "Exemplos:\n" +
    "```\n" +
    "gastei 45 no mercado\n" +
    "recebi 3800 de salário\n" +
    "aluguel 800 todo mês\n" +
    "```"
  );
}

export function mensagensResetControle(nome: string): [string, string] {
  return [RESET_CONTROLE_MENSAGEM_1, mensagemInicioControle(nome)];
}

export function mensagemBoasVindasControle(nome: string, oferta: string): string {
  const nomeSeguro = nome?.trim() || "cliente";
  const ofertaSegura = oferta?.trim() || "Plano QuitaZAP";

  return (
    `Olá, ${nomeSeguro}! 👋\n` +
    "Seu acesso ao *QuitaZAP Controle* foi ativado.\n\n" +
    `Sua assinatura do *${ofertaSegura}* está confirmada ✅\n\n` +
    "Eu sou o *QuitaZAP Controle*, sua IA de organização financeira pelo WhatsApp.\n\n" +
    "Pode me mandar qualquer coisa: um gasto, uma receita, uma dívida, um cartão, uma meta... eu já entendo e registro pra você, sem precisar seguir um roteiro.\n\n" +
    "Exemplos:\n" +
    "```\n" +
    "gastei 45 no mercado\n" +
    "recebi 3800 de salário\n" +
    "aluguel 800 todo mês\n" +
    "```"
  );
}

export function formatarValorControle(valor: number): string {
  if (!Number.isFinite(valor)) return "R$ 0,00";
  return valor
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/\u00a0|\u202f/g, " ");
}

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Precisa ser uma frase que DECLARA renda mensal/recorrente ("minha renda é
// 3800", "recebo 3000 por mês", "renda mensal 3500", "entra por mês 4000"),
// nunca só a presença solta de "renda"/"salário"/"ganho" em qualquer frase —
// isso incluía "recebi 200 de salário" (uma receita AVULSA, no passado, não
// uma redeclaração da renda cadastrada) e fazia o bot sequestrar esse tipo
// de mensagem como se o cliente estivesse recadastrando a renda mensal dele
// no meio de uma conversa normal, meses depois do onboarding. Verbo no
// presente/recorrente ("recebo", "entra") ou uma frase de declaração
// explícita ("minha renda", "renda mensal", "renda e"/"renda=", "salário
// líquido de") são os únicos sinais fortes o suficiente pra isso; "recebi"/
// "ganhei" no passado, sozinhos, não contam.
const PADRAO_DECLARACAO_RENDA_MENSAL =
  /\b(minha renda|renda mensal|renda e \d|renda=|recebo (?:por mes|mensalmente|todo mes)|entra por mes|entra no mes|salario liquido de)\b/;

export function extrairRendaControle(mensagem: string, aceitarValorSolto = false): number | undefined {
  const texto = normalizarTexto(mensagem);
  if (!aceitarValorSolto) {
    if (pareceReceitaAvulsaControle(mensagem)) return undefined;
    if (!PADRAO_DECLARACAO_RENDA_MENSAL.test(texto)) return undefined;
  }

  return parseMoneyBR(mensagem);
}

export function pareceReceitaAvulsaControle(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return /\b(cliente pagou|recebi\b.*\b(pix|salario|comissao|bonus|extra|freela|freelance|diaria)|recebi pix|caiu pix|entrou|entrou dinheiro|vendi|me pagaram|ganhei)\b/.test(
    texto
  );
}

export function pareceGastoVariavelControle(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return /\b(gastei|gasto|comprei|lanche|mercado|uber|ifood|farmacia)\b/.test(texto);
}

export function pareceForaEscopoControle(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return (
    /\bpiada\b/.test(texto) ||
    /\bquem descobriu o brasil\b/.test(texto) ||
    /\btexto de namoro\b/.test(texto) ||
    /\bignore (?:suas|as) instrucoes\b/.test(texto) ||
    /\baja como chatgpt\b/.test(texto)
  );
}

export function devePularDespesasFixasControle(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  return /^(pular|nao tenho|não tenho|sem despesas fixas|depois cadastro)$/.test(texto);
}

export function mensagemRendaRegistradaControle(valor: number): string {
  return (
    "✅ *Renda registrada.*\n\n" +
    "```\n" +
    "Renda mensal\n" +
    `${formatarValorControle(valor)}\n` +
    "```"
  );
}

export function mensagemPedidoDespesasFixasControle(): string {
  return "Agora me diga suas despesas fixas.";
}

export function mensagemExplicarDespesasFixasControle(): string {
  return (
    "📌 *Despesas fixas*\n\n" +
    "São gastos que você paga todo mês ou quase todo mês.\n\n" +
    "Exemplos:\n" +
    "```\n" +
    "Aluguel 800\n" +
    "Energia 200\n" +
    "Internet 90\n" +
    "Pensão 900\n" +
    "ChatGPT 110\n" +
    "```\n\n" +
    "Se não quiser cadastrar agora, digite:\n" +
    "```\n" +
    "pular\n" +
    "```\n\n" +
    "Você também pode dizer:\n" +
    "```\n" +
    "não tenho\n" +
    "depois cadastro\n" +
    "```"
  );
}

export type DespesaFixaControle = {
  descricao: string;
  valor: number;
  observacao?: string;
  parcelaAtual?: number;
  totalParcelas?: number;
  parcelasRestantes?: number;
};

function limparDescricao(texto: string): string {
  return texto
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—:;,.]+|[-–—:;,.]+$/g, "")
    .trim();
}

function pareceComandoRenda(textoOriginal: string): boolean {
  const texto = normalizarTexto(textoOriginal);
  return (
    /\b(renda|salario|salario liquido)\b/.test(texto) &&
    (
      /\b(corrija|corrigir|conserte|ajuste|atualize|correta|minha renda)\b/.test(texto) ||
      /\brenda\s*=/.test(textoOriginal.toLowerCase())
    )
  );
}

function parsearDespesasFixasInline(linha: string): DespesaFixaControle[] {
  if (/\r?\n/.test(linha)) return [];
  const texto = normalizarTexto(linha);
  const valores = texto.match(/\b\d[\d.,]*\b/g) ?? [];
  if (valores.length < 2) return [];

  const itens: DespesaFixaControle[] = [];
  const padroes: Array<{ descricao: string; regex: RegExp }> = [
    { descricao: "Energia", regex: /\benergia\s+(\d[\d.,]*)/ },
    { descricao: "Aluguel", regex: /\b(?:aluguel|akuguel)\s+(\d[\d.,]*)/ },
    { descricao: "Pensão", regex: /\bpensao\s+(\d[\d.,]*)/ },
    { descricao: "Internet", regex: /\b(?:internet|waifai|wifi|wi-fi)\s+(\d[\d.,]*)/ },
    { descricao: "ChatGPT", regex: /\bchat\s*gpt(?:\s+mes)?\s+(\d[\d.,]*)|\bchatgpt(?:\s+mes)?\s+(\d[\d.,]*)/ },
  ];

  for (const padrao of padroes) {
    const match = texto.match(padrao.regex);
    const valorTexto = match?.[1] ?? match?.[2];
    if (!valorTexto) continue;
    const valor = parseMoneyBR(valorTexto);
    if (valor) {
      itens.push({ descricao: normalizarDescricaoFinanceira(padrao.descricao), valor });
    }
  }

  return itens;
}

export function parsearDespesasFixasControle(mensagem: string): DespesaFixaControle[] {
  const itensInline = parsearDespesasFixasInline(mensagem);
  if (itensInline.length > 1) return itensInline;

  return mensagem
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      if (pareceComandoRenda(linha)) return null;

      const observacao = linha.match(/\(([^)]*)\)/)?.[1]?.trim();
      const parcelas = linha.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/);
      const linhaSemParcelas = limparDescricao(linha.replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, " "));
      const valorMatches = [...linhaSemParcelas.matchAll(/(?:r\$\s*)?\d[\d.,]*(?:\s*(?:reais|real))?/gi)];
      const valorMatch = valorMatches.at(-1);
      if (!valorMatch) return null;

      const valor = parseMoneyBR(valorMatch[0]);
      if (!valor) return null;

      const valorIndex = valorMatch.index ?? -1;
      if (valorIndex < 0) return null;

      const descricaoRaw = limparDescricao(
        linhaSemParcelas
          .slice(0, valorIndex)
          .replace(/\([^)]*\)/g, " ")
          .replace(/[-–—:]+$/g, " ")
      );
      if (!descricaoRaw) return null;

      const despesa: DespesaFixaControle = {
        descricao: normalizarDescricaoFinanceira(descricaoRaw),
        valor,
        observacao: observacao || undefined,
      };

      if (parcelas) {
        const parcelaAtual = Number(parcelas[1]);
        const totalParcelas = Number(parcelas[2]);
        if (
          Number.isInteger(parcelaAtual) &&
          Number.isInteger(totalParcelas) &&
          parcelaAtual >= 0 &&
          totalParcelas > 0
        ) {
          despesa.parcelaAtual = parcelaAtual;
          despesa.totalParcelas = totalParcelas;
          despesa.parcelasRestantes = Math.max(totalParcelas - parcelaAtual, 0);
        }
      }

      return despesa;
    })
    .filter((despesa): despesa is DespesaFixaControle => Boolean(despesa));
}

export function formatarRespostaDespesasFixasControle(
  despesas: DespesaFixaControle[],
  rendaMensal?: number | null
): string {
  return formatarMensagensDespesasFixasControle(despesas, rendaMensal)[0];
}

export function formatarMensagensDespesasFixasControle(
  despesas: DespesaFixaControle[],
  rendaMensal?: number | null
): [string, string, string] {
  const despesasValidas = despesas.filter((despesa) => Number.isFinite(despesa.valor) && despesa.valor > 0);
  const total = despesasValidas.reduce((soma, despesa) => soma + despesa.valor, 0);
  const temRenda = typeof rendaMensal === "number" && Number.isFinite(rendaMensal) && rendaMensal > 0;
  const saldo = temRenda ? rendaMensal - total : null;

  const linhasDespesas = despesasValidas.flatMap((despesa) => {
    const parcelas =
      despesa.parcelaAtual !== undefined &&
      despesa.totalParcelas !== undefined &&
      despesa.parcelasRestantes !== undefined
        ? `\nParcelas ${despesa.parcelaAtual}/${despesa.totalParcelas}, restam ${despesa.parcelasRestantes}`
        : "";
    return [`${despesa.descricao}\n${formatarValorControle(despesa.valor)}${parcelas}`];
  });

  linhasDespesas.push(`Total fixo mensal\n${formatarValorControle(total)}`);

  const mensagemDespesas =
    "✅ *Despesas fixas registradas.*\n\n" +
    "```\n" +
    linhasDespesas.join("\n\n") +
    "\n```";

  const linhasResumo = [
    temRenda ? `Renda mensal\n${formatarValorControle(rendaMensal)}` : null,
    `Despesas fixas\n${formatarValorControle(total)}`,
    saldo !== null ? `Saldo antes dos gastos do dia a dia\n${formatarValorControle(saldo)}` : null,
  ].filter((linha): linha is string => Boolean(linha));

  const mensagemResumo =
    "📊 *Resumo simples*\n\n" +
    "```\n" +
    linhasResumo.join("\n\n") +
    "\n```";

  const mensagemProximaEtapa =
    "Agora você já pode mandar seus gastos do dia a dia.\n\n" +
    "Exemplos:\n" +
    "```\n" +
    "gastei 45 no mercado\n" +
    "uber 23,50\n" +
    "lanche 18\n" +
    "```";

  return [mensagemDespesas, mensagemResumo, mensagemProximaEtapa];
}

// Decisão do Ibrahim (set/2026): acabou o onboarding guiado. O bot não
// conduz mais diálogo pedindo despesas fixas depois da renda — ele recebe
// qualquer mensagem, interpreta e lança direto (ver
// registrarIntentFinanceiroDireto em route.ts). Corpo original mantido
// como referência histórica, mas o gate nunca mais deve travar uma
// mensagem esperando uma resposta de despesas fixas.
export function deveAguardarDespesasFixasControle(
  _etapa: string | null | undefined,
  _historico: Array<{ role: string; content?: string | null }>
): boolean {
  return false;
}
