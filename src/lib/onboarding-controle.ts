import { parseMoneyBR } from "./money";

export const RESET_CONTROLE_MENSAGEM_1 =
  "✅ *Tudo zerado.*\n\n" +
  "Vamos recomeçar seu controle financeiro do zero.";
export const ETAPA_AGUARDANDO_DESPESAS_FIXAS = "AGUARDANDO_DESPESAS_FIXAS";
export const ETAPA_AGUARDANDO_GASTOS = "AGUARDANDO_GASTOS";

export function mensagemInicioControle(nome: string): string {
  const nomeSeguro = nome?.trim() || "cliente";

  return (
    `Olá, ${nomeSeguro}! 👋\n\n` +
    "Eu sou o *QuitaZAP Controle*, sua IA de organização financeira pelo WhatsApp.\n\n" +
    "Vou te ajudar a registrar renda, despesas, gastos, cartões, dívidas, vencimentos e limites por categoria.\n\n" +
    "Para começar, me diga quanto entra por mês.\n\n" +
    "Exemplo:\n" +
    "```\n" +
    "minha renda é 3800\n" +
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
    "Vou te ajudar a registrar renda, despesas, gastos, cartões, dívidas, vencimentos e limites por categoria.\n\n" +
    "Para começar, me diga quanto entra por mês.\n\n" +
    "Exemplo:\n" +
    "```\n" +
    "minha renda é 3800\n" +
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

export function extrairRendaControle(mensagem: string, aceitarValorSolto = false): number | undefined {
  const texto = normalizarTexto(mensagem);
  const mencionaRenda = /\b(renda|salario|salario liquido|ganho|recebo|entra por mes|entra no mes)\b/.test(texto);
  if (!mencionaRenda && !aceitarValorSolto) return undefined;

  return parseMoneyBR(mensagem);
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
    "```\n" +
    "Aluguel\n" +
    "Energia\n" +
    "Água\n" +
    "Internet\n" +
    "Escola\n" +
    "Pensão\n" +
    "Assinaturas\n" +
    "Academia\n" +
    "Financiamento\n" +
    "Empréstimo\n" +
    "Consignado\n" +
    "Parcelamento\n" +
    "```\n\n" +
    "Pode mandar assim:\n\n" +
    "```\n" +
    "Energia 120\n" +
    "Internet 90\n" +
    "Pensão 900\n" +
    "Empréstimo Banco do Brasil 300 12/120\n" +
    "Financiamento moto 450 8/36\n" +
    "```"
  );
}

export type DespesaFixaControle = {
  descricao: string;
  valor: number;
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

function formatarDescricao(texto: string): string {
  const descricao = limparDescricao(texto);
  return descricao
    .split(" ")
    .filter(Boolean)
    .map((parte, index) => {
      const lower = parte.toLowerCase();
      const marcas: Record<string, string> = {
        banco: "Banco",
        brasil: "Brasil",
        claude: "Claude",
        chatgpt: "ChatGPT",
      };
      if (marcas[lower]) return marcas[lower];
      if (index > 0 && ["de", "do", "da", "dos", "das"].includes(lower)) return lower;
      if (/^[A-Z]{2,}$/.test(parte)) return parte;
      return index === 0
        ? parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase()
        : lower;
    })
    .join(" ");
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

export function parsearDespesasFixasControle(mensagem: string): DespesaFixaControle[] {
  return mensagem
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      if (pareceComandoRenda(linha)) return null;

      const parcelas = linha.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/);
      const linhaSemParcelas = limparDescricao(linha.replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, " "));
      const valorMatch = linhaSemParcelas.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{1,2}|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)?$/i);
      if (!valorMatch) return null;

      const valor = parseMoneyBR(valorMatch[1]);
      if (!valor) return null;

      const valorIndex = valorMatch.index ?? -1;
      if (valorIndex < 0) return null;

      const descricaoRaw = limparDescricao(linhaSemParcelas.slice(0, valorIndex));
      if (!descricaoRaw) return null;

      const despesa: DespesaFixaControle = {
        descricao: formatarDescricao(descricaoRaw),
        valor,
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

export function deveAguardarDespesasFixasControle(
  etapa: string | null | undefined,
  historico: Array<{ role: string; content?: string | null }>
): boolean {
  if (etapa === ETAPA_AGUARDANDO_GASTOS) return false;
  if (etapa === ETAPA_AGUARDANDO_DESPESAS_FIXAS) return true;

  const ultimoIndiceUsuario = historico
    .map((h, index) => ({ h, index }))
    .filter(({ h }) => h.role === "user")
    .map(({ index }) => index)
    .pop() ?? -1;
  const ultimoPedidoDespesasFixas = historico
    .map((h, index) => ({ h, index }))
    .filter(
      ({ h }) =>
        h.role === "assistant" &&
        (
          (h.content ?? "").includes("Agora me diga suas despesas fixas.") ||
          (h.content ?? "").includes("*Despesas fixas*")
        )
    )
    .map(({ index }) => index)
    .pop() ?? -1;

  return ultimoPedidoDespesasFixas > ultimoIndiceUsuario;
}
