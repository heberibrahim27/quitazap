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

const { mesFaturaDaCompra, deslocarMes } = loadTsModule("src/lib/financeiro/fatura-cartao.ts");

// Meio-dia UTC evita qualquer ambiguidade de fuso na extração do dia em
// Brasília (mesmo padrão usado no resto do app pra datas de lançamento).
function dataBR(ano, mes, dia) {
  return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
}

test("deslocarMes soma/subtrai meses cruzando o limite do ano", () => {
  assert.deepEqual(deslocarMes(2026, 12, 1), { ano: 2027, mes: 1 });
  assert.deepEqual(deslocarMes(2026, 1, -1), { ano: 2025, mes: 12 });
  assert.deepEqual(deslocarMes(2026, 9, 0), { ano: 2026, mes: 9 });
});

// Achado real do Ibrahim (14/09/2026): cartão com fechamento dia 25 e
// vencimento dia 01 — uma compra em 01/09/2026 (antes do fechamento do
// mês) tem que cair na fatura de OUTUBRO (fecha 25/09, vence 01/10), não
// na de setembro.
test("compra antes do fechamento do mês cai na fatura que vence no mês seguinte", () => {
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 1), 25, 1);
  assert.deepEqual(fatura, { ano: 2026, mes: 10 });
});

test("compra depois do fechamento do mês cai na fatura que vence em dois meses", () => {
  // 26/09 já passou do fechamento (25) — pertence ao ciclo que fecha
  // 25/10, e como vencimento (1) < fechamento (25), essa fatura vence em
  // novembro.
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 26), 25, 1);
  assert.deepEqual(fatura, { ano: 2026, mes: 11 });
});

test("compra exatamente no dia do fechamento ainda entra no ciclo que fecha esse mês", () => {
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 25), 25, 1);
  assert.deepEqual(fatura, { ano: 2026, mes: 10 });
});

test("cartão sem vencimento cadastrado rotula a fatura pelo mês de fechamento", () => {
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 1), 25, null);
  assert.deepEqual(fatura, { ano: 2026, mes: 9 });
});

test("vencimento no mesmo mês do fechamento não desloca a fatura pro mês seguinte", () => {
  // fechamento dia 5, vencimento dia 12 — ambos no mesmo mês do ciclo.
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 1), 5, 12);
  assert.deepEqual(fatura, { ano: 2026, mes: 9 });
});

test("cartão sem fechamento cadastrado mantém o mês calendário puro (comportamento antigo)", () => {
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 1), null, null);
  assert.deepEqual(fatura, { ano: 2026, mes: 9 });
});

test("ciclo de dezembro/janeiro cruza o ano corretamente", () => {
  const fatura = mesFaturaDaCompra(dataBR(2026, 12, 26), 25, 1);
  assert.deepEqual(fatura, { ano: 2027, mes: 2 });
});
