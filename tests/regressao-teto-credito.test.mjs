import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
Module._extensions[".ts"] = function (module, filename) {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText,
    filename
  );
};
const { calcularTetoCredito, nivelDoTeto } = (await import("node:module")).createRequire(import.meta.url)(
  path.join(root, "src/lib/financeiro/teto-credito.ts")
);

// Hoje = 09/10/2026. Cartão fecha dia 24 e vence dia 1.
const agora = new Date("2026-10-09T15:00:00Z");
const cartao = { id: "c1", diaFechamento: 24, diaVencimento: 1 };
const d = (iso) => new Date(`${iso}T15:00:00Z`);
const base = { rendaConfiavel: 5000, fixas: 1800, variaveis: 400, parcelasDivida: 600, cartoes: [cartao], agora };

test("sem compras: renda 4.500 − fixas 1.800 − parcelas 600 → teto 2.100", () => {
  const r = calcularTetoCredito({
    rendaConfiavel: 4500,
    fixas: 1800,
    variaveis: 0,
    parcelasDivida: 600,
    cartoes: [cartao],
    compras: [],
    agora,
  });
  assert.equal(r.teto, 2100);
  assert.equal(r.usado, 0);
  assert.equal(r.nivel, "OK");
});

test("compras do ciclo aberto (até 24/10) contam como usado; ciclo vencido não conta", () => {
  const r = calcularTetoCredito({
    ...base,
    compras: [
      { cartaoId: "c1", valor: 500, data: d("2026-10-05") }, // ciclo aberto (fecha 24/10, vence 01/11)
      { cartaoId: "c1", valor: 300, data: d("2026-10-08") }, // idem
      { cartaoId: "c1", valor: 999, data: d("2026-09-10") }, // fatura que venceu em 01/10: tratada como paga
    ],
  });
  assert.equal(r.usado, 800);
  assert.equal(r.faturasFechadas, 0);
  assert.equal(r.teto, 5000 - 1800 - 400 - 600);
});

test("fatura de ciclo já fechado e ainda não vencida reduz o teto", () => {
  // Hoje 28/10: o ciclo de 25/09 a 24/10 já fechou e vence 01/11; compras novas (26/10) são do próximo.
  const hoje = new Date("2026-10-28T15:00:00Z");
  const r = calcularTetoCredito({
    ...base,
    agora: hoje,
    compras: [
      { cartaoId: "c1", valor: 1200, data: d("2026-10-10") }, // ciclo fechado em 24/10, vence 01/11
      { cartaoId: "c1", valor: 150, data: d("2026-10-26") }, // ciclo aberto (fecha 24/11)
    ],
  });
  assert.equal(r.faturasFechadas, 1200);
  assert.equal(r.usado, 150);
  assert.equal(r.teto, 5000 - 1800 - 400 - 600 - 1200);
});

test("níveis 70/90/100", () => {
  assert.equal(nivelDoTeto(0.5), "OK");
  assert.equal(nivelDoTeto(0.7), "ATENCAO");
  assert.equal(nivelDoTeto(0.9), "QUASE");
  assert.equal(nivelDoTeto(1), "ACIMA");
  assert.equal(nivelDoTeto(1.4), "ACIMA");
});

test("teto nunca é negativo e ACIMA quando já usou algo com teto zero", () => {
  const r = calcularTetoCredito({
    ...base,
    rendaConfiavel: 1000,
    compras: [{ cartaoId: "c1", valor: 100, data: d("2026-10-05") }],
  });
  assert.equal(r.teto, 0);
  assert.equal(r.nivel, "ACIMA");
});

test("sem renda confiável ou sem cartão com fechamento → null (não inventa)", () => {
  assert.equal(calcularTetoCredito({ ...base, rendaConfiavel: 0, compras: [] }), null);
  assert.equal(calcularTetoCredito({ ...base, cartoes: [{ id: "c1", diaFechamento: null, diaVencimento: null }], compras: [] }), null);
  assert.equal(calcularTetoCredito({ ...base, cartoes: [], compras: [] }), null);
});

test("parcelas FUTURAS de compra parcelada não viram fatura fechada (TV 10x de 300)", () => {
  const compras = [];
  // 1ª parcela no ciclo aberto (fecha 24/10) e as outras 9 em ciclos posteriores
  const datas = ["2026-10-05", "2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05", "2027-03-05", "2027-04-05", "2027-05-05", "2027-06-05", "2027-07-05"];
  for (const dt of datas) compras.push({ cartaoId: "c1", valor: 300, data: d(dt) });
  const r = calcularTetoCredito({ ...base, compras });
  assert.equal(r.usado, 300); // só a parcela do ciclo aberto pesa
  assert.equal(r.faturasFechadas, 0);
  assert.equal(r.teto, 5000 - 1800 - 400 - 600);
});
