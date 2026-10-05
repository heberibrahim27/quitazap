import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const ler = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
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

// Os resolvers importam muita coisa por alias "@/": pega só a regex pura do fonte.
function extrairRegex(rel, nome) {
  const m = ler(rel).match(new RegExp(`const ${nome} =\\s*(/.*/[a-z]*);`));
  assert.ok(m, `regex ${nome} não encontrada em ${rel}`);
  return (0, eval)(m[1]);
}

const { adaptarRespostaParaChat } = loadTsModule("src/lib/canal-chat.ts");
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

test("chat nativo: nenhuma resposta fala de WhatsApp", () => {
  const original =
    "Eu sou o assistente financeiro do QuitaZAP. Posso te ajudar a registrar gastos e organizar sua vida financeira pelo WhatsApp.";
  const t = adaptarRespostaParaChat(original);
  assert.ok(!/whatsapp/i.test(t));
  assert.match(t, /por aqui\./);
  assert.ok(!/whatsapp/i.test(adaptarRespostaParaChat("Me manda no WhatsApp ou direto no WhatsApp, via WhatsApp, do seu WhatsApp.")));
});

test("chat nativo: negrito do WhatsApp não aparece cru, e número com asterisco não é tocado", () => {
  assert.equal(adaptarRespostaParaChat("mande *guardei 174 na meta respiro* para guardar"), "mande “guardei 174 na meta respiro” para guardar");
  assert.equal(adaptarRespostaParaChat("Criei a meta *Respiro* de R$ 480,00."), "Criei a meta “Respiro” de R$ 480,00.");
  assert.equal(adaptarRespostaParaChat("2 * 3 = 6"), "2 * 3 = 6");
  assert.equal(adaptarRespostaParaChat("📍 **AGORA**: pague o carnê"), "📍 AGORA: pague o carnê");
});

test("pedido de ajuda sem pergunta ('preciso me livrar dos empréstimos') chega ao Quita", () => {
  const pista = extrairRegex("src/lib/ia/classificador-consulta-livre.ts", "REGEX_PISTA_NECESSIDADE");
  const registro = extrairRegex("src/lib/ia/classificador-consulta-livre.ts", "REGEX_REGISTRO_INICIO");
  const passa = (m) => !registro.test(norm(m)) && pista.test(norm(m));
  for (const m of [
    "Preciso me livrar dos empréstimos",
    "quero sair das dívidas",
    "tô devendo muito",
    "não consigo pagar tudo",
    "me ajuda a organizar",
    "preciso de um conselho",
    "to endividado",
  ]) assert.ok(passa(m), m);
  for (const m of ["gastei 50 no mercado", "paguei 300 do aluguel", "recebi 400 de aluguel", "cadastrar dívida de 500 no banco x", "oi", "bom dia"]) {
    assert.ok(!passa(m), m);
  }
});

test("rota de dívidas: declarar o objetivo também leva ao Orientador", () => {
  const re = extrairRegex("src/lib/ia/rota-dividas-resolver.ts", "REGEX_ROTA_DIVIDAS_OBJETIVO");
  for (const m of [
    "Preciso me livrar dos empréstimos",
    "quero acabar com as dívidas",
    "preciso sair das dívidas",
    "quero quitar meus empréstimos",
    "tô devendo muito",
    "não consigo pagar minhas dívidas",
  ]) assert.ok(re.test(m), m);
  for (const m of ["gastei 50 no mercado", "quero criar uma meta de 500", "paguei o empréstimo do Carlos", "quero comprar um celular"]) {
    assert.ok(!re.test(m), m);
  }
});

test("Quita aconselha: prompt trata pedido de ajuda como consulta e termina com um próximo passo", () => {
  const prompt = ler("src/lib/agentes/quita/loop.ts");
  assert.match(prompt, /Pedido de ajuda ou desabafo sobre dívida/);
  assert.match(prompt, /UM próximo passo concreto/);
});

test("rota do chat nativo aplica a adaptação de canal na resposta", () => {
  assert.match(ler("src/app/api/minha-conta/chat/mensagem/route.ts"), /adaptarRespostaParaChat\(/);
});
