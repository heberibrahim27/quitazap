import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const css = fs.readFileSync(
  path.join(root, "src/app/minha-conta/(protegido)/minha-conta.css"),
  "utf8",
);
const chatClient = fs.readFileSync(
  path.join(root, "src/app/minha-conta/(protegido)/chat/ChatClient.tsx"),
  "utf8",
);

function blocoCss(seletor) {
  const inicio = css.indexOf(`${seletor} {`);
  assert.notEqual(inicio, -1, `seletor ${seletor} não encontrado`);
  const fim = css.indexOf("}", inicio);
  assert.notEqual(fim, -1, `bloco de ${seletor} não foi fechado`);
  return css.slice(inicio, fim + 1);
}

test("chat full-screen cancela a altura reduzida da regra base", () => {
  const base = blocoCss(".mc-chat-shell");
  const telaCheia = blocoCss("body.mc-chat-tela .mc-chat-shell");

  assert.match(base, /height:\s*calc\(100dvh\s*-\s*200px\)/);
  assert.match(telaCheia, /bottom:\s*var\(--mc-teclado,\s*0px\)/);
  assert.match(telaCheia, /height:\s*auto/);
  assert.match(telaCheia, /min-height:\s*0/);
});

test("composer oferece câmera como ação direta ao lado do microfone", () => {
  const camera = chatClient.indexOf('aria-label="Abrir câmera"');
  const microfone = chatClient.indexOf('aria-label="Gravar áudio"');

  assert.notEqual(camera, -1);
  assert.notEqual(microfone, -1);
  assert.ok(camera < microfone, "a câmera deve aparecer imediatamente antes da ação de áudio");
  assert.match(chatClient, /ref=\{inputCameraRef\}[\s\S]*capture="environment"/);
});

test("campo do chat não dispara zoom de foco que corta a lateral no iOS", () => {
  const campo = blocoCss(".mc-chat-composer-campo");
  const tamanho = campo.match(/font-size:\s*([\d.]+)px/)?.[1];

  assert.ok(tamanho, "font-size do campo não encontrado");
  assert.ok(Number(tamanho) >= 16, "campo editável deve ter ao menos 16px no iOS");
});
