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

const { proximaOcorrenciaMensal, diaAlvoDaSerie, decidirRecorrencia, podeRepetir, normalizarDescricaoRecorrencia } =
  loadTsModule("src/lib/financeiro/recorrencia.ts");

const iso = (d) => d.toISOString().slice(0, 10);

test("próxima ocorrência é o mesmo dia do mês seguinte", () => {
  assert.equal(iso(proximaOcorrenciaMensal(new Date("2026-10-05T15:00:00Z"))), "2026-11-05");
  assert.equal(iso(proximaOcorrenciaMensal(new Date("2026-12-10T15:00:00Z"))), "2027-01-10");
});

test("dia 31 cai no último dia do mês curto e volta ao 31 depois", () => {
  const jan31 = new Date("2026-01-31T15:00:00Z");
  const fev = proximaOcorrenciaMensal(jan31, diaAlvoDaSerie(jan31));
  assert.equal(iso(fev), "2026-02-28");
  // da cópia de fevereiro (28 = último dia) a série volta a "último dia do mês"
  const mar = proximaOcorrenciaMensal(fev, diaAlvoDaSerie(fev));
  assert.equal(iso(mar), "2026-03-31");
});

test("dia 28 num mês longo continua dia 28 (não vira 'último dia')", () => {
  const d = new Date("2026-10-28T15:00:00Z");
  assert.equal(diaAlvoDaSerie(d), 28);
  assert.equal(iso(proximaOcorrenciaMensal(d, diaAlvoDaSerie(d))), "2026-11-28");
});

test("a ocorrência só nasce quando o dia chega (Brasília)", () => {
  const fonte = new Date("2026-10-05T15:00:00Z");
  // 04/11 23:30 BRT = 05/11 02:30 UTC: ainda é dia 04 em Brasília
  assert.equal(decidirRecorrencia(fonte, new Date("2026-11-05T02:30:00Z")).aguardar, true);
  // 05/11 00:10 BRT
  assert.equal(decidirRecorrencia(fonte, new Date("2026-11-05T03:10:00Z")).aguardar, false);
  // um mês depois, bem depois do dia
  assert.equal(decidirRecorrencia(fonte, new Date("2026-11-20T12:00:00Z")).aguardar, false);
});

test("o que nunca se repete: meta, parcela, fatura fechada", () => {
  assert.equal(podeRepetir({ tipo: "RECEITA", categoria: "Salário", descricao: "Salário" }), true);
  assert.equal(podeRepetir({ tipo: "DESPESA_FIXA", categoria: "Moradia", descricao: "Aluguel" }), true);
  assert.equal(podeRepetir({ tipo: "RECEITA", categoria: "Metas", descricao: "Saque: Viagem" }), false);
  assert.equal(podeRepetir({ tipo: "COMPRA_CARTAO", categoria: "Outros", descricao: "TV parcelada (2/3)" }), false);
  assert.equal(podeRepetir({ tipo: "FATURA_FECHADA", categoria: null, descricao: "Fatura fechada — Nubank" }), false);
});

test("descrição equivalente ignora acento, caixa e espaços", () => {
  assert.equal(normalizarDescricaoRecorrencia("  Salário  Janeiro "), normalizarDescricaoRecorrencia("salario janeiro"));
});
