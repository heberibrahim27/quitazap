import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const css = fs.readFileSync(
  path.join(root, "src/app/minha-conta/(protegido)/minha-conta.css"),
  "utf8",
);

test("navegação inferior não acompanha o teclado sobre formulários no celular", () => {
  const regraFoco = css.match(
    /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?body:has\(input:focus, textarea:focus, select:focus, \[contenteditable="true"\]:focus\) \.bottom-nav,[\s\S]*?body:has\(input:focus, textarea:focus, select:focus, \[contenteditable="true"\]:focus\) \.bn-chat-atalho\s*\{([\s\S]*?)\}/,
  );

  assert.ok(regraFoco, "regra móvel para campos focados não encontrada");
  assert.match(regraFoco[1], /display:\s*none/);
});
