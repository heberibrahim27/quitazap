import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

Module._extensions[".ts"] = function (module, filename) {
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(out, filename);
};
function loadTsModule(rel) {
  const filename = path.join(root, rel);
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

const { calcularMediaDeMeses } = loadTsModule("src/lib/financeiro/media-mensal.ts");
const { calcularSaudeFinanceira } = loadTsModule("src/lib/financeiro/saude-financeira.ts");

const vazio = { despesasFixas: 0, despesasVariaveis: 0, cartoes: 0, porCategoria: [] };
const mes = (variaveis, categorias = []) => ({ despesasFixas: 0, despesasVariaveis: variaveis, cartoes: 0, porCategoria: categorias });

// Caso real do QA (04/10/2026): só setembro tinha despesa (R$150 variáveis);
// outubro (R$340) virava "580% acima da média" por dividir 150 por 3.
test("um único mês com dado não gera média (sem histórico suficiente)", () => {
  const media = calcularMediaDeMeses([vazio, vazio, mes(150, [{ categoria: "Mercado", total: 150 }])]);
  assert.equal(media.despesasVariaveis, 0);
  assert.deepEqual(media.porCategoria, []);
  assert.equal(media.quantidadeMeses, 1);
});

test("meses sem nenhuma despesa não puxam a média pra baixo", () => {
  const media = calcularMediaDeMeses([mes(100, [{ categoria: "Mercado", total: 100 }]), vazio, mes(300, [{ categoria: "Mercado", total: 300 }])]);
  assert.equal(media.quantidadeMeses, 2);
  assert.equal(media.despesasVariaveis, 200); // (100+300)/2, não /3
  assert.deepEqual(media.porCategoria, [{ categoria: "Mercado", total: 200 }]);
});

test("três meses com dado dividem por três", () => {
  const media = calcularMediaDeMeses([mes(90), mes(120), mes(150)]);
  assert.equal(media.quantidadeMeses, 3);
  assert.equal(media.despesasVariaveis, 120);
});

test("nenhum mês com dado devolve tudo zerado", () => {
  const media = calcularMediaDeMeses([vazio, vazio, vazio]);
  assert.equal(media.quantidadeMeses, 0);
  assert.equal(media.despesasVariaveis, 0);
});

test("Saúde Financeira de cliente com 1 mês de histórico não acusa 'acima da média'", () => {
  const media = calcularMediaDeMeses([vazio, vazio, mes(150)]);
  const saude = calcularSaudeFinanceira({
    totais: { despesasVariaveis: 340, receitas: 5800, resultadoSemPlano: 3945 },
    comprometimento: { calculavel: true, percentualComprometido: 0.32, saldoProjetado: 3945, rendaEfetiva: 5800 },
    mediaDespesasVariaveis: media.despesasVariaveis,
    temDividaEmAtraso: false,
  });
  const textos = JSON.stringify(saude.razoes);
  assert.doesNotMatch(textos, /acima da/);
  assert.match(textos, /sem histórico suficiente/i);
});

test("com histórico real, gasto muito acima da média continua sendo avisado", () => {
  const media = calcularMediaDeMeses([mes(100), mes(100), mes(100)]);
  const saude = calcularSaudeFinanceira({
    totais: { despesasVariaveis: 300, receitas: 5800, resultadoSemPlano: 3945 },
    comprometimento: { calculavel: true, percentualComprometido: 0.32, saldoProjetado: 3945, rendaEfetiva: 5800 },
    mediaDespesasVariaveis: media.despesasVariaveis,
    temDividaEmAtraso: false,
  });
  assert.match(JSON.stringify(saude.razoes), /200% acima da sua média dos meses anteriores/);
});
