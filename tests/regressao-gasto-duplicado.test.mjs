import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Mesmo padrão de tests/regressao-controle-financeiro-persistencia.test.mjs:
// transpila controle-financeiro-flow.ts sob demanda. Cobre só o detector de
// lançamento duplicado (Skill Analista) — mesmo valor + mesmo estabelecimento
// já lançado hoje deve pedir confirmação antes de registrar de novo, e a
// resposta "sim"/"não" a essa pergunta deve resolver corretamente.

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

const { registrarGastoControle } = loadTsModule("src/lib/controle-financeiro-flow.ts");

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

test("registrarGastoControle: sem lançamento recente parecido, registra normal", () => {
  const resultado = registrarGastoControle("gastei 45 no mercado", estadoBase(), new Date(), []);
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir.length, 1);
  assert.equal(resultado.estado.confirmacaoPendente, undefined);
});

test("registrarGastoControle: mesmo valor+estabelecimento já lançado hoje pede confirmação, não persiste direto", () => {
  const primeiro = registrarGastoControle("gastei 45 no mercado", estadoBase(), new Date(), []);
  const itemJaLancado = { descricao: primeiro.itensParaPersistir[0].descricao, valor: 45 };

  const resultado = registrarGastoControle("gastei 45 no mercado", estadoBase(), new Date(), [itemJaLancado]);
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir, undefined);
  assert.equal(resultado.estado.confirmacaoPendente?.tipo, "confirmar_gasto_duplicado");
  assert.match(resultado.resposta, /já registrou/i);
});

test("registrarGastoControle: valor diferente no mesmo estabelecimento não é tratado como duplicado", () => {
  const itemJaLancado = { descricao: "Mercado", valor: 45 };
  const resultado = registrarGastoControle("gastei 90 no mercado", estadoBase(), new Date(), [itemJaLancado]);
  assert.ok(resultado);
  assert.equal(resultado.itensParaPersistir.length, 1);
  assert.equal(resultado.estado.confirmacaoPendente, undefined);
});

test("registrarGastoControle: 'sim' à pendência de duplicado registra o item original", () => {
  const itemJaLancado = { descricao: "Mercado", valor: 45 };
  const pendente = registrarGastoControle("gastei 45 no mercado", estadoBase(), new Date(), [itemJaLancado]);
  assert.equal(pendente.estado.confirmacaoPendente?.tipo, "confirmar_gasto_duplicado");

  const confirmado = registrarGastoControle("sim", pendente.estado);
  assert.ok(confirmado);
  assert.equal(confirmado.itensParaPersistir.length, 1);
  assert.equal(confirmado.itensParaPersistir[0].valor, 45);
  assert.equal(confirmado.estado.confirmacaoPendente, undefined);
});

test("registrarGastoControle: 'não' à pendência de duplicado não gera item pra persistir", () => {
  const itemJaLancado = { descricao: "Mercado", valor: 45 };
  const pendente = registrarGastoControle("gastei 45 no mercado", estadoBase(), new Date(), [itemJaLancado]);

  const negado = registrarGastoControle("não", pendente.estado);
  assert.ok(negado);
  assert.equal(negado.itensParaPersistir, undefined);
  assert.equal(negado.estado.confirmacaoPendente, undefined);
  assert.match(negado.resposta, /não registrei/i);
});
