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
const { projetarReceitasPrevistas, avaliarCaixaPrevisto } = (await import("node:module")).createRequire(import.meta.url)(
  path.join(root, "src/lib/financeiro/caixa-previsto.ts")
);

// Outubro/2026 em Brasília: 01/10 03:00Z até 01/11 03:00Z. "Hoje" = 09/10 12:00 Brasília.
const periodo = { inicio: new Date("2026-10-01T03:00:00Z"), fim: new Date("2026-11-01T03:00:00Z") };
const agora = new Date("2026-10-09T15:00:00Z");
const base = { agendadas: [], fontesRecorrentes: [], descricoesNoPeriodo: [], periodo, agora };

test("fonte recorrente de salário cai em 29/10 → entra como prevista", () => {
  const r = projetarReceitasPrevistas({
    ...base,
    fontesRecorrentes: [{ descricao: "Salário", valor: 5000, data: new Date("2026-09-29T15:00:00Z"), tipo: "RECEITA", categoria: "Salário" }],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].valor, 5000);
  assert.equal(r[0].origem, "RECORRENTE");
  assert.equal(r[0].data.toISOString().slice(0, 10), "2026-10-29");
});

test("fonte no último dia do mês repete no último dia (31/10)", () => {
  const r = projetarReceitasPrevistas({
    ...base,
    fontesRecorrentes: [{ descricao: "Salário", valor: 5000, data: new Date("2026-09-30T15:00:00Z"), tipo: "RECEITA", categoria: null }],
  });
  assert.equal(r[0].data.toISOString().slice(0, 10), "2026-10-31");
});

test("receita com data futura no mês entra como agendada", () => {
  const r = projetarReceitasPrevistas({ ...base, agendadas: [{ descricao: "Freela", valor: 800, data: new Date("2026-10-20T15:00:00Z") }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].origem, "AGENDADA");
});

test("fonte cujo dia já chegou NÃO é prevista (o cron cria a cópia)", () => {
  const r = projetarReceitasPrevistas({
    ...base,
    fontesRecorrentes: [{ descricao: "Aluguel", valor: 400, data: new Date("2026-09-07T15:00:00Z"), tipo: "RECEITA", categoria: "Aluguel recebido" }],
  });
  assert.equal(r.length, 0);
});

test("fonte cuja próxima ocorrência cai no mês seguinte não entra", () => {
  const r = projetarReceitasPrevistas({
    ...base,
    fontesRecorrentes: [{ descricao: "Aluguel", valor: 400, data: new Date("2026-10-07T15:00:00Z"), tipo: "RECEITA", categoria: null }],
  });
  assert.equal(r.length, 0);
});

test("não duplica: a mesma descrição já lançada no mês não vira prevista de novo", () => {
  const r = projetarReceitasPrevistas({
    ...base,
    descricoesNoPeriodo: ["salário"],
    fontesRecorrentes: [{ descricao: "Salário", valor: 5000, data: new Date("2026-09-30T15:00:00Z"), tipo: "RECEITA", categoria: null }],
  });
  assert.equal(r.length, 0);
});

test("depósito de meta e parcela nunca entram", () => {
  const r = projetarReceitasPrevistas({
    ...base,
    fontesRecorrentes: [
      { descricao: "Saque", valor: 100, data: new Date("2026-09-30T15:00:00Z"), tipo: "RECEITA", categoria: "Metas" },
      { descricao: "TV (2/3)", valor: 300, data: new Date("2026-09-30T15:00:00Z"), tipo: "RECEITA", categoria: null },
    ],
  });
  assert.equal(r.length, 0);
});

test("saldo positivo → NORMAL", () => {
  const a = avaliarCaixaPrevisto(1107, []);
  assert.equal(a.estado, "NORMAL");
  assert.equal(a.falta, 0);
});

test("o caso do Ibrahim: −2.161,20 com salário de 5.000 previsto → COBERTO e sobra 2.838,80", () => {
  const prevista = [{ descricao: "Salário", valor: 5000, data: new Date("2026-10-30T15:00:00Z"), origem: "RECORRENTE" }];
  const a = avaliarCaixaPrevisto(-2161.2, prevista);
  assert.equal(a.estado, "COBERTO");
  assert.equal(a.falta, 2161.2);
  assert.equal(a.saldoComPrevistas, 2838.8);
  assert.equal(a.proxima.descricao, "Salário");
});

test("saldo negativo sem nenhuma previsão → SEM_PREVISAO (nada é inventado)", () => {
  const a = avaliarCaixaPrevisto(-2161.2, []);
  assert.equal(a.estado, "SEM_PREVISAO");
  assert.equal(a.saldoComPrevistas, -2161.2);
});

test("previsão que não cobre → DEFICIT_PROJETADO", () => {
  const a = avaliarCaixaPrevisto(-2161.2, [{ descricao: "Freela", valor: 800, data: new Date("2026-10-20T15:00:00Z"), origem: "AGENDADA" }]);
  assert.equal(a.estado, "DEFICIT_PROJETADO");
  assert.equal(a.saldoComPrevistas, -1361.2);
});

test("mesmo valor já agendado no mês: fonte recorrente com outro nome não conta duas vezes", () => {
  const r = projetarReceitasPrevistas({
    ...base,
    agendadas: [{ descricao: "Salário out", valor: 5000, data: new Date("2026-10-29T15:00:00Z") }],
    fontesRecorrentes: [{ descricao: "Salário", valor: 5000, data: new Date("2026-09-29T15:00:00Z"), tipo: "RECEITA", categoria: null }],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].origem, "AGENDADA");
});
