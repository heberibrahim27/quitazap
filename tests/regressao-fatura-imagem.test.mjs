import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

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

const { interpretarFaturaImagem } = loadTsModule("src/lib/ai/fatura-imagem.ts");

test("lê fatura do print com parcelas e data da compra", () => {
  const f = interpretarFaturaImagem(
    JSON.stringify({
      tipo: "FATURA_CARTAO",
      emissor: "Nubank",
      vencimentoFatura: "2026-10-15",
      parceladas: [
        { descricao: "Magazine Luiza", parcelaAtual: 3, totalParcelas: 10, valorParcela: "299,90", dataCompra: "2026-08-12" },
        { descricao: "", parcelaAtual: 1, totalParcelas: 2, valorParcela: 10 },
      ],
    })
  );
  assert.equal(f.emissor, "Nubank");
  assert.equal(f.parceladas.length, 1);
  assert.equal(f.parceladas[0].valorParcela, 299.9);
  assert.equal(f.parceladas[0].dataCompra, "2026-08-12");
});

test("aceita JSON em bloco markdown e rejeita sem vencimento ou tipo OUTRO", () => {
  assert.ok(interpretarFaturaImagem('```json\n{"tipo":"FATURA_CARTAO","emissor":"Inter","vencimentoFatura":"2026-11-01","parceladas":[]}\n```'));
  assert.equal(interpretarFaturaImagem('{"tipo":"FATURA_CARTAO","emissor":"Inter","vencimentoFatura":null,"parceladas":[]}'), null);
  assert.equal(interpretarFaturaImagem('{"tipo":"OUTRO"}'), null);
  assert.equal(interpretarFaturaImagem("não é json"), null);
});
