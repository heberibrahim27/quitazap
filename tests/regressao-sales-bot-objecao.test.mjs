import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Mesmo padrão de tests/regressao-gasto-duplicado.test.mjs: transpila
// sales-bot-objecao.ts sob demanda. Esse arquivo é lógica pura (sem
// Prisma/WhatsApp) de propósito, exatamente pra dar pra testar em massa
// combinações de objeção em sequência sem precisar de banco nem mock de
// rede — pedido do Ibrahim: "testar extensivamente com várias combinações
// de objeções em sequência... garantir que não trava nem repete script".

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

const { decidirRespostaPosOferta, REBATIDAS, PRECO_MENSAL } = loadTsModule("src/lib/sales-bot-objecao.ts");

function estadoInicial() {
  return { tentativasObjecao: 0, angulosUsados: "" };
}

test("objeção de preço → desconfiança → adiar: nunca repete ângulo, varia o argumento a cada rodada", () => {
  let estado = estadoInicial();

  const r1 = decidirRespostaPosOferta(estado, "nossa, achei caro");
  assert.equal(r1.acao, "rebater");
  assert.equal(r1.angulo, "PRECO");
  estado = r1.novoEstado;
  assert.equal(estado.tentativasObjecao, 1);

  const r2 = decidirRespostaPosOferta(estado, "sei lá, não confio muito nisso não");
  assert.equal(r2.acao, "rebater");
  assert.equal(r2.angulo, "CONFIANCA");
  estado = r2.novoEstado;
  assert.equal(estado.tentativasObjecao, 2);

  const r3 = decidirRespostaPosOferta(estado, "acho que vou pensar com calma");
  assert.equal(r3.acao, "rebater");
  assert.equal(r3.angulo, "ADIAR");
  estado = r3.novoEstado;
  assert.equal(estado.tentativasObjecao, 3);

  // 4ª rodada de objeção (qualquer tipo) — já tentamos 3x, desiste sem
  // ficar repetindo os mesmos 4 ângulos em loop.
  const r4 = decidirRespostaPosOferta(estado, "não, muito caro mesmo");
  assert.equal(r4.acao, "desistir");

  // As 3 rebatidas usadas devem ter texto diferente entre si (nunca repete
  // o mesmo argumento).
  const textos = new Set([REBATIDAS.PRECO, REBATIDAS.CONFIANCA, REBATIDAS.ADIAR]);
  assert.equal(textos.size, 3);
});

test("mesma objeção repetida (só 'não') pula pro próximo ângulo em ordem fixa, nunca trava", () => {
  let estado = estadoInicial();
  const angulosVistos = [];

  for (let i = 0; i < 3; i++) {
    const r = decidirRespostaPosOferta(estado, "não");
    assert.equal(r.acao, "rebater", `rodada ${i + 1} deveria rebater, veio ${r.acao}`);
    angulosVistos.push(r.angulo);
    estado = r.novoEstado;
  }

  // 3 ângulos usados, todos diferentes (ordem fixa PRECO→CONFIANCA→CONCORRENTE→ADIAR).
  assert.deepEqual(angulosVistos, ["PRECO", "CONFIANCA", "CONCORRENTE"]);

  const r4 = decidirRespostaPosOferta(estado, "não");
  assert.equal(r4.acao, "desistir");
});

test("pedido explícito pra parar interrompe na hora, mesmo em qualquer rodada", () => {
  const semObjecao = decidirRespostaPosOferta(estadoInicial(), "pare de mandar mensagem por favor");
  assert.equal(semObjecao.acao, "parar");

  let estado = decidirRespostaPosOferta(estadoInicial(), "caro demais").novoEstado;
  const comObjecaoEmAndamento = decidirRespostaPosOferta(estado, "não quero mais falar, descadastra meu número");
  assert.equal(comObjecaoEmAndamento.acao, "parar");
});

test("pergunta de preço não consome rodada de objeção (pode perguntar várias vezes)", () => {
  let estado = { tentativasObjecao: 1, angulosUsados: "PRECO" };
  for (const pergunta of ["quanto custa mesmo?", "qual o valor?", "quanto que fica por mês"]) {
    const r = decidirRespostaPosOferta(estado, pergunta);
    assert.equal(r.acao, "responder_preco");
  }
  // Estado não é alterado por pergunta de preço (função pura não muda o
  // objeto de entrada, e a decisão não carrega novoEstado nesse caso).
  assert.equal(estado.tentativasObjecao, 1);
});

test("interesse claro sem objeção junto manda link direto, sem insistir à toa", () => {
  const r = decidirRespostaPosOferta(estadoInicial(), "show, quero sim!");
  assert.equal(r.acao, "enviar_link");
});

test("combinação variada de frases reais de objeção não trava e sempre termina em <= 3 rodadas", () => {
  const sequenciasReais = [
    ["tá caro pra mim", "não sei se confio", "vou pensar melhor", "ainda acho caro"],
    ["já uso o mobills", "e se for golpe?", "depois eu vejo", "não quero mais"],
    ["não tenho dinheiro agora", "prefiro esperar", "já tenho um app assim", "não"],
  ];

  for (const sequencia of sequenciasReais) {
    let estado = estadoInicial();
    let rodadasDeRebate = 0;
    let terminou = false;

    for (const mensagem of sequencia) {
      const decisao = decidirRespostaPosOferta(estado, mensagem);
      assert.ok(
        ["rebater", "desistir", "parar", "enviar_link", "responder_preco"].includes(decisao.acao),
        `ação inesperada: ${decisao.acao}`
      );

      if (decisao.acao === "rebater") {
        rodadasDeRebate++;
        estado = decisao.novoEstado;
      } else {
        terminou = true;
        break;
      }
    }

    assert.ok(rodadasDeRebate <= 3, `sequência ${sequencia.join(" | ")} rebateu mais de 3x`);
    // Toda sequência de puras objeções/negativas deve encerrar (desistir)
    // dentro do próprio teste de 4 mensagens, nunca ficar girando pra sempre.
    if (sequencia.length >= 4) assert.ok(terminou, `sequência ${sequencia.join(" | ")} nunca terminou`);
  }
});

test("nenhuma rebatida usa urgência falsa nem promete resultado garantido", () => {
  const proibidas = /somente hoje|so hoje|ultima vaga|ultimas vagas|contagem regressiva|garantid[oa]|vai quitar|resultado garantido/i;
  for (const [angulo, texto] of Object.entries(REBATIDAS)) {
    assert.ok(!proibidas.test(texto), `rebatida ${angulo} usa linguagem proibida: "${texto}"`);
  }
});

test("preço mencionado nas rebatidas usa a constante real, nunca um valor solto diferente", () => {
  assert.ok(REBATIDAS.PRECO.includes(PRECO_MENSAL));
});
