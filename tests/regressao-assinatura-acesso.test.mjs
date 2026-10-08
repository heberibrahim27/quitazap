import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const filename = path.join(root, "src/lib/assinatura-regra.ts");
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
const { assinaturaVencida } = mod.exports;

const agora = new Date("2026-10-08T12:00:00Z");
const dia = (d) => new Date(agora.getTime() + d * 86400000);

test("assinatura no futuro libera; vencida bloqueia", () => {
  assert.equal(assinaturaVencida({ gratuito: false, assinaturaVenceEm: dia(10) }, agora), false);
  assert.equal(assinaturaVencida({ gratuito: false, assinaturaVenceEm: dia(-1) }, agora), true);
});

test("cortesia (gratuito) e conta de teste nunca bloqueiam, mesmo vencidas", () => {
  assert.equal(assinaturaVencida({ gratuito: true, assinaturaVenceEm: dia(-100) }, agora), false);
  assert.equal(assinaturaVencida({ gratuito: false, isTeste: true, assinaturaVenceEm: dia(-100) }, agora), false);
});

test("sem data de vencimento não bloqueia (mesma regra do WhatsApp)", () => {
  assert.equal(assinaturaVencida({ gratuito: false, assinaturaVenceEm: null }, agora), false);
});

test("reembolso expira 'agora': já bloqueia no instante seguinte", () => {
  const expirou = new Date(agora.getTime() - 1);
  assert.equal(assinaturaVencida({ gratuito: false, assinaturaVenceEm: expirou }, agora), true);
});
