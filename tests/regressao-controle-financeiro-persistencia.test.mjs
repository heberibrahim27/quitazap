import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Mesmo padrão de tests/regressao-tarefas.test.mjs: transpila .ts sob demanda
// pra dar pra carregar controle-financeiro-flow.ts direto, sem precisar de
// build. Testa só o que foi adicionado nesta sessão (itensParaPersistir /
// cartaoParaPersistir) — a lógica de parsing em si (categorias, valores,
// confirmação) já é código pré-existente em produção, fora de escopo aqui.

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
  salvarItensConfirmadosIA,
  registrarGastoControle,
  configurarCartaoControle,
  gerenciarDespesasFixasControle,
} = loadTsModule("src/lib/controle-financeiro-flow.ts");

function estadoBase(overrides = {}) {
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

// ── registrarGastoControle ──────────────────────────────────────────────

test("registrarGastoControle: gasto no saldo vira item DESPESA_VARIAVEL sem cartão", () => {
  const resultado = registrarGastoControle("gastei 50 no mercado", estadoBase());
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir.length, 1);
  const item = resultado.itensParaPersistir[0];
  assert.equal(item.tipo, "DESPESA_VARIAVEL");
  assert.equal(item.valor, 50);
  assert.equal(item.recorrente, false);
  assert.equal(item.cartaoNome, null);
});

test("registrarGastoControle: gasto no cartão vira item COMPRA_CARTAO com o nome do cartão", () => {
  const resultado = registrarGastoControle("gastei 80 no mercado no nubank", estadoBase());
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir.length, 1);
  const item = resultado.itensParaPersistir[0];
  assert.equal(item.tipo, "COMPRA_CARTAO");
  assert.equal(item.valor, 80);
  assert.equal(item.cartaoNome, "Nubank");
});

test("registrarGastoControle: usa a data resolvida do gasto (ex: 'ontem'), não a data da confirmação", () => {
  const agora = new Date("2026-08-19T12:00:00Z");
  const resultado = registrarGastoControle("gastei 50 no mercado ontem", estadoBase(), agora);
  assert.ok(resultado);
  const item = resultado.itensParaPersistir[0];
  assert.ok(item.data instanceof Date);
  assert.equal(item.data.getUTCDate(), 18);
});

test("registrarGastoControle: mensagem sem valor não gera item pra persistir", () => {
  const resultado = registrarGastoControle("gastei no mercado", estadoBase());
  if (resultado) {
    assert.equal(resultado.itensParaPersistir, undefined);
  }
});

// ── configurarCartaoControle ────────────────────────────────────────────

test("configurarCartaoControle: configurar fechamento e vencimento gera cartaoParaPersistir", () => {
  const resultado = configurarCartaoControle("nubank fecha dia 5 e vence dia 15", estadoBase());
  assert.ok(resultado);
  assert.deepEqual(resultado.cartaoParaPersistir, {
    nome: "Nubank",
    fechamento: 5,
    vencimento: 15,
  });
});

test("configurarCartaoControle: mensagem sem pedido de configuração não mexe no fluxo de cartão", () => {
  const resultado = configurarCartaoControle("oi, tudo bem?", estadoBase());
  assert.equal(resultado, null);
});

// ── gerenciarDespesasFixasControle (item único, sem pedir confirmação) ──

test("gerenciarDespesasFixasControle: despesa fixa única direta vira item DESPESA_FIXA recorrente", () => {
  const resultado = gerenciarDespesasFixasControle("assinatura netflix 40", estadoBase());
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir.length, 1);
  const item = resultado.itensParaPersistir[0];
  assert.equal(item.tipo, "DESPESA_FIXA");
  assert.equal(item.valor, 40);
  assert.equal(item.recorrente, true);
});

test("gerenciarDespesasFixasControle: confirma lote em frase corrida ('sim') e gera itensParaPersistir", () => {
  const pedido = gerenciarDespesasFixasControle("cadastrar despesa fixa: internet 100 reais e transporte 50 reais", estadoBase());
  assert.ok(pedido);
  assert.equal(pedido.estado.confirmacaoPendente?.tipo, "cadastrar_despesas_fixas");

  const confirmacao = gerenciarDespesasFixasControle("sim", pedido.estado);
  assert.ok(confirmacao);
  assert.equal(confirmacao.itensParaPersistir.length, 2);
  assert.ok(confirmacao.itensParaPersistir.every((item) => item.tipo === "DESPESA_FIXA" && item.recorrente === true));
});

// ── salvarItensConfirmadosIA (confirmação do lote interpretado pela IA) ──

test("salvarItensConfirmadosIA: confirma receita + despesa variável no saldo + compra no cartão + despesa fixa", () => {
  const intent = {
    itens: [
      { tipo: "receita", descricaoOriginal: "recebi pix", descricaoNormalizada: "Pix recebido", categoria: "Receita", valor: 200 },
      { tipo: "despesa_variavel", descricaoOriginal: "mercado", descricaoNormalizada: "Mercado", categoria: "Mercado", valor: 60, origem: "saldo" },
      { tipo: "despesa_variavel", descricaoOriginal: "roupa", descricaoNormalizada: "Roupa", categoria: "Vestuário", valor: 120, origem: "cartao", cartao: "Nubank" },
      { tipo: "despesa_fixa", descricaoOriginal: "aluguel", descricaoNormalizada: "Aluguel", categoria: "Moradia", valor: 900 },
    ],
  };

  const resultado = salvarItensConfirmadosIA(estadoBase(), intent);
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir.length, 4);

  const porTipo = Object.fromEntries(resultado.itensParaPersistir.map((item) => [item.tipo, item]));
  assert.equal(porTipo.RECEITA.valor, 200);
  assert.equal(porTipo.DESPESA_VARIAVEL.valor, 60);
  assert.equal(porTipo.DESPESA_VARIAVEL.cartaoNome, undefined);
  assert.equal(porTipo.COMPRA_CARTAO.valor, 120);
  assert.equal(porTipo.COMPRA_CARTAO.cartaoNome, "Nubank");
  assert.equal(porTipo.DESPESA_FIXA.valor, 900);
  assert.equal(porTipo.DESPESA_FIXA.recorrente, true);
});

test("salvarItensConfirmadosIA: nome de cartão em texto livre é padronizado pelo catálogo conhecido", () => {
  const intent = {
    itens: [
      { tipo: "despesa_variavel", descricaoOriginal: "tenis", descricaoNormalizada: "Tênis", categoria: "Vestuário", valor: 300, origem: "cartao", cartao: "meu nubank roxo" },
    ],
  };

  const resultado = salvarItensConfirmadosIA(estadoBase(), intent);
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir[0].cartaoNome, "Nubank");
});

test("salvarItensConfirmadosIA: cartão fora do catálogo mantém o texto original em vez de descartar", () => {
  const intent = {
    itens: [
      { tipo: "despesa_variavel", descricaoOriginal: "tenis", descricaoNormalizada: "Tênis", categoria: "Vestuário", valor: 300, origem: "cartao", cartao: "Cartão da Loja X" },
    ],
  };

  const resultado = salvarItensConfirmadosIA(estadoBase(), intent);
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir[0].cartaoNome, "Cartão da Loja X");
});

test("salvarItensConfirmadosIA: item inválido (sem valor) não gera itensParaPersistir", () => {
  const intent = {
    itens: [{ tipo: "despesa_variavel", descricaoOriginal: "", descricaoNormalizada: "", categoria: "Outros", valor: null }],
  };

  const resultado = salvarItensConfirmadosIA(estadoBase(), intent);
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir, undefined);
});

test("salvarItensConfirmadosIA: tipo bloqueado (ex: cartao) não gera itensParaPersistir", () => {
  const intent = {
    itens: [{ tipo: "cartao", descricaoOriginal: "nubank fecha dia 5", descricaoNormalizada: "nubank fecha dia 5", categoria: "Outros", valor: null }],
  };

  const resultado = salvarItensConfirmadosIA(estadoBase(), intent);
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir, undefined);
});
