import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Mesmo padrão de outros testes de regressão: transpila sob demanda.
// Pedido do Ibrahim (2026-09-06): um cadastro de teste interno (isTeste)
// nunca pode contar como assinante pagante em nenhum contador do admin —
// whereStatusAssinatura("PAGO") é o ponto central que a maioria das telas
// usa pra filtrar/contar; este teste trava que ele exclui isTeste=true.

const root = path.resolve(import.meta.dirname, "..");

Module._extensions[".ts"] = function carregarTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;

  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

const { whereStatusAssinatura, calcularStatusAssinatura } = loadTsModule("src/lib/status-assinatura.ts");

test("whereStatusAssinatura('PAGO') exige isTeste false", () => {
  const where = whereStatusAssinatura("PAGO");
  assert.equal(where.isTeste, false);
  assert.equal(where.gratuito, false);
});

test("whereStatusAssinatura('CANCELADO'/'INATIVO') não filtra por isTeste (cadastro de teste continua visível no histórico)", () => {
  assert.ok(!("isTeste" in whereStatusAssinatura("CANCELADO")));
  assert.ok(!("isTeste" in whereStatusAssinatura("INATIVO")));
});

test("calcularStatusAssinatura continua calculando o status literal do cliente, mesmo isTeste (exclusão é só nos contadores agregados)", () => {
  // isTeste não é um campo que calcularStatusAssinaturaEm conhece — a
  // exclusão acontece nos pontos de contagem (whereStatusAssinatura e os
  // `findMany({ where: { isTeste: false } })` espalhados pelo admin), não
  // aqui. Isso é intencional: a tela de detalhe de um cliente de teste
  // ainda mostra o status real dele.
  const clienteTesteAtivo = { gratuito: false, assinaturaVenceEm: null };
  assert.equal(calcularStatusAssinatura(clienteTesteAtivo), "PAGO");
});
