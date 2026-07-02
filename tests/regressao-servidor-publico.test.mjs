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
const { parseMoneyBR } = loadTsModule("src/lib/money.ts");
const { processarFluxoGasto } = loadTsModule("src/lib/gasto-flow.ts");
const {
  deveAguardarDespesasFixasControle,
  ETAPA_AGUARDANDO_DESPESAS_FIXAS,
  ETAPA_AGUARDANDO_GASTOS,
  extrairRendaControle,
  formatarMensagensDespesasFixasControle,
  formatarRespostaDespesasFixasControle,
  mensagemBoasVindasControle,
  mensagemExplicarDespesasFixasControle,
  mensagemPedidoDespesasFixasControle,
  mensagemRendaRegistradaControle,
  mensagensResetControle,
  parsearDespesasFixasControle,
} = loadTsModule("src/lib/onboarding-controle.ts");
const {
  atualizarDespesasFixasControle,
  calcularSaldoDisponivelControle,
  configurarCartaoControle,
  corrigirRendaControle,
  corrigirOrigemUltimoGastoControle,
  registrarGastoControle,
  totalFaturasAbertasControle,
} = loadTsModule("src/lib/controle-financeiro-flow.ts");

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

test("fluxo deterministico classifica apostas separado de lazer", () => {
  const hoje = new Date(2026, 6, 1, 12, 0, 0);

  assert.equal(processarFluxoGasto("apostei 50 na betano", hoje)?.categoria, "Apostas");
  assert.equal(processarFluxoGasto("gastei 30 no tigrinho", hoje)?.categoria, "Apostas");
  assert.equal(processarFluxoGasto("blaze 40", hoje)?.categoria, "Apostas");
  assert.equal(processarFluxoGasto("cassino online 80", hoje)?.categoria, "Apostas");
  assert.equal(processarFluxoGasto("gastei 65 de cerveja no bar", hoje)?.categoria, "Lazer");
});

test("parseMoneyBR interpreta valores brasileiros sem cortar digitos", () => {
  const casos = [
    ["7140,69", 7140.69],
    ["7.140,69", 7140.69],
    ["7140.69", 7140.69],
    ["R$ 7140,69", 7140.69],
    ["R$ 7.140,69", 7140.69],
    ["4000", 4000],
    ["45,90", 45.9],
    ["1000,00", 1000],
    ["10000,50", 10000.5],
    ["140,69", 140.69],
  ];

  for (const [entrada, esperado] of casos) {
    assert.equal(parseMoneyBR(entrada), esperado);
  }
});

test("fluxos principais usam parseMoneyBR para nao cortar renda nem gasto", () => {
  const hoje = new Date(2026, 6, 1, 12, 0, 0);

  assert.equal(extrairRendaControle("minha renda é 7140,69"), 7140.69);
  assert.equal(processarFluxoGasto("gastei 7140,69 no mercado", hoje)?.valor, 7140.69);
  assert.match(
    processarFluxoGasto("gastei 7140,69 no mercado", hoje)?.resposta ?? "",
    /R\$ 7\.140,69/
  );
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

test("despesas fixas do onboarding sao registradas por linha antes do gasto comum", () => {
  const mensagem = `Pensão filhas 900
Transporte escolar 300
Mercado 400
Conta celular 60
Água 50
Energia 60
Internet 50
ChatGPT 110
Claude 110`;

  const despesas = parsearDespesasFixasControle(mensagem);
  assert.equal(despesas.length, 9);
  assert.deepEqual(
    despesas.map((d) => `${d.descricao}:${d.valor}`),
    [
      "Pensão filhas:900",
      "Transporte escolar:300",
      "Mercado:400",
      "Conta celular:60",
      "Água:50",
      "Energia:60",
      "Internet:50",
      "ChatGPT:110",
      "Claude:110",
    ]
  );

  const [resposta, resumo, proximaEtapa] = formatarMensagensDespesasFixasControle(despesas, 4000);
  assert.match(resposta, /^✅ \*Despesas fixas registradas\.\*/);
  assert.match(resposta, /Pensão filhas\nR\$ 900,00/);
  assert.match(resposta, /Transporte escolar\nR\$ 300,00/);
  assert.match(resposta, /Mercado\nR\$ 400,00/);
  assert.match(resposta, /Conta celular\nR\$ 60,00/);
  assert.match(resposta, /ChatGPT\nR\$ 110,00/);
  assert.match(resposta, /Claude\nR\$ 110,00/);
  assert.match(resposta, /Total fixo mensal\nR\$ 2\.040,00/);
  assert.doesNotMatch(resposta, /Pensão Filhas\s*[–—-]\s*R\$ 900,00/);
  assert.doesNotMatch(resposta, /—|–/);

  assert.match(resumo, /^📊 \*Resumo simples\*/);
  assert.match(resumo, /Renda mensal\nR\$ 4\.000,00/);
  assert.match(resumo, /Despesas fixas\nR\$ 2\.040,00/);
  assert.match(resumo, /Saldo antes dos gastos do dia a dia\nR\$ 1\.960,00/);
  assert.notEqual(resposta, resumo);

  assert.match(proximaEtapa, /^Agora você já pode mandar seus gastos do dia a dia\./);
  assert.match(proximaEtapa, /gastei 45 no mercado/);
  assert.notEqual(resumo, proximaEtapa);

  assert.doesNotMatch(
    `${resposta}\n${resumo}\n${proximaEtapa}`,
    /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN|```(?:text|txt|markdown|ts|js)/i
  );
});

test("despesas fixas parceladas capturam parcelas restantes", () => {
  const despesas = parsearDespesasFixasControle(`Empréstimo Banco do Brasil 300 12/120
Financiamento moto 450 8/36`);

  assert.deepEqual(
    despesas.map((d) => ({
      descricao: d.descricao,
      valor: d.valor,
      parcelaAtual: d.parcelaAtual,
      totalParcelas: d.totalParcelas,
      parcelasRestantes: d.parcelasRestantes,
    })),
    [
      {
        descricao: "Empréstimo Banco do Brasil",
        valor: 300,
        parcelaAtual: 12,
        totalParcelas: 120,
        parcelasRestantes: 108,
      },
      {
        descricao: "Financiamento moto",
        valor: 450,
        parcelaAtual: 8,
        totalParcelas: 36,
        parcelasRestantes: 28,
      },
    ]
  );

  const resposta = formatarRespostaDespesasFixasControle(despesas, 3800);
  assert.match(resposta, /Empréstimo Banco do Brasil\nR\$ 300,00\nParcelas 12\/120, restam 108/);
  assert.match(resposta, /Financiamento moto\nR\$ 450,00\nParcelas 8\/36, restam 28/);
  assert.doesNotMatch(resposta, /—|–/);
});

test("apos registrar despesas fixas estado libera gasto variavel", () => {
  const historicoAguardando = [
    { role: "assistant", content: "Agora me diga suas despesas fixas." },
  ];
  assert.equal(
    deveAguardarDespesasFixasControle(ETAPA_AGUARDANDO_DESPESAS_FIXAS, historicoAguardando),
    true
  );

  const historicoDepois = [
    ...historicoAguardando,
    { role: "user", content: "Energia 120" },
    { role: "assistant", content: "✅ *Despesas fixas registradas.*" },
    { role: "assistant", content: "📊 *Resumo simples*" },
    { role: "assistant", content: "Agora você já pode mandar seus gastos do dia a dia." },
  ];

  assert.equal(
    deveAguardarDespesasFixasControle(ETAPA_AGUARDANDO_GASTOS, historicoDepois),
    false
  );

  const gasto = processarFluxoGasto("gastei 45 no mercado", new Date(2026, 6, 1));
  assert.equal(gasto?.categoria, "Mercado");
  assert.match(gasto?.resposta ?? "", /✅ \*OK! Registrado\.\*/);
});

function estadoControleBase() {
  return atualizarDespesasFixasControle(
    { rendaMensal: 4000, totalDespesasFixas: 0, totalGastosSaldo: 0, faturas: [], cartoes: [] },
    2040,
    4000
  );
}

test("controle financeiro calcula saldo inicial apos renda e despesas fixas", () => {
  const estado = estadoControleBase();

  assert.equal(calcularSaldoDisponivelControle(estado), 1960);
  assert.equal(totalFaturasAbertasControle(estado), 0);
});

test("correcao de renda atualiza para 7140,69 e recalcula resumo", () => {
  const estadoComRendaErrada = atualizarDespesasFixasControle(
    { rendaMensal: 140.69, totalDespesasFixas: 0, totalGastosSaldo: 0, faturas: [], cartoes: [] },
    2040,
    140.69
  );
  const comandos = [
    "corrija minha renda para 7140,69",
    "conserte minha renda 7140,69",
    "atualize minha renda para 7140,69",
    "renda correta é 7140,69",
  ];

  for (const comando of comandos) {
    const resultado = corrigirRendaControle(comando, estadoComRendaErrada);

    assert.ok(resultado);
    assert.equal(resultado.estado.rendaMensal, 7140.69);
    assert.equal(resultado.estado.totalDespesasFixas, 2040);
    assert.match(resultado.resposta, /✅ \*Renda atualizada\.\*/);
    assert.match(resultado.resposta, /Renda anterior\nR\$ 140,69/);
    assert.match(resultado.resposta, /Nova renda\nR\$ 7\.140,69/);
    assert.match(resultado.resposta, /📊 \*Resumo atualizado\*/);
    assert.match(resultado.resposta, /Renda mensal\nR\$ 7\.140,69/);
    assert.match(resultado.resposta, /Despesas fixas\nR\$ 2\.040,00/);
    assert.match(resultado.resposta, /Saldo antes dos gastos do dia a dia\nR\$ 5\.100,69/);
    assert.doesNotMatch(resultado.resposta, /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/);
  }
});

test("comandos de correcao de renda nao viram despesas fixas", () => {
  for (const comando of [
    "corrija minha renda para 7140,69",
    "corrigir renda 7140,69",
    "ajuste minha renda para 7140,69",
    "renda = 7140,69",
  ]) {
    assert.deepEqual(parsearDespesasFixasControle(comando), []);
    assert.equal(corrigirRendaControle(comando, estadoControleBase())?.estado.rendaMensal, 7140.69);
  }
});

test("configuracao de cartao registra fechamento e vencimento sem cair em gasto", () => {
  const estado = estadoControleBase();
  const resultado = configurarCartaoControle("Nubank fecha dia 25 e vence dia 01", estado);

  assert.ok(resultado);
  assert.equal(resultado.atualizouEstado, true);
  assert.deepEqual(resultado.estado.cartoes, [{ nome: "Nubank", fechamento: 25, vencimento: 1 }]);
  assert.match(resultado.resposta, /✅ \*Cartão configurado\.\*/);
  assert.match(resultado.resposta, /💳 \*Cartão:\* Nubank/);
  assert.match(resultado.resposta, /📅 \*Fechamento:\* dia 25/);
  assert.match(resultado.resposta, /📆 \*Vencimento:\* dia 01/);
  assert.doesNotMatch(resultado.resposta, /Qual foi o valor desse gasto\?|✅ \*OK! Registrado\.\*/);
  assert.equal(registrarGastoControle("Nubank fecha dia 25 e vence dia 01", estado), null);
  assert.doesNotMatch(resultado.resposta, /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/);
});

test("configuracao de cartao aceita somente vencimento ou somente fechamento", () => {
  const mercadoPago = configurarCartaoControle("Mercado Pago vence dia 07", estadoControleBase());
  assert.ok(mercadoPago);
  assert.deepEqual(mercadoPago.estado.cartoes, [{ nome: "Mercado Pago", fechamento: undefined, vencimento: 7 }]);
  assert.match(mercadoPago.resposta, /📆 \*Vencimento:\* dia 07/);
  assert.doesNotMatch(mercadoPago.resposta, /📅 \*Fechamento:/);
  assert.match(mercadoPago.resposta, /Mercado Pago fecha dia 25/);

  const pagBank = configurarCartaoControle("PagBank fecha dia 28", estadoControleBase());
  assert.ok(pagBank);
  assert.deepEqual(pagBank.estado.cartoes, [{ nome: "PagBank", fechamento: 28, vencimento: undefined }]);
  assert.match(pagBank.resposta, /📅 \*Fechamento:\* dia 28/);
  assert.doesNotMatch(pagBank.resposta, /📆 \*Vencimento:/);
  assert.match(pagBank.resposta, /PagBank vence dia 10/);
});

test("configuracao de cartao atualiza sem duplicar e normaliza BB", () => {
  const inicial = configurarCartaoControle("Nubank fecha dia 25 e vence dia 01", estadoControleBase());
  assert.ok(inicial);

  const atualizado = configurarCartaoControle("Nubank vence dia 05", inicial.estado);
  assert.ok(atualizado);
  assert.equal(atualizado.estado.cartoes.length, 1);
  assert.deepEqual(atualizado.estado.cartoes, [{ nome: "Nubank", fechamento: 25, vencimento: 5 }]);
  assert.match(atualizado.resposta, /✅ \*Cartão atualizado\.\*/);
  assert.match(atualizado.resposta, /📆 \*Vencimento:\* dia 05/);
  assert.match(atualizado.resposta, /Atualizei os dados desse cartão\./);

  const bb = configurarCartaoControle("BB fecha 20 vence 05", estadoControleBase());
  assert.ok(bb);
  assert.deepEqual(bb.estado.cartoes, [{ nome: "Banco do Brasil", fechamento: 20, vencimento: 5 }]);
  assert.match(bb.resposta, /💳 \*Cartão:\* Banco do Brasil/);
});

test("configuracao de cartao rejeita dia invalido", () => {
  const estado = estadoControleBase();
  const resultado = configurarCartaoControle("Nubank vence dia 40", estado);

  assert.ok(resultado);
  assert.equal(resultado.atualizouEstado, false);
  assert.deepEqual(resultado.estado, estado);
  assert.match(resultado.resposta, /Não consegui salvar esse vencimento\./);
  assert.match(resultado.resposta, /O dia precisa estar entre 1 e 31\./);
  assert.match(resultado.resposta, /Nubank vence dia 05/);
  assert.doesNotMatch(resultado.resposta, /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/);
});

test("gasto em cartao configurado continua somando fatura aberta", () => {
  const configuracao = configurarCartaoControle("Nubank vence dia 05", estadoControleBase());
  assert.ok(configuracao);

  const gasto = registrarGastoControle(
    "gastei 65 no Nubank",
    configuracao.estado,
    new Date(2026, 6, 1, 12, 0, 0)
  );

  assert.ok(gasto);
  assert.equal(calcularSaldoDisponivelControle(gasto.estado), 1960);
  assert.deepEqual(gasto.estado.faturas, [{ cartao: "Nubank", valor: 65 }]);
  assert.deepEqual(gasto.estado.cartoes, [{ nome: "Nubank", fechamento: undefined, vencimento: 5 }]);
  assert.match(gasto.resposta, /💳 \*Origem:\* Cartão Nubank/);
  assert.match(gasto.resposta, /💳 \*Fatura Nubank:\* R\$ 65,00/);
  assert.match(gasto.resposta, /📆 \*Vencimento:\* dia 05/);
  assert.doesNotMatch(gasto.resposta, /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/);
});

test("gasto sem cartao sai do saldo do mes e nao entra em fatura", () => {
  const estadoInicial = atualizarDespesasFixasControle(
    { rendaMensal: 4000, totalDespesasFixas: 0, totalGastosSaldo: 0, faturas: [] },
    2040,
    4000
  );

  const resultado = registrarGastoControle(
    "gastei 65 de cerveja no bar",
    estadoInicial,
    new Date(2026, 6, 1, 12, 0, 0)
  );

  assert.ok(resultado);
  assert.equal(calcularSaldoDisponivelControle(resultado.estado), 1895);
  assert.equal(totalFaturasAbertasControle(resultado.estado), 0);
  assert.match(resultado.resposta, /✍️ \*Descrição:\* Cerveja Bar/);
  assert.match(resultado.resposta, /🏷️ \*Categoria:\* Lazer/);
  assert.match(resultado.resposta, /💳 \*Origem:\* Saldo do mês/);
  assert.match(resultado.resposta, /💰 \*Saldo disponível:\* R\$ 1\.895,00/);
  assert.match(resultado.resposta, /💳 \*Faturas em aberto:\* R\$ 0,00/);
  assert.doesNotMatch(resultado.resposta, /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/);
});

test("gasto com cartao soma fatura aberta sem abater saldo", () => {
  const estadoInicial = atualizarDespesasFixasControle(
    { rendaMensal: 4000, totalDespesasFixas: 0, totalGastosSaldo: 0, faturas: [] },
    2040,
    4000
  );

  const primeiro = registrarGastoControle(
    "gastei 65 de cerveja no Nubank",
    estadoInicial,
    new Date(2026, 6, 1, 12, 0, 0)
  );

  assert.ok(primeiro);
  assert.equal(calcularSaldoDisponivelControle(primeiro.estado), 1960);
  assert.equal(totalFaturasAbertasControle(primeiro.estado), 65);
  assert.deepEqual(primeiro.estado.faturas, [{ cartao: "Nubank", valor: 65 }]);
  assert.match(primeiro.resposta, /✍️ \*Descrição:\* Cerveja Bar/);
  assert.match(primeiro.resposta, /🏷️ \*Categoria:\* Lazer/);
  assert.match(primeiro.resposta, /💳 \*Origem:\* Cartão Nubank/);
  assert.match(primeiro.resposta, /💰 \*Saldo disponível:\* R\$ 1\.960,00/);
  assert.match(primeiro.resposta, /💳 \*Fatura Nubank:\* R\$ 65,00/);
  assert.match(primeiro.resposta, /Esse valor será considerado na fatura do cartão\. 👌/);

  const segundo = registrarGastoControle(
    "uber 23,50 no Nubank",
    primeiro.estado,
    new Date(2026, 6, 1, 12, 0, 0)
  );

  assert.ok(segundo);
  assert.equal(calcularSaldoDisponivelControle(segundo.estado), 1960);
  assert.equal(totalFaturasAbertasControle(segundo.estado), 88.5);
  assert.deepEqual(segundo.estado.faturas, [{ cartao: "Nubank", valor: 88.5 }]);
  assert.match(segundo.resposta, /💳 \*Origem:\* Cartão Nubank/);
  assert.match(segundo.resposta, /💳 \*Fatura Nubank:\* R\$ 88,50/);
  assert.doesNotMatch(`${primeiro.resposta}\n${segundo.resposta}`, /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/);
});

test("gasto com apostas mostra alerta e mantem calculo deterministico", () => {
  const estadoInicial = atualizarDespesasFixasControle(
    { rendaMensal: 4000, totalDespesasFixas: 0, totalGastosSaldo: 0, faturas: [] },
    2040,
    4000
  );

  const resultado = registrarGastoControle(
    "apostei 50 na betano",
    estadoInicial,
    new Date(2026, 6, 1, 12, 0, 0)
  );

  assert.ok(resultado);
  assert.equal(calcularSaldoDisponivelControle(resultado.estado), 1910);
  assert.equal(totalFaturasAbertasControle(resultado.estado), 0);
  assert.match(resultado.resposta, /✍️ \*Descrição:\* Betano/);
  assert.match(resultado.resposta, /🏷️ \*Categoria:\* Apostas/);
  assert.match(resultado.resposta, /⚠️ Atenção: gastos com apostas podem comprometer seu controle financeiro rapidamente\./);
  assert.doesNotMatch(resultado.resposta, /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/);
});

test("correcao posterior move ultimo gasto do saldo para fatura do cartao", () => {
  const estadoInicial = atualizarDespesasFixasControle(
    { rendaMensal: 4000, totalDespesasFixas: 0, totalGastosSaldo: 0, faturas: [] },
    2040,
    4000
  );
  const gasto = registrarGastoControle(
    "gastei 65 de cerveja no bar",
    estadoInicial,
    new Date(2026, 6, 1, 12, 0, 0)
  );
  assert.ok(gasto);
  assert.equal(calcularSaldoDisponivelControle(gasto.estado), 1895);

  const correcao = corrigirOrigemUltimoGastoControle("foi no Nubank", gasto.estado);
  assert.ok(correcao);
  assert.equal(calcularSaldoDisponivelControle(correcao.estado), 1960);
  assert.deepEqual(correcao.estado.faturas, [{ cartao: "Nubank", valor: 65 }]);
  assert.match(correcao.resposta, /✅ \*Origem atualizada\.\*/);
  assert.match(correcao.resposta, /✍️ \*Descrição:\* Cerveja Bar/);
  assert.match(correcao.resposta, /💳 \*Origem anterior:\* Saldo do mês/);
  assert.match(correcao.resposta, /💳 \*Nova origem:\* Cartão Nubank/);
  assert.match(correcao.resposta, /💰 \*Saldo disponível:\* R\$ 1\.960,00/);
  assert.match(correcao.resposta, /💳 \*Fatura Nubank:\* R\$ 65,00/);
  assert.doesNotMatch(correcao.resposta, /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/);
});

test("correcao posterior move ultimo gasto de um cartao para outro", () => {
  const estadoInicial = atualizarDespesasFixasControle(
    { rendaMensal: 4000, totalDespesasFixas: 0, totalGastosSaldo: 0, faturas: [] },
    2040,
    4000
  );
  const gasto = registrarGastoControle(
    "gastei 65 de cerveja no Nubank",
    estadoInicial,
    new Date(2026, 6, 1, 12, 0, 0)
  );
  assert.ok(gasto);
  assert.deepEqual(gasto.estado.faturas, [{ cartao: "Nubank", valor: 65 }]);

  const correcao = corrigirOrigemUltimoGastoControle("foi no Mercado Pago", gasto.estado);
  assert.ok(correcao);
  assert.equal(calcularSaldoDisponivelControle(correcao.estado), 1960);
  assert.deepEqual(correcao.estado.faturas, [{ cartao: "Mercado Pago", valor: 65 }]);
  assert.match(correcao.resposta, /💳 \*Origem anterior:\* Cartão Nubank/);
  assert.match(correcao.resposta, /💳 \*Nova origem:\* Cartão Mercado Pago/);
  assert.match(correcao.resposta, /💳 \*Fatura Mercado Pago:\* R\$ 65,00/);
  assert.match(correcao.resposta, /💳 \*Fatura Nubank:\* R\$ 0,00/);
  assert.doesNotMatch(correcao.resposta, /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/);
});

test("correcao posterior sem gasto recente orienta reenviar gasto", () => {
  const estadoInicial = atualizarDespesasFixasControle(
    { rendaMensal: 4000, totalDespesasFixas: 0, totalGastosSaldo: 0, faturas: [] },
    2040,
    4000
  );

  const correcao = corrigirOrigemUltimoGastoControle("foi no Nubank", estadoInicial);
  assert.ok(correcao);
  assert.equal(correcao.atualizouEstado, false);
  assert.equal(calcularSaldoDisponivelControle(correcao.estado), 1960);
  assert.match(correcao.resposta, /Não encontrei um gasto recente para atualizar\./);
  assert.match(correcao.resposta, /gastei 65 de cerveja no Nubank/);
  assert.doesNotMatch(correcao.resposta, /\b(undefined|null|NaN)\b|R\$ undefined|R\$ NaN/);
});
