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
function carregar(rel) {
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
const { avisoDeVencimento, diasCandidatosDoMes, proximaOcorrenciaDoDia } = carregar("src/lib/lembretes.ts");

// 08:00 em Brasília = 11:00 UTC (como o cron real)
const manha = (iso) => new Date(`${iso}T11:00:00Z`);
// parcela gravada às 12:00 UTC no dia (como o app grava)
const parcela = (iso, valor) => ({ valor, vencimento: new Date(`${iso}T12:00:00Z`) });
const parcelada = (...parcelas) => ({ diaVencimento: 10, valorTotal: 999, temParcelas: true, parcelasPendentes: parcelas });

test("parcelada: avisa o valor da PARCELA (não o total) em D-3", () => {
  const a = avisoDeVencimento(parcelada(parcela("2026-10-10", 30.9)), manha("2026-10-07"));
  assert.deepEqual(a, { diasRestantes: 3, valor: 30.9, dia: 10 });
});

test("parcelada: janela D-1 e D0; fora da janela não avisa", () => {
  const p = parcelada(parcela("2026-10-10", 30.9));
  assert.equal(avisoDeVencimento(p, manha("2026-10-09")).diasRestantes, 1);
  assert.equal(avisoDeVencimento(p, manha("2026-10-10")).diasRestantes, 0);
  assert.equal(avisoDeVencimento(p, manha("2026-10-08")), null); // D-2 não avisa
  assert.equal(avisoDeVencimento(p, manha("2026-10-06")), null); // D-4
  assert.equal(avisoDeVencimento(p, manha("2026-10-11")), null); // já passou
});

test("parcelada: parcela a meses de distância NÃO avisa todo mês (bug de 07/10)", () => {
  const p = parcelada(parcela("2026-12-01", 30.9), parcela("2027-01-01", 30.9));
  assert.equal(avisoDeVencimento(p, manha("2026-10-07")), null);
  assert.equal(avisoDeVencimento(p, manha("2026-11-28")).diasRestantes, 3);
});

test("parcelada: parcela ATRASADA não marcada como paga não bloqueia a próxima", () => {
  // o cron só passa as parcelas da janela, mas a regra também tem que ignorar atrasadas se vierem
  const p = parcelada(parcela("2026-09-24", 265.77), parcela("2026-10-10", 265.77));
  assert.deepEqual(avisoDeVencimento(p, manha("2026-10-07")), { diasRestantes: 3, valor: 265.77, dia: 10 });
});

test("parcelada sem nenhuma parcela na janela (ou todas pagas) → null", () => {
  assert.equal(avisoDeVencimento(parcelada(), manha("2026-10-07")), null);
});

test("sem parcelas (dívida avulsa): usa o dia do mês e o valor total", () => {
  const d = { diaVencimento: 10, valorTotal: 500, temParcelas: false, parcelasPendentes: [] };
  assert.deepEqual(avisoDeVencimento(d, manha("2026-10-07")), { diasRestantes: 3, valor: 500, dia: 10 });
  assert.equal(avisoDeVencimento({ ...d, diaVencimento: null }, manha("2026-10-07")), null);
});

test("virada de mês: dia 1 é avisado em D-3 a partir do dia 29 (antes era perdido)", () => {
  const d = { diaVencimento: 1, valorTotal: 100, temParcelas: false, parcelasPendentes: [] };
  assert.equal(avisoDeVencimento(d, manha("2026-10-29")).diasRestantes, 3);
  assert.equal(avisoDeVencimento(d, manha("2026-10-31")).diasRestantes, 1);
  assert.equal(avisoDeVencimento(d, manha("2026-11-01")).diasRestantes, 0);
  assert.equal(avisoDeVencimento(d, manha("2026-12-29")).diasRestantes, 3); // vira o ano
});

test("mês curto: dia 31 vence no último dia (fev=28, abr=30)", () => {
  assert.deepEqual(proximaOcorrenciaDoDia({ ano: 2026, mes: 2, dia: 20 }, 31), { ano: 2026, mes: 2, dia: 28 });
  const d = { diaVencimento: 31, valorTotal: 100, temParcelas: false, parcelasPendentes: [] };
  assert.equal(avisoDeVencimento(d, manha("2026-02-25")).diasRestantes, 3);
  assert.equal(avisoDeVencimento(d, manha("2026-04-27")).diasRestantes, 3);
});

test("fuso: 22h em Brasília (01h UTC do dia seguinte) ainda conta como o dia de Brasília", () => {
  const d = { diaVencimento: 10, valorTotal: 100, temParcelas: false, parcelasPendentes: [] };
  // 2026-10-08 01:00Z = 2026-10-07 22:00 em Brasília → D-3
  assert.equal(avisoDeVencimento(d, new Date("2026-10-08T01:00:00Z")).diasRestantes, 3);
});

test("candidatos do banco cobrem virada de mês e dia 31", () => {
  assert.ok(diasCandidatosDoMes({ ano: 2026, mes: 10, dia: 29 }).includes(1));
  const abril30 = diasCandidatosDoMes({ ano: 2026, mes: 4, dia: 30 });
  assert.ok(abril30.includes(31) && abril30.includes(30) && abril30.includes(1));
  assert.ok(diasCandidatosDoMes({ ano: 2026, mes: 10, dia: 7 }).join() === "7,8,10");
});
