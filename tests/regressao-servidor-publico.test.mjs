import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

Module._extensions[".ts"] = function carregarTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

const { gerarRelatorio } = loadTsModule("src/lib/plano.ts");
const {
  extrairDadosServidorPublicoManual,
  normalizarDiagnosticoManual,
} = loadTsModule("src/lib/diagnostico-normalizer.ts");
const {
  RESPOSTA_DADOS_FOLHA_SERVIDOR,
  deveConfirmarDadosFolhaServidor,
  gerarRespostaDadosFolhaServidor,
} = loadTsModule("src/lib/servidor-publico-flow.ts");
const { processarFluxoGasto } = loadTsModule("src/lib/gasto-flow.ts");
const {
  extrairRendaControle,
  mensagemBoasVindasControle,
  mensagemExplicarDespesasFixasControle,
  mensagemPedidoDespesasFixasControle,
  mensagemRendaRegistradaControle,
  mensagensResetControle,
} = loadTsModule("src/lib/onboarding-controle.ts");

const mensagemManual = `
Salario liquido normal: 3812,68
Liquido recebido este mes: 7140,69
13o/verba extra: 3328,01

Emprestimos em folha:
Banco Digio 304,00 27/120
B Brasil 321,64 65/96
Banco Safra 100,06 3/120
Banco Safra 151,76 25/120
Banco Master 286,73 17/96
Banco Safra 698,46 28/120
ASSEBA beneficio 306,89 15/36
ASTEBA beneficio 320,63 17/36

Associacoes:
Asseba 80
Asteba 80
Aspra 87

Dependentes:
2

Despesas fixas:
Pensao filhas 900
Transporte escolar 300
Mercado 400
Conta celular 60
Agua 50
Energia 60
Internet 50
ChatGPT 110
Claude 110

Cartoes:
Nubank 2000 dia 01
PagBank 1300 dia 01
Mercado Pago 1800 dia 07
`;

function divida(credor, tipo, valorParcela, parcelasRestantes = 1, diaVencimento) {
  return {
    credor,
    tipo,
    saldoAtual: valorParcela * parcelasRestantes,
    valorParcela,
    parcelasRestantes,
    diaVencimento,
    emAtraso: false,
  };
}

test("diagnostico manual de servidor publico separa renda recorrente, folha e cartoes", () => {
  const diagnosticoComBug = {
    dadosPessoais: {
      nome: "Cliente Teste",
      vinculo: "SERVIDOR_PUBLICO",
      dependentes: 2,
    },
    renda: {
      salarioLiquido: 7140.69,
      totalFamiliar: 7140.69,
    },
    despesasFixas: [
      { descricao: "Pensao filhas", valor: 900 },
      { descricao: "Transporte escolar", valor: 300 },
      { descricao: "Mercado", valor: 400 },
      { descricao: "Conta celular", valor: 60 },
      { descricao: "Agua", valor: 50 },
      { descricao: "Energia", valor: 60 },
      { descricao: "Internet", valor: 50 },
      { descricao: "ChatGPT", valor: 110 },
      { descricao: "Claude", valor: 110 },
    ],
    despesasVariaveis: [],
    dividas: [
      divida("Banco Digio", "EMPRESTIMO", 304, 93),
      divida("B Brasil", "EMPRESTIMO", 321.64, 31),
      divida("Banco Safra", "EMPRESTIMO", 100.06, 117),
      divida("Banco Safra", "EMPRESTIMO", 151.76, 95),
      divida("Banco Master", "EMPRESTIMO", 286.73, 79),
      divida("Banco Safra", "EMPRESTIMO", 698.46, 92),
      divida("ASSEBA beneficio", "EMPRESTIMO", 306.89, 21),
      divida("ASTEBA beneficio", "EMPRESTIMO", 320.63, 19),
      divida("Asseba", "ASSOCIACAO", 80, 999),
      divida("Asteba", "ASSOCIACAO", 80, 999),
      divida("Aspra", "ASSOCIACAO", 87, 999),
      divida("Nubank", "CARTAO", 2000),
      divida("PagBank", "CARTAO", 1300),
      divida("Mercado Pago", "CARTAO", 1800),
    ],
    cartoes: [],
    emprestimos: [],
    patrimonio: {},
    objetivos: {},
    alertas: {},
  };

  const normalizado = normalizarDiagnosticoManual(diagnosticoComBug, [mensagemManual]);
  const relatorio = gerarRelatorio(normalizado);

  assert.equal(normalizado.renda.salarioLiquido, 3812.68);
  assert.equal(normalizado.renda.salarioLiquidoComExtras, 7140.69);
  assert.equal(normalizado.renda.adiantamento13, 3328.01);
  assert.equal(normalizado.dividas.find((d) => d.credor === "Nubank")?.diaVencimento, 1);
  assert.equal(normalizado.dividas.find((d) => d.credor === "PagBank")?.diaVencimento, 1);
  assert.equal(normalizado.dividas.find((d) => d.credor === "Mercado Pago")?.diaVencimento, 7);

  for (const valor of [
    "3.812,68",
    "3.328,01",
    "7.140,69",
    "2.490,17",
    "247,00",
    "2.737,17",
    "2.040,00",
    "5.100,00",
  ]) {
    assert.match(relatorio, new RegExp(valor.replace(".", "\\.")));
  }

  assert.doesNotMatch(relatorio, /datas de vencimento das d/i);
  assert.ok((relatorio.match(/Neste m.{1,3}s voc/g) ?? []).length <= 1);
});

test("confirmacao de servidor publico formata renda em bloco monoespacado mobile-first", () => {
  const resposta = gerarRespostaDadosFolhaServidor(mensagemManual);

  const blocoRenda =
    "💰 *Renda:*\n" +
    "```\n" +
    "Salário líquido normal\n" +
    "R$ 3.812,68\n\n" +
    "Líquido recebido este mês\n" +
    "R$ 7.140,69\n\n" +
    "13º/verba extra\n" +
    "R$ 3.328,01\n" +
    "```";

  assert.ok(resposta.includes(blocoRenda));

  assert.doesNotMatch(resposta, /- Sal[aá]rio l[ií]quido normal:/i);
  assert.doesNotMatch(resposta, /💰 Sal[aá]rio l[ií]quido normal:/i);
  assert.doesNotMatch(resposta, /\*\*R\$/);
  assert.doesNotMatch(resposta, /R\$ undefined|R\$ NaN|\bundefined\b|\bnull\b|\bNaN\b/);

 assert.doesNotMatch(resposta, /Sal[aá]rio l[ií]quido normal[ \t]+R\$/i);
assert.doesNotMatch(resposta, /Banco Digio[ \t]+R\$/i);
  assert.doesNotMatch(resposta, /R\$\s*\n\s*3\.812,68/);
  assert.doesNotMatch(resposta, /R\$\s*\n\s*304,00/);

  assert.match(resposta, /Banco Digio\s*\nR\$ 304,00 • 27\/120/);
  assert.match(resposta, /Asseba\s*\nR\$ 80,00/);
  assert.match(resposta, /depende financeiramente/i);
});

test("parser deterministico preserva itens reais de folha e descarta nomes genericos da IA", () => {
  const diagnosticoGenericoDaIA = {
    dadosPessoais: {
      nome: "Cliente Teste",
      vinculo: "SERVIDOR_PUBLICO",
      dependentes: 2,
    },
    renda: {
      salarioLiquido: 7140.69,
      totalFamiliar: 7140.69,
    },
    despesasFixas: [],
    despesasVariaveis: [],
    dividas: [
      divida("Emprestimo 1", "EMPRESTIMO", 1200, 10),
      divida("Emprestimo 2", "EMPRESTIMO", 1290.17, 10),
      divida("Associacao 1", "ASSOCIACAO", 160, 999),
      divida("Associacao 2", "ASSOCIACAO", 87, 999),
    ],
    cartoes: [],
    emprestimos: [],
    patrimonio: {},
    objetivos: {},
    alertas: {},
  };

  const dadosFolha = extrairDadosServidorPublicoManual(mensagemManual);
  assert.equal(dadosFolha.emprestimos.length, 8);
  assert.equal(dadosFolha.associacoes.length, 3);
  assert.deepEqual(dadosFolha.linhasNaoReconhecidas, []);

  const normalizado = normalizarDiagnosticoManual(diagnosticoGenericoDaIA, [mensagemManual]);
  const emprestimos = normalizado.dividas.filter((d) => d.tipo === "EMPRESTIMO");
  const associacoes = normalizado.dividas.filter((d) => d.tipo === "ASSOCIACAO");
  const cartoes = normalizado.dividas.filter((d) => d.tipo === "CARTAO");

  assert.equal(emprestimos.length, 8);
  assert.equal(associacoes.length, 3);
  assert.equal(cartoes.length, 3);

  for (const nomeGenerico of ["Emprestimo 1", "Emprestimo 2", "Associacao 1", "Associacao 2"]) {
    assert.equal(normalizado.dividas.some((d) => d.credor === nomeGenerico), false);
  }

  const porCredor = (credor) => emprestimos.find((d) => d.credor === credor);
  assert.deepEqual(
    {
      valor: porCredor("Banco Digio")?.valorParcela,
      parcelaAtual: porCredor("Banco Digio")?.parcelaAtual,
      totalParcelas: porCredor("Banco Digio")?.totalParcelas,
    },
    { valor: 304, parcelaAtual: 27, totalParcelas: 120 }
  );
  assert.deepEqual(
    {
      valor: porCredor("B Brasil")?.valorParcela,
      parcelaAtual: porCredor("B Brasil")?.parcelaAtual,
      totalParcelas: porCredor("B Brasil")?.totalParcelas,
    },
    { valor: 321.64, parcelaAtual: 65, totalParcelas: 96 }
  );
  assert.deepEqual(
    {
      valor: porCredor("Banco Master")?.valorParcela,
      parcelaAtual: porCredor("Banco Master")?.parcelaAtual,
      totalParcelas: porCredor("Banco Master")?.totalParcelas,
    },
    { valor: 286.73, parcelaAtual: 17, totalParcelas: 96 }
  );
  assert.deepEqual(
    {
      valor: porCredor("ASSEBA beneficio")?.valorParcela,
      parcelaAtual: porCredor("ASSEBA beneficio")?.parcelaAtual,
      totalParcelas: porCredor("ASSEBA beneficio")?.totalParcelas,
    },
    { valor: 306.89, parcelaAtual: 15, totalParcelas: 36 }
  );
  assert.deepEqual(
    {
      valor: porCredor("ASTEBA beneficio")?.valorParcela,
      parcelaAtual: porCredor("ASTEBA beneficio")?.parcelaAtual,
      totalParcelas: porCredor("ASTEBA beneficio")?.totalParcelas,
    },
    { valor: 320.63, parcelaAtual: 17, totalParcelas: 36 }
  );

  const safras = emprestimos
    .filter((d) => d.credor === "Banco Safra")
    .map((d) => `${d.valorParcela}:${d.parcelaAtual}/${d.totalParcelas}`)
    .sort();
  assert.deepEqual(safras, ["100.06:3/120", "151.76:25/120", "698.46:28/120"]);

  assert.deepEqual(
    associacoes.map((d) => `${d.credor}:${d.valorParcela}`).sort(),
    ["Aspra:87", "Asseba:80", "Asteba:80"]
  );

  const totalEmprestimos = emprestimos.reduce((s, d) => s + d.valorParcela, 0);
  const totalAssociacoes = associacoes.reduce((s, d) => s + d.valorParcela, 0);
  assert.equal(Number(totalEmprestimos.toFixed(2)), 2490.17);
  assert.equal(Number(totalAssociacoes.toFixed(2)), 247);
  assert.equal(Number((totalEmprestimos + totalAssociacoes).toFixed(2)), 2737.17);

  assert.equal(cartoes.find((d) => d.credor === "Nubank")?.diaVencimento, 1);
  assert.equal(cartoes.find((d) => d.credor === "PagBank")?.diaVencimento, 1);
  assert.equal(cartoes.find((d) => d.credor === "Mercado Pago")?.diaVencimento, 7);

  const relatorio = gerarRelatorio(normalizado);
  assert.match(relatorio, /Banco Digio/);
  assert.match(relatorio, /Banco Master/);
  assert.match(relatorio, /27\/120/);
  assert.match(relatorio, /17\/96/);
});

test("resposta intermediaria do servidor publico nao expoe campos tecnicos", () => {
  const historico = [
    { role: "user", content: "2" },
    {
      role: "assistant",
      content:
        "Perfeito. ✅ Como você é servidor público, vou organizar seus descontos em folha manualmente.\n\n" +
        "1️⃣ Salário líquido normal:\n" +
        "2️⃣ Líquido recebido este mês:\n" +
        "3️⃣ Teve 13º, férias ou verba extra? Qual valor?\n\n" +
        "4️⃣ Empréstimos/consignados/descontos parcelados em folha:\n\n" +
        "5️⃣ Associações/mensalidades em folha:",
    },
  ];

  assert.equal(deveConfirmarDadosFolhaServidor(historico, mensagemManual), true);
  const resposta = gerarRespostaDadosFolhaServidor(mensagemManual);

  for (const proibido of [
    /Tipo:\s*EMPRESTIMO/i,
    /Tipo:\s*ASSOCIACAO/i,
    /Em atraso:\s*false/i,
    /Saldo atual/i,
    /Parcelas restantes:\s*999/i,
    /Credor:/i,
    /Total de parcelas/i,
  ]) {
    assert.doesNotMatch(resposta, proibido);
  }

  assert.match(RESPOSTA_DADOS_FOLHA_SERVIDOR, /depende financeiramente de você/i);
  assert.match(RESPOSTA_DADOS_FOLHA_SERVIDOR, /1️⃣ Sim/);
  assert.match(RESPOSTA_DADOS_FOLHA_SERVIDOR, /2️⃣ Não/);
});
test("fluxo deterministico de gasto registra valor, data e categoria sem IA", () => {
  const hoje = new Date(2026, 6, 1, 12, 0, 0);
  const resposta = processarFluxoGasto("gastei 45,90 no mercado", hoje)?.resposta;

  assert.ok(resposta);
  assert.equal(
    resposta,
    "✅ *OK! Registrado.*\n\n" +
      "✍️ *Descrição:* Mercado\n" +
      "💰 *Valor:* R$ 45,90\n" +
      "🏷️ *Categoria:* Mercado\n" +
      "📅 *Data:* 01/07/2026\n\n" +
      "Pode mandar mais que eu vou organizando tudo pra você. 👌"
  );

  assert.match(resposta, /Pode mandar mais que eu vou organizando tudo pra você\. 👌/);
  assert.doesNotMatch(resposta, /undefined|null|NaN|R\$ undefined|R\$ NaN/);
});

test("fluxo deterministico de gasto pede valor quando nao encontra numero", () => {
  const resposta = processarFluxoGasto("gastei no mercado", new Date(2026, 6, 1))?.resposta;
  assert.equal(resposta, "Qual foi o valor desse gasto?");
});

test("fluxo deterministico de gasto classifica categorias por palavra-chave", () => {
  const hoje = new Date(2026, 6, 1, 12, 0, 0);

  assert.equal(processarFluxoGasto("chatgpt 110", hoje)?.categoria, "Assinaturas");
  assert.equal(processarFluxoGasto("paguei 60 de energia hoje", hoje)?.categoria, "Contas da casa");
  assert.equal(processarFluxoGasto("uber 23,50", hoje)?.categoria, "Transporte");
});

test("reset usa onboarding do QuitaZAP Controle em duas mensagens", () => {
  const [mensagem1, mensagem2] = mensagensResetControle("Maria");

  assert.equal(
    mensagem1,
    "✅ *Tudo zerado.*\n\nVamos recomeçar seu controle financeiro do zero."
  );
  assert.match(mensagem2, /^Olá, Maria! 👋/);
  assert.match(mensagem2, /QuitaZAP Controle/);
  assert.match(mensagem2, /Para começar, me diga quanto entra por mês\./);
  assert.match(mensagem2, /minha renda é 3800/);
  assert.doesNotMatch(mensagem2, /```text/);
  assert.doesNotMatch(mensagem2, /^text$/im);

  const texto = `${mensagem1}\n${mensagem2}`;
  assert.doesNotMatch(texto, /Como você trabalha hoje\?/i);
  assert.doesNotMatch(texto, /1️⃣ CLT|2️⃣ Servidor público|3️⃣ Autônomo|4️⃣ MEI|5️⃣ Empresário|6️⃣ Outro/);
});

test("boas-vindas de ativacao nao usa onboarding antigo por perfil profissional", () => {
  const mensagem = mensagemBoasVindasControle("João", "Plano Mensal");

  assert.match(mensagem, /Seu acesso ao \*QuitaZAP Controle\* foi ativado/);
  assert.match(mensagem, /Sua assinatura do \*Plano Mensal\* está confirmada ✅/);
  assert.match(mensagem, /renda, despesas, gastos, cartões, dívidas, vencimentos e limites por categoria/);
  assert.doesNotMatch(mensagem, /```text/);
  assert.doesNotMatch(mensagem, /^text$/im);
  assert.doesNotMatch(mensagem, /Como você trabalha hoje\?/i);
  assert.doesNotMatch(mensagem, /CLT|Autônomo|MEI|Empresário|Outro/);
});

test("onboarding registra renda em tres mensagens limpas para WhatsApp", () => {
  const renda = extrairRendaControle("4000", true);
  const respostaRenda = mensagemRendaRegistradaControle(renda);
  const perguntaDespesas = mensagemPedidoDespesasFixasControle();
  const explicacaoDespesas = mensagemExplicarDespesasFixasControle();

  assert.equal(renda, 4000);
  assert.equal(
    respostaRenda,
    "✅ *Renda registrada.*\n\n" +
      "```\n" +
      "Renda mensal\n" +
      "R$ 4.000,00\n" +
      "```"
  );

  assert.equal(perguntaDespesas, "Agora me diga suas despesas fixas.");
  assert.notEqual(respostaRenda, perguntaDespesas);
  assert.notEqual(perguntaDespesas, explicacaoDespesas);
  assert.match(explicacaoDespesas, /^📌 \*Despesas fixas\*/);
  for (const item of ["Aluguel", "Energia", "Internet", "Empréstimo", "Consignado", "Parcelamento"]) {
    assert.match(explicacaoDespesas, new RegExp(item));
  }
  assert.match(explicacaoDespesas, /Pode mandar assim:/);
  assert.doesNotMatch(
    `${respostaRenda}\n${perguntaDespesas}\n${explicacaoDespesas}`,
    /```(?:text|txt|markdown|ts|js)|^text$|\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/im
  );
});
