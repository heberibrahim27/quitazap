import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

Module._extensions[".ts"] = function (module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText,
    filename
  );
  return mod.exports;
}

const { definirCategoriaGasto } = loadTsModule("src/lib/gasto-flow.ts");

// Descrições reais da fatura Nubank de 2026-11-01 → categoria esperada.
const CASOS = [
  ["Atacadao Atakarejo", "Mercado"],
  ["Asa*Upward Creative Ac", "Outros"],
  ["IOF de compra internacional", "Impostos/Taxas"],
  ["Vercel Inc.", "Trabalho/Negócio"],
  ["Supabase", "Trabalho/Negócio"],
  ["Z-Api.Io", "Trabalho/Negócio"],
  ["Anthropic* Claude Sub", "Assinaturas"],
  ["Openai *Chatgpt Subscr", "Assinaturas"],
  ["Google Premiere", "Assinaturas"],
  ["Boleto no Crédito - PRIME CONSULTORIA EMPRESARIAL SOCIEDADE UNIPESSOAL LTDA", "Pix/Boleto no crédito"],
  ["Pix no Crédito - Cleonice Ibrahim Ribeiro", "Pix/Boleto no crédito"],
  ["Pix no Crédito - CLEVISON DIAS DOS SANTOS", "Pix/Boleto no crédito"],
  ["la Baguette Delicatess", "Alimentação"],
  ["Sorvetes Master", "Alimentação"],
  ["Zé Delivery - NuPay", "Lazer"],
  ["Santos Pedreira Com de", "Outros"],
  ["O Baratao Auto Pecas L", "Transporte"],
  ["Kiwify *Afiliadasp", "Outros"],
];

for (const [descricao, esperada] of CASOS) {
  test(`categoria: ${descricao.slice(0, 40)} → ${esperada}`, () => {
    assert.equal(definirCategoriaGasto(descricao), esperada);
  });
}

test("'prime' sozinho (consultoria) não vira Assinaturas; Amazon Prime continua", () => {
  assert.notEqual(definirCategoriaGasto("Prime Consultoria"), "Assinaturas");
  assert.equal(definirCategoriaGasto("Amazon Prime"), "Assinaturas");
});
