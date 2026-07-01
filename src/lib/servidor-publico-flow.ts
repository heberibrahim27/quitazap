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
  return (n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function linhaMonospace(nome: string, valor: number | undefined, extra = ""): string {
  const nomeFmt = nome.length > 28 ? `${nome.slice(0, 25)}...` : nome;
  const valorFmt = `R$ ${fmt(valor)}`;
  return `${nomeFmt.padEnd(30)} ${valorFmt.padStart(12)}${extra ? `   ${extra}` : ""}`;
}

function linhaRenda(nome: string, valor: number | undefined): string {
  return `${nome.padEnd(29)} R$ ${fmt(valor)}`;
}

export function gerarRespostaDadosFolhaServidor(mensagem: string): string {
  const renda = extrairRendaServidorPublicoManual(mensagem);
  const dadosFolha = extrairDadosServidorPublicoManual(mensagem);

  const linhasRenda = [
    linhaRenda("Salário líquido normal", renda.salarioLiquidoNormal),
    linhaRenda("Líquido recebido este mês", renda.liquidoRecebidoEsteMes),
    linhaRenda("13º/verba extra", renda.verbaExtra),
  ].join("\n");

  const linhasEmprestimos = dadosFolha.emprestimos
    .map((d) => linhaMonospace(d.credor, d.valorParcela, d.parcelaAtual && d.totalParcelas ? `${d.parcelaAtual}/${d.totalParcelas}` : ""))
    .join("\n");

  const linhasAssociacoes = dadosFolha.associacoes
    .map((d) => linhaMonospace(d.credor, d.valorParcela))
    .join("\n");

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
