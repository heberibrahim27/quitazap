import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
Module._extensions[".ts"] = function carregarTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
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
const { calcularSaudeFinanceira } = loadTsModule("src/lib/financeiro/saude-financeira.ts");

const base = (over = {}) => ({
  rendaMensal: 4500,
  custoMensalReferencia: 2500,
  totalDevido: 0,
  maiorAtrasoDias: null,
  percentualPago: 0,
  respiroDias: null,
  ...over,
});

test("caso real do dono: R$ 159 mil em consignados, salário R$ 4.500 e NENHUM gasto registrado → 'Montando sua nota', nunca 90 Excelente", () => {
  const s = calcularSaudeFinanceira(base({ custoMensalReferencia: null, totalDevido: 159000 }));
  assert.equal(s.dadosInsuficientes, true);
  assert.deepEqual(s.faltando, ["gastos"]);
  assert.equal(s.componentes.length, 0);
  assert.equal(s.pesoDivida.totalDevido, 159000);
  assert.equal(s.pesoDivida.percentualDaRendaAnual, 294); // 159.000 ÷ (4.500 × 12)
  assert.match(s.proximoPasso, /Registre seus gastos/);
});

test("conta nova sem nada: 'Montando sua nota', faltam renda e gastos, sem número", () => {
  const s = calcularSaudeFinanceira(base({ rendaMensal: null, custoMensalReferencia: null }));
  assert.equal(s.dadosInsuficientes, true);
  assert.deepEqual(s.faltando, ["renda", "gastos"]);
  assert.equal(s.pesoDivida, null);
});

test("consignado: o saldo devedor pesa 100% no 'Peso da dívida' mesmo com a parcela fora do mês", () => {
  const s = calcularSaudeFinanceira(base({ totalDevido: 159000, percentualPago: 20, respiroDias: 0 }));
  const peso = s.componentes.find((c) => c.nome === "Peso da dívida");
  assert.equal(peso.pontos, 4); // 294% da renda anual ⇒ faixa até 300%
  assert.ok(s.score < 60, `com dívida tão alta a nota não pode ser alta (veio ${s.score})`);
});

test("conta saudável e completa pontua alto e vira 'Bem encaminhada'", () => {
  const s = calcularSaudeFinanceira(base({ custoMensalReferencia: 2800, totalDevido: 6000, percentualPago: 60, respiroDias: 7 }));
  // fôlego 38% =30 · dívida 8% =30 · em dia =20 · respiro =10 · avanço 60% =8
  assert.equal(s.score, 98);
  assert.equal(s.classificacao, "Bem encaminhada");
});

test("atraso derruba 'Contas em dia' por faixa e vira o próximo passo", () => {
  assert.equal(calcularSaudeFinanceira(base({ maiorAtrasoDias: 10 })).componentes.find((c) => c.nome === "Contas em dia").pontos, 12);
  assert.equal(calcularSaudeFinanceira(base({ maiorAtrasoDias: 45 })).componentes.find((c) => c.nome === "Contas em dia").pontos, 6);
  const s = calcularSaudeFinanceira(base({ maiorAtrasoDias: 90 }));
  assert.equal(s.componentes.find((c) => c.nome === "Contas em dia").pontos, 0);
  assert.match(s.proximoPasso, /dívida em atraso/);
});

test("sem a meta Respiro: 0 pontos nesse critério (e o próximo passo ensina a criar), sem penalizar o resto", () => {
  const s = calcularSaudeFinanceira(base({ respiroDias: null }));
  assert.equal(s.componentes.find((c) => c.nome === "Respiro").pontos, 0);
  assert.match(s.proximoPasso, /Respiro/);
});

test("faixas em linguagem de bússola: nada de 'Crítica' nem 'Excelente'", () => {
  const baixa = calcularSaudeFinanceira(base({ custoMensalReferencia: 5000, totalDevido: 300000, maiorAtrasoDias: 120 }));
  assert.equal(baixa.classificacao, "Prioridade agora");
  const fonte = fs.readFileSync(path.join(root, "src/lib/financeiro/saude-financeira.ts"), "utf8");
  assert.ok(!/"Crítica"|"Excelente"/.test(fonte));
  assert.equal(calcularSaudeFinanceira(base()).versaoFormula, "financial_health_v2");
});

test("a tela não mostra número nenhum no estado 'montando' e mostra o próximo passo ao lado da nota", () => {
  const card = fs.readFileSync(path.join(root, "src/app/minha-conta/(protegido)/SaudeFinanceiraCard.tsx"), "utf8");
  assert.match(card, /Montando sua nota/);
  assert.match(card, /Próximo passo/);
  assert.ok(!/Crítica|Excelente/.test(card));
});
