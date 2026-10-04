import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

// Permite que um módulo .ts importe outro por caminho relativo sem extensão.
Module._extensions[".ts"] = function carregarTypeScript(module, filename) {
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

const { primeiraDataPelaProxima, contarParcelasVencidas } = loadTsModule("src/lib/financeiro/parcelas-passadas.ts");
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

test("a primeira data sai da próxima parcela e de quantas já foram pagas", () => {
  // 30 pagas, próxima (nº 31) vence 05/11/2026 → a 1ª venceu 05/05/2024
  assert.equal(ymd(primeiraDataPelaProxima(new Date(2026, 10, 5, 12), 30)), "2024-05-05");
  assert.equal(ymd(primeiraDataPelaProxima(new Date(2026, 10, 5, 12), 0)), "2026-11-05");
});

test("dia 31 respeita meses curtos ao voltar no calendário", () => {
  // próxima em 31/03/2026 com 1 paga → a 1ª foi em fevereiro (28), não pula para março
  assert.equal(ymd(primeiraDataPelaProxima(new Date(2026, 2, 31, 12), 1)), "2026-02-28");
});

test("conta só as parcelas que vencem antes de hoje", () => {
  const primeira = new Date(2024, 4, 30, 12); // 30/05/2024
  // hoje = 04/10/2026: de 30/05/2024 até 30/09/2026 são 29 parcelas vencidas
  assert.equal(contarParcelasVencidas(primeira, 120, new Date(2026, 9, 4, 12)), 29);
  // no dia do vencimento ainda não conta como vencida
  assert.equal(contarParcelasVencidas(primeira, 120, new Date(2026, 8, 30, 12)), 28);
  // nunca passa do total
  assert.equal(contarParcelasVencidas(primeira, 10, new Date(2026, 9, 4, 12)), 10);
});

test("cadastro e detalhe usam o serviço único e nunca geram lançamento ao marcar parcela do passado", () => {
  const servico = fs.readFileSync(path.join(root, "src/lib/divida-service.ts"), "utf8");
  assert.match(servico, /export async function marcarParcelasPagasAte/);
  assert.match(servico, /parcelasJaPagas/);
  const trecho = servico.slice(servico.indexOf("export async function marcarParcelasPagasAte"));
  assert.doesNotMatch(trecho, /prisma\.lancamento|tx\.lancamento/, "pagamento de parcela antiga não pode criar Lancamento");
  const novo = fs.readFileSync(path.join(root, "src/app/minha-conta/(protegido)/emprestimos/novo/page.tsx"), "utf8");
  assert.match(novo, /primeiraDataPelaProxima/);
  const detalhe = fs.readFileSync(path.join(root, "src/app/minha-conta/(protegido)/emprestimos/[id]/page.tsx"), "utf8");
  assert.match(detalhe, /marcarParcelasPagasAte/);
});
