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
//
// Rodada 2 (achados do Ibrahim testando com frase livre, não só botões):
// 1) objeção composta (preço + concorrente na mesma frase) só respondia a
//    primeira e descartava o resto;
// 2) "planilha" não estava no vocabulário de CONCORRENTE, então uma
//    objeção real caía no ângulo genérico errado (CONFIANCA);
// 3) o detector de "pedido pra parar" exigia substring quase exata de um
//    dos botões prontos ("para de mandar") e ignorava variações naturais
//    como "para de ME mandar mensagem".

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

const { decidirRespostaPosOferta, REBATIDAS, PRECO_MENSAL, ehRecusaClara } = loadTsModule("src/lib/sales-bot-objecao.ts");

function estadoInicial() {
  return { tentativasObjecao: 0, angulosUsados: "" };
}

test("objeção de preço → desconfiança → adiar: nunca repete ângulo, varia o argumento a cada rodada", () => {
  let estado = estadoInicial();

  const r1 = decidirRespostaPosOferta(estado, "nossa, achei caro");
  assert.equal(r1.acao, "rebater");
  assert.deepEqual(r1.angulos, ["PRECO"]);
  estado = r1.novoEstado;
  assert.equal(estado.tentativasObjecao, 1);

  const r2 = decidirRespostaPosOferta(estado, "sei lá, não confio muito nisso não");
  assert.equal(r2.acao, "rebater");
  assert.deepEqual(r2.angulos, ["CONFIANCA"]);
  estado = r2.novoEstado;
  assert.equal(estado.tentativasObjecao, 2);

  const r3 = decidirRespostaPosOferta(estado, "acho que vou pensar com calma");
  assert.equal(r3.acao, "rebater");
  assert.deepEqual(r3.angulos, ["ADIAR"]);
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
    angulosVistos.push(...r.angulos);
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

// Achado #3 do Ibrahim — o mais grave: frases naturais de "quer parar" que
// não usam a substring exata dos botões prontos.
test("pedido de parar reconhece variações naturais, não só a frase do botão", () => {
  const frasesQueDevemParar = [
    "para de me mandar mensagem, cansei disso",
    "pfv chega de mensagem",
    "nao quero mais receber mensagem sua",
    "me deixa em paz por favor",
    "nao insiste mais comigo",
    "quero que voce remova meu numero da lista",
    "nao me chama mais aqui",
  ];

  for (const frase of frasesQueDevemParar) {
    const decisao = decidirRespostaPosOferta(estadoInicial(), frase);
    assert.equal(decisao.acao, "parar", `deveria reconhecer "${frase}" como pedido de parar, veio "${decisao.acao}"`);
  }
});

// Não pode ficar tão frouxo a ponto de confundir uma objeção comum de
// preço/decisão com um pedido de parar.
test("pedido de parar não confunde com objeções comuns (não deve disparar à toa)", () => {
  const frasesQueNaoDevemParar = [
    "não quero pagar isso agora",
    "vou parar pra pensar melhor",
    "ainda não decidi",
    "não sei se vale a pena",
  ];

  for (const frase of frasesQueNaoDevemParar) {
    const decisao = decidirRespostaPosOferta(estadoInicial(), frase);
    assert.notEqual(decisao.acao, "parar", `"${frase}" não deveria disparar parar, mas dispararou`);
  }
});

// Achado #2 do Ibrahim — "planilha" é o concorrente mais comum na vida
// real e não estava no vocabulário; a objeção caía no ângulo genérico
// errado (CONFIANCA) em vez de CONCORRENTE.
test("objeção de 'minha planilha resolve' é reconhecida como CONCORRENTE, não CONFIANCA", () => {
  // Simula que PRECO já foi usado numa rodada anterior — é justamente esse
  // cenário que expôs o bug (fallback de ordem fixa caindo em CONFIANCA).
  const estado = { tentativasObjecao: 1, angulosUsados: "PRECO" };
  const decisao = decidirRespostaPosOferta(estado, "nao sei, ainda acho que minha planilha resolve, pra que pagar");
  assert.equal(decisao.acao, "rebater");
  assert.deepEqual(decisao.angulos, ["CONCORRENTE"]);
});

// Achado #1 do Ibrahim — objeção composta (preço + concorrente na mesma
// mensagem) precisa responder as duas, não só a primeira.
test("objeção composta (preço + concorrente na mesma frase) rebate as duas, não descarta nenhuma", () => {
  const decisao = decidirRespostaPosOferta(
    estadoInicial(),
    "caro d+, isso e so um app de anotar gasto, minha planilha ja faz de graca"
  );
  assert.equal(decisao.acao, "rebater");
  assert.deepEqual(decisao.angulos.sort(), ["CONCORRENTE", "PRECO"].sort());
  // As duas rodadas contam como 1 rodada de objeção (1 mensagem do lead),
  // não 2 — senão uma frase só já gastaria metade do orçamento de 3 tentativas.
  assert.equal(decisao.novoEstado.tentativasObjecao, 1);
  assert.equal(decisao.novoEstado.angulosUsados, "PRECO,CONCORRENTE");
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

// Achado do Ibrahim (rodada 3): "Não sei pra onde meu dinheiro vai" —
// resposta real à pergunta de abertura ("o que mais te atrapalha com seu
// dinheiro?") — encerrava o funil na 1ª mensagem, como se fosse recusa.
// Causa: a etapa QUALIFICACAO/PROVA usava detectaNegativo() (que casa com
// QUALQUER "não" na frase) pra decidir se o lead recusou continuar.
// ehRecusaClara() é o detector certo pra esse ponto — bem mais restrito.
test("ehRecusaClara: respostas substantivas que só contêm a palavra 'não' NÃO são recusa", () => {
  const respostasValidas = [
    "Não sei pra onde meu dinheiro vai",
    "Não sei bem, mas acho que gasto demais com besteira",
    "Cartão estoura todo mês",
    "Esqueço de pagar conta e atraso",
    "Tenho dívida acumulada",
    "Não consigo guardar dinheiro nunca",
  ];
  for (const resposta of respostasValidas) {
    assert.equal(ehRecusaClara(resposta), false, `"${resposta}" não deveria ser recusa clara`);
  }
});

test("ehRecusaClara: recusas de verdade continuam sendo reconhecidas", () => {
  const recusas = [
    "não",
    "n",
    "não, obrigado",
    "nada",
    "não tenho problema com dinheiro",
    "não me interessa",
    "não quero continuar",
    "tá tudo certo",
    "sem interesse",
  ];
  for (const recusa of recusas) {
    assert.equal(ehRecusaClara(recusa), true, `"${recusa}" deveria ser reconhecida como recusa clara`);
  }
});

test("fluxo completo: os 4 pontos de dor do botão de abertura avançam pro funil, nenhum encerra à toa", () => {
  const pontosDeDor = [
    "Esqueço de pagar conta e atraso",
    "Cartão estoura todo mês",
    "Não sei pra onde meu dinheiro vai",
    "Tenho dívida acumulada",
  ];
  for (const dor of pontosDeDor) {
    assert.equal(ehRecusaClara(dor), false, `"${dor}" não deveria encerrar o funil na abertura`);
  }
});
