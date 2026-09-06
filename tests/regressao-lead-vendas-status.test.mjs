import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Mesmo padrão de tests/regressao-gasto-duplicado.test.mjs: transpila sob
// demanda. calcularStatusLead deriva o status exibido no painel admin
// (/leads) a partir dos campos já existentes em LeadVendas — cobre os
// status pedidos pelo Ibrahim: assinou, pensando, parou de responder,
// objeção sem resposta, stop/optout, recusou, não converteu, em andamento.

const root = path.resolve(import.meta.dirname, "..");

Module._extensions[".ts"] = function carregarTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

const { calcularStatusLead } = loadTsModule("src/lib/lead-vendas-status.ts");

const AGORA = new Date("2026-09-06T12:00:00Z");
function horasAtras(h) {
  return new Date(AGORA.getTime() - h * 60 * 60 * 1000);
}

function leadBase(overrides = {}) {
  return {
    etapa: "OFERTA",
    motivoDesistencia: null,
    angulosUsados: "",
    tentativasObjecao: 0,
    atualizadoEm: horasAtras(1),
    ...overrides,
  };
}

test("CONVERTIDO vira ASSINOU, independente de qualquer outro campo", () => {
  const lead = leadBase({ etapa: "CONVERTIDO", atualizadoEm: horasAtras(100) });
  assert.equal(calcularStatusLead(lead, AGORA), "ASSINOU");
});

test("DESISTIU com motivoDesistencia OPTOUT vira PEDIU_PRA_PARAR", () => {
  const lead = leadBase({ etapa: "DESISTIU", motivoDesistencia: "OPTOUT" });
  assert.equal(calcularStatusLead(lead, AGORA), "PEDIU_PRA_PARAR");
});

test("DESISTIU com motivoDesistencia RECUSOU vira RECUSOU", () => {
  const lead = leadBase({ etapa: "DESISTIU", motivoDesistencia: "RECUSOU" });
  assert.equal(calcularStatusLead(lead, AGORA), "RECUSOU");
});

test("DESISTIU com motivoDesistencia OBJECAO_ESGOTADA (ou null) vira NAO_CONVERTEU", () => {
  assert.equal(calcularStatusLead(leadBase({ etapa: "DESISTIU", motivoDesistencia: "OBJECAO_ESGOTADA" }), AGORA), "NAO_CONVERTEU");
  assert.equal(calcularStatusLead(leadBase({ etapa: "DESISTIU", motivoDesistencia: null }), AGORA), "NAO_CONVERTEU");
});

test("lead ativo com mensagem recente (< 24h) é EM_ANDAMENTO, mesmo com objeções no histórico", () => {
  const lead = leadBase({ etapa: "FOLLOWUP", angulosUsados: "PRECO,ADIAR", tentativasObjecao: 2, atualizadoEm: horasAtras(2) });
  assert.equal(calcularStatusLead(lead, AGORA), "EM_ANDAMENTO");
});

test("parado há 24h+ com último ângulo usado ADIAR vira PENSANDO", () => {
  const lead = leadBase({ etapa: "FOLLOWUP", angulosUsados: "PRECO,ADIAR", tentativasObjecao: 2, atualizadoEm: horasAtras(30) });
  assert.equal(calcularStatusLead(lead, AGORA), "PENSANDO");
});

test("parado há 24h+ com objeção no histórico mas último ângulo não é ADIAR vira OBJECAO_SEM_RESPOSTA", () => {
  const lead = leadBase({ etapa: "FOLLOWUP", angulosUsados: "PRECO,CONFIANCA", tentativasObjecao: 2, atualizadoEm: horasAtras(30) });
  assert.equal(calcularStatusLead(lead, AGORA), "OBJECAO_SEM_RESPOSTA");
});

test("parado há 24h+ sem nenhuma objeção ainda (sumiu antes até de ver a oferta) vira PAROU_DE_RESPONDER", () => {
  const lead = leadBase({ etapa: "QUALIFICACAO", angulosUsados: "", tentativasObjecao: 0, atualizadoEm: horasAtras(48) });
  assert.equal(calcularStatusLead(lead, AGORA), "PAROU_DE_RESPONDER");
});

test("exatamente no limite de 24h ainda conta como abandonado (>=)", () => {
  const lead = leadBase({ etapa: "FOLLOWUP", atualizadoEm: horasAtras(24) });
  assert.notEqual(calcularStatusLead(lead, AGORA), "EM_ANDAMENTO");
});
