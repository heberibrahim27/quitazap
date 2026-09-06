import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Mesmo padrão de tests/regressao-gasto-duplicado.test.mjs: transpila sob
// demanda. Cobre as 4 categorias novas do rescue parser (dívida/empréstimo
// novo, pagamento de dívida existente, meta, config de cartão) tanto no
// interpretador local (financeiro-intent-resolver.ts) quanto na gravação
// (controle-financeiro-flow.ts::salvarItensConfirmadosIA).

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

const {
  resolverDivida,
  resolverPagamentoDivida,
  resolverMeta,
  resolverConfigCartao,
  intentFinanceiroConfirmavel,
  formatarPreviaIntentFinanceiro,
} = loadTsModule("src/lib/ia/financeiro-intent-resolver.ts");

const { salvarItensConfirmadosIA } = loadTsModule("src/lib/controle-financeiro-flow.ts");

function estadoControleBase(overrides = {}) {
  return {
    rendaMensal: 3000,
    totalReceitasAvulsas: 0,
    totalDespesasFixas: 0,
    despesasFixas: [],
    totalGastosSaldo: 0,
    faturas: [],
    faturasFechadas: [],
    cartoes: [],
    ...overrides,
  };
}

// ── resolverDivida ─────────────────────────

test("resolverDivida: valor total + parcela mensal calcula totalParcelas por divisão", () => {
  const intent = resolverDivida("peguei um empréstimo de 3000 com o Carlos, pago 500 por mês");
  assert.ok(intent);
  assert.equal(intent.itens.length, 1);
  const item = intent.itens[0];
  assert.equal(item.tipo, "divida");
  assert.equal(item.valorTotalDivida, 3000);
  assert.equal(item.valor, 500);
  assert.equal(item.totalParcelas, 6);
  assert.equal(item.tipoDivida, "EMPRESTIMO");
  assert.ok(intentFinanceiroConfirmavel(intent));
});

test("resolverDivida: só valor total (sem parcela) não inventa totalParcelas", () => {
  const intent = resolverDivida("tenho uma dívida de 1500 no cartão nubank");
  assert.ok(intent);
  const item = intent.itens[0];
  assert.equal(item.valorTotalDivida, 1500);
  assert.equal(item.valor, null);
  assert.equal(item.totalParcelas, null);
  assert.equal(item.tipoDivida, "CARTAO");
});

test("resolverDivida: mensagem sem sinal de dívida/empréstimo retorna null", () => {
  assert.equal(resolverDivida("gastei 45 no mercado"), null);
});

// ── resolverPagamentoDivida ────────────────

test("resolverPagamentoDivida: reconhece pagamento de parcela existente com credor", () => {
  const intent = resolverPagamentoDivida("paguei a parcela do empréstimo do Carlos, 500");
  assert.ok(intent);
  const item = intent.itens[0];
  assert.equal(item.tipo, "pagamento_divida");
  assert.equal(item.valor, 500);
  assert.ok(item.descricaoNormalizada.length > 0);
  assert.ok(intentFinanceiroConfirmavel(intent));
});

test("resolverPagamentoDivida: sem palavra de dívida/parcela/empréstimo retorna null (não confunde com gasto comum)", () => {
  assert.equal(resolverPagamentoDivida("paguei 45 no mercado"), null);
});

// ── resolverMeta ───────────────────────────

test("resolverMeta: criar meta nova com valor-alvo", () => {
  const intent = resolverMeta("quero criar uma meta de 5000 pra reserva de emergência");
  assert.ok(intent);
  const item = intent.itens[0];
  assert.equal(item.tipo, "meta");
  assert.equal(item.acaoMeta, "criar");
  assert.equal(item.valorAlvoMeta, 5000);
  assert.ok(intentFinanceiroConfirmavel(intent));
});

test("resolverMeta: depositar em meta existente pelo nome", () => {
  const intent = resolverMeta("guardei 100 na minha meta de viagem");
  assert.ok(intent);
  const item = intent.itens[0];
  assert.equal(item.tipo, "meta");
  assert.equal(item.acaoMeta, "depositar");
  assert.equal(item.valor, 100);
  assert.match(item.descricaoNormalizada.toLowerCase(), /viagem/);
});

test("resolverMeta: mensagem sem palavra 'meta' retorna null", () => {
  assert.equal(resolverMeta("recebi 3000 de salário"), null);
});

// ── resolverConfigCartao ───────────────────

test("resolverConfigCartao: fechamento e vencimento juntos", () => {
  const intent = resolverConfigCartao("a fatura do nubank fecha dia 10 e vence dia 20");
  assert.ok(intent);
  const item = intent.itens[0];
  assert.equal(item.tipo, "cartao");
  assert.equal(item.diaFechamentoCartao, 10);
  assert.equal(item.diaVencimentoCartao, 20);
  assert.equal(item.cartao, "Nubank");
  assert.ok(intentFinanceiroConfirmavel(intent));
});

test("resolverConfigCartao: sem 'fecha'/'vence' retorna null", () => {
  assert.equal(resolverConfigCartao("gastei 45 no cartão nubank"), null);
});

// ── formatarPreviaIntentFinanceiro (confirmação antes de salvar) ──

test("formatarPreviaIntentFinanceiro: dívida nova pede confirmação explícita", () => {
  const intent = resolverDivida("peguei um empréstimo de 3000 com o Carlos, pago 500 por mês");
  const texto = formatarPreviaIntentFinanceiro(intent);
  assert.match(texto, /Confirma/i);
  assert.match(texto, /Carlos/);
});

// ── salvarItensConfirmadosIA: gravação das 4 categorias novas ──

test("salvarItensConfirmadosIA: dívida confirmada gera dividaParaPersistir e nunca bloqueia mais como 'tipo não suportado'", () => {
  const intent = resolverDivida("peguei um empréstimo de 3000 com o Carlos, pago 500 por mês");
  const resultado = salvarItensConfirmadosIA(estadoControleBase(), intent);
  assert.ok(resultado.dividaParaPersistir);
  assert.equal(resultado.dividaParaPersistir.credor, "Carlos");
  assert.equal(resultado.dividaParaPersistir.valorTotal, 3000);
  assert.equal(resultado.dividaParaPersistir.valorParcela, 500);
  assert.equal(resultado.dividaParaPersistir.totalParcelas, 6);
  assert.equal(resultado.estado.confirmacaoPendente, undefined);
  assert.doesNotMatch(resultado.resposta, /tratamento específico/);
});

test("salvarItensConfirmadosIA: pagamento de dívida gera pagamentoDividaParaPersistir", () => {
  const intent = resolverPagamentoDivida("paguei a parcela do empréstimo do Carlos, 500");
  const resultado = salvarItensConfirmadosIA(estadoControleBase(), intent);
  assert.ok(resultado.pagamentoDividaParaPersistir);
  assert.equal(resultado.pagamentoDividaParaPersistir.valor, 500);
  assert.equal(resultado.pagamentoDividaParaPersistir.credorAproximado, "Carlos");
});

test("salvarItensConfirmadosIA: criar meta gera metaParaPersistir com acao 'criar'", () => {
  const intent = resolverMeta("quero criar uma meta de 5000 pra reserva de emergência");
  const resultado = salvarItensConfirmadosIA(estadoControleBase(), intent);
  assert.ok(resultado.metaParaPersistir);
  assert.equal(resultado.metaParaPersistir.acao, "criar");
  assert.equal(resultado.metaParaPersistir.valorAlvo, 5000);
});

test("salvarItensConfirmadosIA: depositar em meta gera metaParaPersistir com acao 'depositar'", () => {
  const intent = resolverMeta("guardei 100 na minha meta de viagem");
  const resultado = salvarItensConfirmadosIA(estadoControleBase(), intent);
  assert.ok(resultado.metaParaPersistir);
  assert.equal(resultado.metaParaPersistir.acao, "depositar");
  assert.equal(resultado.metaParaPersistir.valor, 100);
});

test("salvarItensConfirmadosIA: config de cartão gera cartaoParaPersistir (reaproveita persistirCartaoControle)", () => {
  const intent = resolverConfigCartao("a fatura do nubank fecha dia 10 e vence dia 20");
  const resultado = salvarItensConfirmadosIA(estadoControleBase(), intent);
  assert.ok(resultado.cartaoParaPersistir);
  assert.equal(resultado.cartaoParaPersistir.nome, "Nubank");
  assert.equal(resultado.cartaoParaPersistir.fechamento, 10);
  assert.equal(resultado.cartaoParaPersistir.vencimento, 20);
});

test("salvarItensConfirmadosIA: misturar categoria nova com receita/despesa no mesmo lote ainda bloqueia (fora do escopo tratado)", () => {
  const intent = {
    emEscopo: true,
    intencao: "misto",
    confianca: 0.9,
    precisaConfirmacao: true,
    itens: [
      {
        tipo: "receita",
        descricaoOriginal: "salário",
        descricaoNormalizada: "Salário",
        categoria: "Renda",
        valor: 3000,
      },
      {
        tipo: "divida",
        descricaoOriginal: "empréstimo",
        descricaoNormalizada: "Carlos",
        categoria: "Dívida",
        valor: null,
        tipoDivida: "EMPRESTIMO",
        valorTotalDivida: 3000,
      },
    ],
  };
  const resultado = salvarItensConfirmadosIA(estadoControleBase(), intent);
  assert.match(resultado.resposta, /tratamento específico/);
  assert.equal(resultado.dividaParaPersistir, undefined);
});
