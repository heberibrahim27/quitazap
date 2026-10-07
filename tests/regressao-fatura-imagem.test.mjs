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
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

const { interpretarFaturaImagem, interpretarDocumentoImagem } = loadTsModule("src/lib/ai/fatura-imagem.ts");

test("lê fatura do print com parcelas e data da compra", () => {
  const f = interpretarFaturaImagem(
    JSON.stringify({
      tipo: "FATURA_CARTAO",
      emissor: "Nubank",
      vencimentoFatura: "2026-10-15",
      parceladas: [
        { descricao: "Magazine Luiza", parcelaAtual: 3, totalParcelas: 10, valorParcela: "299,90" },
        { descricao: "", parcelaAtual: 1, totalParcelas: 2, valorParcela: 10 },
      ],
      compras: [
        { descricao: "Magazine Luiza", valor: 299.9, data: "2026-08-12", parcelaAtual: 3 },
        { descricao: "Vercel Inc.", valor: "139,12", data: "2026-10-05", parcelaAtual: null },
        { descricao: "Sem data", valor: 5, data: null },
      ],
    })
  );
  assert.equal(f.emissor, "Nubank");
  assert.equal(f.parceladas.length, 1);
  assert.equal(f.parceladas[0].valorParcela, 299.9);
  // parcela 3/10: a data da linha é a da cobrança, não a da compra
  assert.equal(f.parceladas[0].dataCompra, undefined);
  assert.equal(f.compras.length, 2);
  assert.equal(f.compras[1].valor, 139.12);
});

test("print que só mostra o mês da fatura vira vencimento estimado", () => {
  const f = interpretarFaturaImagem('{"tipo":"FATURA_CARTAO","emissor":"Nubank","vencimentoFatura":null,"mesFatura":"2026-11","compras":[],"parceladas":[]}');
  assert.equal(f.vencimentoFatura, "2026-11-10");
  assert.equal(f.vencimentoEstimado, true);
});

test("aceita JSON em bloco markdown e rejeita sem vencimento ou tipo OUTRO", () => {
  assert.ok(interpretarFaturaImagem('```json\n{"tipo":"FATURA_CARTAO","emissor":"Inter","vencimentoFatura":"2026-11-01","parceladas":[]}\n```'));
  assert.equal(interpretarFaturaImagem('{"tipo":"FATURA_CARTAO","emissor":"Inter","vencimentoFatura":null,"parceladas":[]}'), null);
  assert.equal(interpretarFaturaImagem('{"tipo":"OUTRO"}'), null);
  assert.equal(interpretarFaturaImagem("não é json"), null);
});

const EMPRESTIMO_NUBANK = JSON.stringify({
  tipo: "EMPRESTIMO",
  credor: "Nubank",
  nome: "Dinheiro do negócio",
  valorRestante: 1063.06,
  parcelas: [
    { numero: 1, vencimento: "2026-09-24", valor: 265.77, paga: true },
    { numero: 2, vencimento: "2026-10-24", valor: 265.77, paga: false },
    { numero: 3, vencimento: "2026-11-24", valor: 265.77, paga: false },
    { numero: 4, vencimento: "2026-12-24", valor: 265.77, paga: false },
    { numero: 5, vencimento: "2027-01-24", valor: 265.77, paga: false },
  ],
});

test("parcelas futuras saem da própria linha da compra mesmo se a IA esquecer 'parceladas'", () => {
  const f = interpretarFaturaImagem(JSON.stringify({
    tipo: "FATURA_CARTAO", emissor: "PagBank", vencimentoFatura: "2026-11-01", totalFatura: 154.2,
    compras: [
      { descricao: "Loja Magazine", valor: 99.9, data: "2026-10-06", parcelaAtual: 2, totalParcelas: 5 },
      { descricao: "Mercado", valor: 54.3, data: "2026-10-03", parcelaAtual: null, totalParcelas: null },
    ],
    parceladas: [],
  }));
  assert.deepEqual(f.parceladas.map((p) => [p.descricao, p.parcelaAtual, p.totalParcelas, p.valorParcela]), [["Loja Magazine", 2, 5, 99.9]]);
  assert.equal(f.totalImpresso, 154.2);
});

test("print de empréstimo vira empréstimo (parcelas, valor, 1ª data e pagas)", () => {
  const d = interpretarDocumentoImagem(EMPRESTIMO_NUBANK);
  assert.equal(d.tipo, "EMPRESTIMO");
  assert.deepEqual(d.emprestimo, {
    credor: "Nubank - Dinheiro do negócio",
    totalParcelas: 5,
    valorParcela: 265.77,
    primeiraData: "2026-09-24",
    parcelasPagas: 1,
    valorRestanteImpresso: 1063.06,
  });
});

test("print parcial de empréstimo (rolou a tela): 1ª data e pagas deduzidas", () => {
  const parcial = JSON.stringify({
    tipo: "EMPRESTIMO", credor: "Nubank", nome: null, valorRestante: null,
    parcelas: [
      { numero: 3, vencimento: "2026-11-30", valor: 100, paga: true },
      { numero: 4, vencimento: "2026-12-30", valor: 100, paga: false },
      { numero: 5, vencimento: "2027-01-30", valor: 100, paga: false },
    ],
  });
  const e = interpretarDocumentoImagem(parcial).emprestimo;
  assert.equal(e.totalParcelas, 5);
  assert.equal(e.parcelasPagas, 3);
  assert.equal(e.primeiraData, "2026-09-30");
  assert.equal(e.credor, "Nubank");
});

test("empréstimo: tudo pago ou uma parcela só não é lançado; fatura continua sendo fatura", () => {
  assert.equal(interpretarDocumentoImagem(JSON.stringify({ tipo: "EMPRESTIMO", credor: "X", parcelas: [{ numero: 1, vencimento: "2026-09-24", valor: 10, paga: true }] })), null);
  assert.equal(interpretarDocumentoImagem(JSON.stringify({ tipo: "EMPRESTIMO", credor: "X", parcelas: [
    { numero: 1, vencimento: "2026-09-24", valor: 10, paga: true }, { numero: 2, vencimento: "2026-10-24", valor: 10, paga: true }] })), null);
  const fat = interpretarDocumentoImagem('{"tipo":"FATURA_CARTAO","emissor":"Nubank","vencimentoFatura":"2026-11-01","compras":[],"parceladas":[]}');
  assert.equal(fat.tipo, "FATURA");
});
