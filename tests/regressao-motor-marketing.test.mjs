import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Mesmo padrão de outros testes de regressão: transpila sob demanda.
// motor-marketing.ts é a lógica pura da tela /marketing (Ibrahim,
// 2026-09-06, especificação revisada com o ChatGPT) — projeção de
// investimento em Ads e a lógica de "Escala Controlada".

const root = path.resolve(import.meta.dirname, "..");

Module._extensions[".ts"] = function carregarTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;

  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

const {
  margemContribuicaoPorAssinante,
  tetoCacPaybackDoisMeses,
  calcularPaybackMeses,
  projetarMarketing,
  avaliarEscalaControlada,
} = loadTsModule("src/lib/marketing/motor-marketing.ts");

// Valores de hoje: R$14,90, 5,3%, R$0,01/cliente — margem ≈ R$14,10, teto ≈ R$28,20.
const MOTOR_PADRAO = {
  precoMensal: 14.9,
  comissaoCakto: 0.053,
  custoIAPorClienteAtivo: 0.01,
  infraestruturaMensal: 189.99,
};

test("margemContribuicaoPorAssinante bate com os valores de hoje (~R$14,10)", () => {
  const margem = margemContribuicaoPorAssinante(MOTOR_PADRAO);
  assert.ok(Math.abs(margem - 14.1003) < 0.001, `margem inesperada: ${margem}`);
});

test("tetoCacPaybackDoisMeses é sempre 2x a margem — nunca hardcoded (muda se o motor mudar)", () => {
  const teto = tetoCacPaybackDoisMeses(MOTOR_PADRAO);
  assert.ok(Math.abs(teto - 28.2006) < 0.01, `teto inesperado: ${teto}`);

  // Motor com preço diferente — o teto tem que acompanhar, não ficar preso a R$28,20.
  const motorPrecoMaior = { ...MOTOR_PADRAO, precoMensal: 20 };
  const tetoNovo = tetoCacPaybackDoisMeses(motorPrecoMaior);
  assert.notEqual(tetoNovo.toFixed(2), teto.toFixed(2));
  assert.equal(tetoNovo.toFixed(4), (margemContribuicaoPorAssinante(motorPrecoMaior) * 2).toFixed(4));
});

test("calcularPaybackMeses: CAC igual à margem = payback de 1 mês; CAC igual ao teto = 2 meses", () => {
  const margem = margemContribuicaoPorAssinante(MOTOR_PADRAO);
  assert.ok(Math.abs(calcularPaybackMeses(margem, MOTOR_PADRAO) - 1) < 0.001);
  const teto = tetoCacPaybackDoisMeses(MOTOR_PADRAO);
  assert.ok(Math.abs(calcularPaybackMeses(teto, MOTOR_PADRAO) - 2) < 0.001);
});

test("calcularPaybackMeses devolve null quando a margem não é positiva", () => {
  const motorSemMargem = { ...MOTOR_PADRAO, custoIAPorClienteAtivo: 100 };
  assert.equal(calcularPaybackMeses(10, motorSemMargem), null);
});

// ── projetarMarketing ──────────────────────

test("projetarMarketing: 1º mês aplica CAC/churn corretamente a partir dos ativos iniciais", () => {
  const linhas = projetarMarketing(
    { ativosIniciais: 10, investimentoMensal: 1000, cacProjetado: 25, churnMensal: 0.15, horizonteMeses: 1, mesInicialCalendario: "2026-09" },
    MOTOR_PADRAO
  );
  assert.equal(linhas.length, 1);
  const [l1] = linhas;
  assert.equal(l1.mesCalendario, "2026-09");
  assert.ok(Math.abs(l1.novosPagos - 40) < 0.001); // 1000/25
  assert.ok(Math.abs(l1.cancelados - 1.5) < 0.001); // 10*0.15
  assert.ok(Math.abs(l1.ativosFim - 48.5) < 0.001); // 10 - 1.5 + 40
});

test("projetarMarketing: investimento fica constante mês a mês (não escala sozinha)", () => {
  const linhas = projetarMarketing(
    { ativosIniciais: 0, investimentoMensal: 1000, cacProjetado: 25, churnMensal: 0.15, horizonteMeses: 6, mesInicialCalendario: "2026-09" },
    MOTOR_PADRAO
  );
  for (const l of linhas) assert.equal(l.investimentoAds, 1000);
});

test("projetarMarketing: mesCalendario avança um mês por linha, virando o ano corretamente", () => {
  const linhas = projetarMarketing(
    { ativosIniciais: 0, investimentoMensal: 1000, cacProjetado: 25, churnMensal: 0.15, horizonteMeses: 4, mesInicialCalendario: "2026-11" },
    MOTOR_PADRAO
  );
  assert.deepEqual(linhas.map((l) => l.mesCalendario), ["2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("projetarMarketing: resultadoAcumulado é a soma corrida do resultado operacional de cada mês", () => {
  const linhas = projetarMarketing(
    { ativosIniciais: 5, investimentoMensal: 500, cacProjetado: 25, churnMensal: 0.1, horizonteMeses: 3, mesInicialCalendario: "2026-09" },
    MOTOR_PADRAO
  );
  let soma = 0;
  for (const l of linhas) {
    soma += l.resultadoOperacional;
    assert.ok(Math.abs(l.resultadoAcumulado - soma) < 0.0001);
  }
});

test("projetarMarketing: ativosFim nunca fica negativo mesmo com churn extremo e investimento zero", () => {
  const linhas = projetarMarketing(
    { ativosIniciais: 5, investimentoMensal: 0, cacProjetado: 25, churnMensal: 0.9, horizonteMeses: 5, mesInicialCalendario: "2026-09" },
    MOTOR_PADRAO
  );
  for (const l of linhas) assert.ok(l.ativosFim >= 0);
});

// ── avaliarEscalaControlada ─────────────────

function avaliar(overrides = {}) {
  return avaliarEscalaControlada({
    dados: { investimentoReal: 1000, novasAssinaturasPagas: 40 },
    churnRealFracao: 0.1,
    churnMetaFracao: 0.15,
    resultadoOperacionalDoMes: 200,
    investimentoAnterior: 1000,
    motor: MOTOR_PADRAO,
    ...overrides,
  });
}

test("VERDE: CAC baixo, retenção ok, resultado positivo, volume suficiente → sugere aumentar", () => {
  // CAC real = 1000/40 = 25 -- isso é maior que o limite de 20 pro verde;
  // ajusta pra CAC real de R$15 (60 assinaturas) pra cair em verde de verdade.
  const r = avaliar({ dados: { investimentoReal: 900, novasAssinaturasPagas: 60 } });
  assert.equal(r.nivel, "VERDE");
  assert.ok(r.investimentoSugerido > 1000);
});

test("VERMELHO: CAC acima do teto (R$28,20) → não escalar, motivo cita o teto", () => {
  const r = avaliar({ dados: { investimentoReal: 1200, novasAssinaturasPagas: 30 } }); // CAC = 40
  assert.equal(r.nivel, "VERMELHO");
  assert.match(r.motivo, /teto/i);
  assert.equal(r.investimentoSugerido, 1000); // nunca reduz por número mágico, só mantém
});

test("VERMELHO: retenção pior que a meta, mesmo com CAC razoável → não escalar", () => {
  const r = avaliar({ churnRealFracao: 0.3, churnMetaFracao: 0.15, dados: { investimentoReal: 500, novasAssinaturasPagas: 25 } }); // CAC = 20
  assert.equal(r.nivel, "VERMELHO");
});

test("AMARELO: CAC entre R$20 e o teto → manter", () => {
  const r = avaliar({ dados: { investimentoReal: 1000, novasAssinaturasPagas: 40 } }); // CAC = 25
  assert.equal(r.nivel, "AMARELO");
  assert.equal(r.investimentoSugerido, 1000);
});

test("AMARELO: poucas vendas (amostra pequena) nunca vira VERDE nem VERMELHO, mesmo com CAC ótimo", () => {
  const r = avaliar({ dados: { investimentoReal: 20, novasAssinaturasPagas: 2 } }); // CAC = 10, ótimo, mas só 2 vendas
  assert.equal(r.nivel, "AMARELO");
  assert.match(r.motivo, /volume/i);
});

test("AMARELO: churn real desconhecido (null) → retenção inconclusiva, mantém", () => {
  const r = avaliar({ churnRealFracao: null });
  assert.equal(r.nivel, "AMARELO");
  assert.match(r.motivo, /retenção/i);
});

test("Trava de bootstrap: aumento nunca passa de 25% do investimento anterior", () => {
  // Resultado operacional muito alto não deve destravar aumento maior que 25%.
  const r = avaliar({
    dados: { investimentoReal: 500, novasAssinaturasPagas: 50 }, // CAC = 10
    resultadoOperacionalDoMes: 100_000,
    investimentoAnterior: 1000,
  });
  assert.equal(r.nivel, "VERDE");
  assert.ok(r.investimentoSugerido <= 1000 * 1.25 + 0.001, `sugeriu além de +25%: ${r.investimentoSugerido}`);
});

test("Trava de bootstrap: aumento nunca passa de 50% do resultado operacional do mês anterior", () => {
  const r = avaliar({
    dados: { investimentoReal: 500, novasAssinaturasPagas: 50 }, // CAC = 10
    resultadoOperacionalDoMes: 100, // 50% disso = 50, bem menor que 25% de 1000 (=250)
    investimentoAnterior: 1000,
  });
  assert.equal(r.nivel, "VERDE");
  assert.ok(Math.abs(r.investimentoSugerido - 1050) < 0.01, `esperava 1050, veio ${r.investimentoSugerido}`);
});

test("resultado operacional negativo nunca vira VERDE, mesmo com CAC ótimo — e nunca sugere aumento", () => {
  // "Resultado operacional positivo" é uma das 4 condições do verde (não
  // só a base da trava de reinvestimento) — CAC de R$10 sozinho não basta.
  const r = avaliar({
    dados: { investimentoReal: 500, novasAssinaturasPagas: 50 }, // CAC = 10
    resultadoOperacionalDoMes: -300,
    investimentoAnterior: 1000,
  });
  assert.notEqual(r.nivel, "VERDE");
  assert.equal(r.investimentoSugerido, 1000);
});

test("cacReal usa Infinity quando não há nenhuma venda (nunca divide por zero silenciosamente)", () => {
  const r = avaliar({ dados: { investimentoReal: 500, novasAssinaturasPagas: 0 } });
  assert.equal(r.cacReal, Infinity);
  assert.equal(r.nivel, "AMARELO"); // cai em volume insuficiente antes de qualquer comparação com CAC
});
