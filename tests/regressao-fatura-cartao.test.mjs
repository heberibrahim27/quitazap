import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

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

const { mesFaturaDaCompra, deslocarMes } = loadTsModule("src/lib/financeiro/fatura-cartao.ts");

// Meio-dia UTC evita qualquer ambiguidade de fuso na extração do dia em
// Brasília (mesmo padrão usado no resto do app pra datas de lançamento).
function dataBR(ano, mes, dia) {
  return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
}

test("deslocarMes soma/subtrai meses cruzando o limite do ano", () => {
  assert.deepEqual(deslocarMes(2026, 12, 1), { ano: 2027, mes: 1 });
  assert.deepEqual(deslocarMes(2026, 1, -1), { ano: 2025, mes: 12 });
  assert.deepEqual(deslocarMes(2026, 9, 0), { ano: 2026, mes: 9 });
});

// Achado real do Ibrahim (14/09/2026): cartão com fechamento dia 25 e
// vencimento dia 01 — uma compra em 01/09/2026 (antes do fechamento do
// mês) tem que cair na fatura de OUTUBRO (fecha 25/09, vence 01/10), não
// na de setembro.
test("compra antes do fechamento do mês cai na fatura que vence no mês seguinte", () => {
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 1), 25, 1);
  assert.deepEqual(fatura, { ano: 2026, mes: 10 });
});

test("compra depois do fechamento do mês cai na fatura que vence em dois meses", () => {
  // 26/09 já passou do fechamento (25) — pertence ao ciclo que fecha
  // 25/10, e como vencimento (1) < fechamento (25), essa fatura vence em
  // novembro.
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 26), 25, 1);
  assert.deepEqual(fatura, { ano: 2026, mes: 11 });
});

test("compra exatamente no dia do fechamento ainda entra no ciclo que fecha esse mês", () => {
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 25), 25, 1);
  assert.deepEqual(fatura, { ano: 2026, mes: 10 });
});

test("cartão sem vencimento cadastrado rotula a fatura pelo mês de fechamento", () => {
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 1), 25, null);
  assert.deepEqual(fatura, { ano: 2026, mes: 9 });
});

test("vencimento no mesmo mês do fechamento não desloca a fatura pro mês seguinte", () => {
  // fechamento dia 5, vencimento dia 12 — ambos no mesmo mês do ciclo.
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 1), 5, 12);
  assert.deepEqual(fatura, { ano: 2026, mes: 9 });
});

test("cartão sem fechamento cadastrado mantém o mês calendário puro (comportamento antigo)", () => {
  const fatura = mesFaturaDaCompra(dataBR(2026, 9, 1), null, null);
  assert.deepEqual(fatura, { ano: 2026, mes: 9 });
});

test("ciclo de dezembro/janeiro cruza o ano corretamente", () => {
  const fatura = mesFaturaDaCompra(dataBR(2026, 12, 26), 25, 1);
  assert.deepEqual(fatura, { ano: 2027, mes: 2 });
});

// ── Consulta por texto e resumo de faturas (achados em QA, 04/10/2026) ──
const { detectarConsultaFatura, resumirFaturasDoCartao, formatarRespostaFaturas } = loadTsModule("src/lib/financeiro/fatura-cartao.ts");

test("perguntas sobre fatura/cartão são consulta; registro e comandos não são", () => {
  for (const frase of [
    "como está minha fatura do nubank",
    "minha fatura",
    "minhas faturas",
    "quanto está minha fatura?",
    "qual o valor da fatura",
    "fatura do nubank",
    "quanto gastei no cartão este mês",
    "quanto eu gastei no cartão?",
  ]) {
    assert.equal(detectarConsultaFatura(frase), true, frase);
  }

  for (const frase of [
    "fatura nubank fechou em 70",
    "paguei fatura nubank 70",
    "gastei 50 no cartão nubank",
    "mercado 100 no nubank",
    "uber 30",
    "o cartão nubank fecha dia 2 e vence dia 9",
    "quero criar uma meta de 5000 pra viagem",
    "como está meu saldo",
  ]) {
    assert.equal(detectarConsultaFatura(frase), false, frase);
  }
});

// Mesmo cenário conferido ao vivo no chat: hoje 03/10/2026.
const HOJE = dataBR(2026, 10, 3);
const compra = (valor, ano, mes, dia) => ({ valor, data: dataBR(ano, mes, dia) });

test("cartão que fecha dia 2 (já passou): compra de hoje vai pra fatura aberta de novembro, outubro fica como anterior", () => {
  const r = resumirFaturasDoCartao(
    { nome: "Cartao A", diaFechamento: 2, diaVencimento: 9 },
    [compra(200, 2026, 9, 15), compra(100, 2026, 10, 1), compra(50, 2026, 10, 2), compra(70, 2026, 10, 3), compra(30, 2026, 10, 15)],
    HOJE
  );
  assert.equal(r.atual.rotulo, "Nov/2026");
  assert.equal(r.atual.valor, 100);
  assert.equal(r.atual.fechaEm, "02/11");
  assert.equal(r.anterior.rotulo, "Out/2026");
  assert.equal(r.anterior.valor, 350);
  assert.equal(r.anterior.vencimento, "09/10");
  assert.equal(r.gastoMesCalendario, 250); // Dashboard conta pelo mês da compra: 100+50+70+30
});

test("cartão que fecha dia 25 e vence dia 1: fatura aberta é novembro e fecha em 25/10", () => {
  const r = resumirFaturasDoCartao(
    { nome: "Cartao B", diaFechamento: 25, diaVencimento: 1 },
    [compra(60, 2026, 9, 25), compra(80, 2026, 9, 26), compra(40, 2026, 10, 1)],
    HOJE
  );
  assert.equal(r.atual.rotulo, "Nov/2026");
  assert.equal(r.atual.valor, 120);
  assert.equal(r.atual.fechaEm, "25/10");
  assert.equal(r.anterior.rotulo, "Out/2026");
  assert.equal(r.anterior.valor, 60);
  assert.equal(r.anterior.vencimento, "01/10");
});

test("mudar o fechamento de dia 2 (passou) para dia 5 (não chegou) devolve a compra de hoje pra fatura de outubro", () => {
  const compras = [compra(100, 2026, 10, 3)];
  const fechouAntes = resumirFaturasDoCartao({ nome: "Nubank", diaFechamento: 2, diaVencimento: 9 }, compras, HOJE);
  assert.equal(fechouAntes.atual.rotulo, "Nov/2026");
  assert.equal(fechouAntes.anterior.valor, 0);

  const aindaAberta = resumirFaturasDoCartao({ nome: "Nubank", diaFechamento: 5, diaVencimento: 12 }, compras, HOJE);
  assert.equal(aindaAberta.atual.rotulo, "Out/2026");
  assert.equal(aindaAberta.atual.valor, 100);
  assert.equal(aindaAberta.atual.fechaEm, "05/10");
});

test("cartão sem fechamento soma pelo mês calendário e avisa; sem cartão orienta a cadastrar", () => {
  const r = resumirFaturasDoCartao({ nome: "Cartao C", diaFechamento: null, diaVencimento: null }, [compra(35, 2026, 9, 20), compra(25, 2026, 10, 2)], HOJE);
  assert.equal(r.semFechamento, true);
  assert.equal(r.atual.valor, 25);

  const texto = formatarRespostaFaturas([r], "outubro");
  assert.match(texto, /ainda não tem dia de fechamento/);
  assert.match(texto, /Gasto no cartão em outubro/);

  assert.match(formatarRespostaFaturas([], "outubro"), /ainda não tem cartão cadastrado/);
});
