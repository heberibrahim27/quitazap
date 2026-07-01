import { extrairDadosServidorPublicoManual, extrairRendaServidorPublicoManual } from "./diagnostico-normalizer";

type MensagemHistorico = {
  role: string;
  content: string;
};

export const RESPOSTA_DADOS_FOLHA_SERVIDOR =
  "Perfeito, registrei seus dados de salário, descontos em folha e associações. ✅\n\n" +
  "Agora me diga: você tem alguém que depende financeiramente de você?\n\n" +
  "1️⃣ Sim\n" +
  "2️⃣ Não";

function fmt(n: number | undefined): string {
  return (n ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function itemMobile(nome: string, valor: number | undefined, extra = ""): string {
  const valorFmt = extra ? `R$ ${fmt(valor)} • ${extra}` : `R$ ${fmt(valor)}`;
  return `${nome}\n${valorFmt}`;
}

function parcelasTexto(parcelaAtual?: number, totalParcelas?: number): string {
  if (!parcelaAtual || !totalParcelas) return "";
  return `${parcelaAtual}/${totalParcelas}`;
}

export function gerarRespostaDadosFolhaServidor(mensagem: string): string {
  const renda = extrairRendaServidorPublicoManual(mensagem);
  const dadosFolha = extrairDadosServidorPublicoManual(mensagem);

  const linhasRenda = [
    itemMobile("Salário líquido normal", renda.salarioLiquidoNormal),
    itemMobile("Líquido recebido este mês", renda.liquidoRecebidoEsteMes),
    itemMobile("13º/verba extra", renda.verbaExtra),
  ].join("\n\n");

  const linhasEmprestimos = dadosFolha.emprestimos
    .map((d) =>
      itemMobile(
        d.credor,
        d.valorParcela,
        parcelasTexto(d.parcelaAtual, d.totalParcelas)
      )
    )
    .join("\n\n");

  const linhasAssociacoes = dadosFolha.associacoes
    .map((d) => itemMobile(d.credor, d.valorParcela))
    .join("\n\n");

  return `Perfeito, registrei seus dados de salário, descontos em folha e associações. ✅

💰 *Renda:*
\`\`\`
${linhasRenda}
\`\`\`

🏦 *Empréstimos/descontos em folha:*
\`\`\`
${linhasEmprestimos}
\`\`\`

🤝 *Associações:*
\`\`\`
${linhasAssociacoes}
\`\`\`

Agora me diga: você tem alguém que depende financeiramente de você?

1️⃣ Sim
2️⃣ Não`;
}

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function historicoTemPedidoManualServidor(historico: MensagemHistorico[]): boolean {
  const texto = normalizarTexto(historico.map((h) => h.content ?? "").join("\n"));
  return (
    texto.includes("salario liquido normal") &&
    texto.includes("liquido recebido este mes") &&
    texto.includes("emprestimos/consignados") &&
    texto.includes("associacoes/mensalidades")
  );
}

function historicoJaPerguntouDependentes(historico: MensagemHistorico[]): boolean {
  return normalizarTexto(historico.map((h) => h.content ?? "").join("\n")).includes("depende financeiramente");
}

function mensagemTemDadosManuaisDeFolha(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem);
  const temRendaServidor =
    /salario\s+liquido\s+normal/.test(texto) ||
    /liquido\s+recebido\s+(este|nesse)\s+mes/.test(texto);
  const temFolha =
    /emprestimos?|consignados?|descontos?\s+em\s+folha|associacoes?|mensalidades?/.test(texto);
  const temValor = /\d{2,}([.,]\d{1,2})?/.test(texto);

  return temRendaServidor && temFolha && temValor;
}

export function deveConfirmarDadosFolhaServidor(
  historico: MensagemHistorico[],
  mensagem: string
): boolean {
  return (
    !historicoJaPerguntouDependentes(historico) &&
    mensagemTemDadosManuaisDeFolha(mensagem)
  );
}
