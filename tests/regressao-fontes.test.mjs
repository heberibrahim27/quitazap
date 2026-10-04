import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

function arquivosDe(dir, exts) {
  const saida = [];
  for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, nome.name);
    if (nome.isDirectory()) saida.push(...arquivosDe(p, exts));
    else if (exts.some((e) => nome.name.endsWith(e))) saida.push(p);
  }
  return saida;
}

// O deploy já quebrou duas vezes porque o build não conseguiu baixar a fonte
// Inter do Google (next/font/google busca na hora do build). Fontes agora são
// auto-hospedadas (src/fonts + public/fonts); este teste impede a volta.
test("nenhum arquivo do app depende de fontes do Google", () => {
  const ofensores = [];
  for (const arq of arquivosDe(path.join(root, "src"), [".ts", ".tsx", ".css"])) {
    const conteudo = fs.readFileSync(arq, "utf8");
    if (conteudo.includes("next/font/google") || conteudo.includes("fonts.googleapis.com") || conteudo.includes("fonts.gstatic.com")) {
      ofensores.push(path.relative(root, arq));
    }
  }
  assert.deepEqual(ofensores, [], `Use next/font/local com arquivos em src/fonts (ou @font-face em public/fonts): ${ofensores.join(", ")}`);
});

test("os arquivos de fonte referenciados existem", () => {
  for (const arq of ["inter", "fraunces", "fraunces-italic", "oswald", "jetbrains-mono", "manrope", "anton"]) {
    assert.ok(fs.existsSync(path.join(root, "src", "fonts", `${arq}.woff2`)), `falta src/fonts/${arq}.woff2`);
  }
  for (const arq of ["inter", "space-grotesk", "ibm-plex-mono-500"]) {
    assert.ok(fs.existsSync(path.join(root, "public", "fonts", `${arq}.woff2`)), `falta public/fonts/${arq}.woff2`);
  }
});
