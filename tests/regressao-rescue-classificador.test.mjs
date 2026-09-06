import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// Mesmo padrão de tests/regressao-sales-bot-objecao.test.mjs: transpila sob
// demanda. rescue-classificador.ts é a decisão pura da escada do rescue
// parser (ai-bot.ts) — pedido do Ibrahim (2026-09-06, "pensa em 10 mil
// clientes tendo que olhar manualmente"): o bot nunca pode deixar o
// cliente esperando um humano; só mensagens genuinamente críticas
// (cancelamento/reclamação grave/erro de cobrança/pedido de humano)
// escalam pra fila que exige ação — o resto sempre recebe uma resposta
// definitiva na hora.

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

const {
  classificarCriticidade,
  classificarOpcaoMenu,
  decidirRespostaRescue,
  MENSAGEM_RESCUE_TENTATIVA_1,
  MENSAGEM_RESCUE_FINAL_NAO_CRITICA,
} = loadTsModule("src/lib/rescue-classificador.ts");

// ── classificarCriticidade ─────────────────

test("classificarCriticidade reconhece pedidos de cancelamento em frases naturais", () => {
  const frases = [
    "quero cancelar minha assinatura",
    "como faço pra cancelar isso",
    "nao quero mais pagar o quitazap",
    "quero sair do quitazap",
    "quero encerrar a assinatura",
  ];
  for (const f of frases) {
    assert.equal(classificarCriticidade(f), "CANCELAMENTO", `"${f}" deveria ser CANCELAMENTO`);
  }
});

test("classificarCriticidade reconhece erro de cobrança", () => {
  const frases = [
    "fui cobrado duas vezes esse mes",
    "essa cobranca ta errada",
    "nao reconheco essa cobranca no meu cartao",
    "quero um reembolso",
    "me debitaram sem eu pedir",
  ];
  for (const f of frases) {
    assert.equal(classificarCriticidade(f), "ERRO_COBRANCA", `"${f}" deveria ser ERRO_COBRANCA`);
  }
});

test("classificarCriticidade reconhece reclamação grave", () => {
  const frases = [
    "isso e um golpe",
    "atendimento pessimo, nunca mais uso",
    "vou processar voces",
    "vou reclamar no procon",
  ];
  for (const f of frases) {
    assert.equal(classificarCriticidade(f), "RECLAMACAO_GRAVE", `"${f}" deveria ser RECLAMACAO_GRAVE`);
  }
});

test("classificarCriticidade reconhece pedido explícito de humano", () => {
  const frases = [
    "quero falar com um atendente",
    "tem alguem ai disponivel",
    "preciso de um atendente humano",
  ];
  for (const f of frases) {
    assert.equal(classificarCriticidade(f), "PEDIR_HUMANO", `"${f}" deveria ser PEDIR_HUMANO`);
  }
});

test("classificarCriticidade devolve null pra mensagens comuns não-críticas", () => {
  const frases = [
    "gastei 50 no mercado",
    "recebi meu salario hoje",
    "tanto faz",
    "sei la, me explica de novo",
    "e ai, como funciona esse negocio",
  ];
  for (const f of frases) {
    assert.equal(classificarCriticidade(f), null, `"${f}" não deveria ser crítica`);
  }
});

// ── classificarOpcaoMenu ────────────────────

test("classificarOpcaoMenu reconhece número e palavra-chave pras 4 opções", () => {
  assert.equal(classificarOpcaoMenu("1"), "GASTO");
  assert.equal(classificarOpcaoMenu("gastei no mercado"), "GASTO");
  assert.equal(classificarOpcaoMenu("2"), "RENDA");
  assert.equal(classificarOpcaoMenu("recebi um pix"), "RENDA");
  assert.equal(classificarOpcaoMenu("3"), "DIVIDA");
  assert.equal(classificarOpcaoMenu("é uma divida"), "DIVIDA");
  assert.equal(classificarOpcaoMenu("4"), "OUTRO");
  assert.equal(classificarOpcaoMenu("outro assunto"), "OUTRO");
});

test("classificarOpcaoMenu prioriza OUTRO quando a frase já cita cancelamento/cobrança/reclamação", () => {
  assert.equal(classificarOpcaoMenu("quero cancelar"), "OUTRO");
  assert.equal(classificarOpcaoMenu("é sobre uma cobranca errada"), "OUTRO");
});

// ── decidirRespostaRescue (a escada inteira) ────

test("1ª mensagem sem histórico → tentativa 1 (menu)", () => {
  const decisao = decidirRespostaRescue(null, "isso não faz sentido pra mim");
  assert.equal(decisao.tipo, "tentativa_1");
  assert.equal(decisao.resposta, MENSAGEM_RESCUE_TENTATIVA_1);
});

test("resposta à tentativa 1 (não crítica) → tentativa 2 com exemplo", () => {
  const decisao = decidirRespostaRescue(MENSAGEM_RESCUE_TENTATIVA_1, "1");
  assert.equal(decisao.tipo, "tentativa_2");
  assert.match(decisao.resposta, /gastei R\$45 no mercado/);
});

test("resposta à tentativa 1 escolhendo renda → tentativa 2 com exemplo de renda", () => {
  const decisao = decidirRespostaRescue(MENSAGEM_RESCUE_TENTATIVA_1, "2");
  assert.equal(decisao.tipo, "tentativa_2");
  assert.match(decisao.resposta, /recebi R\$3\.000 de salário/);
});

test("depois da tentativa 2 sem sucesso (não crítica) → resposta final definitiva, nunca 'aguarde alguém'", () => {
  const respostaTentativa2 = decidirRespostaRescue(MENSAGEM_RESCUE_TENTATIVA_1, "sei la").resposta;
  const decisaoFinal = decidirRespostaRescue(respostaTentativa2, "continuo sem entender");
  assert.equal(decisaoFinal.tipo, "final_nao_critica");
  assert.equal(decisaoFinal.resposta, MENSAGEM_RESCUE_FINAL_NAO_CRITICA);
  assert.doesNotMatch(decisaoFinal.resposta, /aguard|pendente|revis[aã]o|equipe vai|algu[eé]m vai/i);
});

test("mensagem crítica resolve na hora, mesmo na 1ª tentativa (sem passar pelo menu)", () => {
  const decisao = decidirRespostaRescue(null, "quero cancelar minha assinatura");
  assert.equal(decisao.tipo, "critica");
  assert.equal(decisao.categoria, "CANCELAMENTO");
  assert.ok(decisao.resposta.length > 0);
});

test("mensagem crítica resolve na hora mesmo já em cima da tentativa 1/2 (não precisa esgotar a escada)", () => {
  const decisaoNaTentativa1 = decidirRespostaRescue(MENSAGEM_RESCUE_TENTATIVA_1, "fui cobrado duas vezes esse mes");
  assert.equal(decisaoNaTentativa1.tipo, "critica");
  assert.equal(decisaoNaTentativa1.categoria, "ERRO_COBRANCA");

  const respostaTentativa2 = decidirRespostaRescue(MENSAGEM_RESCUE_TENTATIVA_1, "4").resposta;
  const decisaoNaTentativa2 = decidirRespostaRescue(respostaTentativa2, "isso e um golpe");
  assert.equal(decisaoNaTentativa2.tipo, "critica");
  assert.equal(decisaoNaTentativa2.categoria, "RECLAMACAO_GRAVE");
});

test("nenhuma resposta da escada (crítica ou não) promete 'alguém vai olhar depois' ao cliente", () => {
  // Trava de regressão do achado do Ibrahim: a fila de revisão manual não
  // pode voltar a virar "fique esperando" — nem nas críticas, que ainda
  // assim recebem uma resposta concreta e acionável na hora.
  const todasAsRespostas = [
    decidirRespostaRescue(null, "oi").resposta,
    decidirRespostaRescue(MENSAGEM_RESCUE_TENTATIVA_1, "1").resposta,
    MENSAGEM_RESCUE_FINAL_NAO_CRITICA,
    decidirRespostaRescue(null, "quero cancelar").resposta,
    decidirRespostaRescue(null, "fui cobrado errado").resposta,
    decidirRespostaRescue(null, "isso e um golpe").resposta,
    decidirRespostaRescue(null, "quero falar com um atendente").resposta,
  ];
  for (const resposta of todasAsRespostas) {
    assert.doesNotMatch(resposta, /vou deixar (essa mensagem )?pendente/i, `resposta não deveria prometer espera: "${resposta}"`);
  }
});
