import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

Module._extensions[".ts"] = function carregarTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

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

const { extrairFatos, validarResposta } = loadTsModule("src/lib/agentes/quita/guarda-numerica.ts");
const { conversarComFerramentas, MAX_FERRAMENTAS_POR_MENSAGEM } = loadTsModule("src/lib/agentes/quita/loop.ts");
const { disjuntorAberto } = loadTsModule("src/lib/agentes/politica.ts");

// ── guarda numérica ─────────────────────────────────────────────────────

test("extrai dinheiro, percentual, data e dias do texto", () => {
  const f = extrairFatos("Gastou R$ 1.234,56 (82%) e a fatura fecha em 12/10, faltam 8 dias; vence dia 20.");
  assert.deepEqual(f.dinheiro, [1234.56]);
  assert.deepEqual(f.percentuais, [82]);
  assert.deepEqual(f.datas, ["12/10"]);
  assert.deepEqual(f.dias.sort((a, b) => a - b), [8, 20]);
});

test("resposta que só repete números das ferramentas passa", () => {
  const ferramenta = "Alimentação: gastou R$ 738,00 de R$ 900,00 (82%). Fatura fecha em 12/10.";
  const r = validarResposta("Em Alimentação você já gastou R$ 738,00 de R$ 900,00, ou seja 82%. A fatura fecha em 12/10.", [ferramenta]);
  assert.equal(r.ok, true, r.violacoes.join(","));
});

test("número calculado pelo modelo (soma, diferença, por dia) é barrado", () => {
  const ferramenta = "Alimentação: gastou R$ 738,00 de R$ 900,00 (82%).";
  const r = validarResposta("Restam R$ 162,00, dá uns R$ 13,50 por dia nos próximos 12 dias, 18% livre.", [ferramenta]);
  assert.equal(r.ok, false);
  assert.ok(r.violacoes.length >= 3, r.violacoes.join(","));
});

test("data e quantidade de dias inventadas são barradas; 0 e 1 são triviais", () => {
  const ferramenta = "A fatura do Nubank fecha em 15/10.";
  assert.equal(validarResposta("Fecha em 15/10, falta 1 dia.", [ferramenta]).ok, true);
  assert.equal(validarResposta("Fecha em 20/10.", [ferramenta]).ok, false);
  assert.equal(validarResposta("Faltam 9 dias.", [ferramenta]).ok, false);
});

test("o valor que o próprio cliente citou pode ser repetido", () => {
  const r = validarResposta("Uma TV de R$ 800,00 deixaria pouca margem.", ["Sobra do mês: R$ 150,00", "posso gastar 800 numa tv?"].map((s) => s.replace("800 numa", "R$ 800 numa")));
  assert.equal(r.ok, true, r.violacoes.join(","));
});

test("tolerância de arredondamento: 81,7% no fato aceita 82% no texto", () => {
  assert.equal(validarResposta("Uso de 82%.", ["Uso: 81,7%"]).ok, true);
  assert.equal(validarResposta("Uso de 90%.", ["Uso: 81,7%"]).ok, false);
});

// ── loop do agente ──────────────────────────────────────────────────────

const ferramentasPermitidas = ["resumo_do_mes", "posso_gastar", "orcamento_por_categoria", "limite_seguro", "metas"];

function llmRoteirizado(passos) {
  let i = 0;
  const chamadas = [];
  return {
    chamadas,
    chat: async (mensagens) => {
      chamadas.push(mensagens.length);
      return passos[Math.min(i++, passos.length - 1)];
    },
  };
}
const tc = (id, nome, args = {}) => ({ id, type: "function", function: { name: nome, arguments: JSON.stringify(args) } });

test("loop: escolhe ferramenta, usa a saída e responde com os números dela", async () => {
  const llm = llmRoteirizado([
    { conteudo: "", toolCalls: [tc("1", "orcamento_por_categoria")] },
    { conteudo: "Em Alimentação você está em 82% (R$ 738,00 de R$ 900,00)." },
  ]);
  const exec = [];
  const r = await conversarComFerramentas(
    { chat: llm.chat, ferramentasPermitidas, executarFerramenta: async (n) => (exec.push(n), "Alimentação: gastou R$ 738,00 de R$ 900,00 (82%)") },
    { mensagem: "como está meu orçamento de comida?" }
  );
  assert.deepEqual(exec, ["orcamento_por_categoria"]);
  assert.equal(r.resposta, "Em Alimentação você está em 82% (R$ 738,00 de R$ 900,00).");
  assert.equal(r.validouNumeros, true);
  assert.equal(r.usouFallbackDeterministico, false);
});

test("loop: resposta com número inventado cai no texto determinístico das ferramentas", async () => {
  const llm = llmRoteirizado([
    { conteudo: "", toolCalls: [tc("1", "orcamento_por_categoria")] },
    { conteudo: "Você ainda pode gastar R$ 162,00, uns R$ 13,50 por dia." },
  ]);
  const saida = "Alimentação: gastou R$ 738,00 de R$ 900,00 (82%)";
  const r = await conversarComFerramentas(
    { chat: llm.chat, ferramentasPermitidas, executarFerramenta: async () => saida },
    { mensagem: "quanto sobra de comida?" }
  );
  assert.equal(r.usouFallbackDeterministico, true);
  assert.equal(r.validouNumeros, false);
  assert.equal(r.resposta, saida);
  assert.ok(r.violacoes.length > 0);
});

test("loop: no máximo 4 ferramentas distintas por mensagem; repetida vem do cache", async () => {
  const chamadasReais = [];
  const llm = llmRoteirizado([
    { conteudo: "", toolCalls: [tc("1", "resumo_do_mes"), tc("2", "resumo_do_mes"), tc("3", "limite_seguro"), tc("4", "metas"), tc("5", "orcamento_por_categoria"), tc("6", "posso_gastar", { valor: 800 })] },
    { conteudo: "ok" },
  ]);
  const r = await conversarComFerramentas(
    { chat: llm.chat, ferramentasPermitidas, executarFerramenta: async (n) => (chamadasReais.push(n), `saida ${n}`) },
    { mensagem: "me dá um panorama geral?" }
  );
  assert.equal(MAX_FERRAMENTAS_POR_MENSAGEM, 4);
  assert.equal(chamadasReais.length, 4, chamadasReais.join(","));
  assert.equal(new Set(chamadasReais).size, 4);
  assert.equal(r.ferramentasUsadas.length, 4);
});

test("loop: ferramenta fora da allowlist (ex.: escrita) é recusada e nunca executa", async () => {
  const executadas = [];
  const llm = llmRoteirizado([
    { conteudo: "", toolCalls: [tc("1", "registrar_despesa", { valor: 50 })] },
    { conteudo: "Não consigo registrar por aqui; mande 'gastei 50 no mercado'." },
  ]);
  const r = await conversarComFerramentas(
    { chat: llm.chat, ferramentasPermitidas, executarFerramenta: async (n) => (executadas.push(n), "x") },
    { mensagem: "registra um gasto de 50" }
  );
  assert.deepEqual(executadas, []);
  assert.equal(r.resposta, null); // sem ferramenta válida usada: devolve o controle ao fluxo antigo
});

test("loop: sem ferramenta (saudação / NAO_E_CONSULTA) devolve null pro fluxo antigo", async () => {
  const llm1 = llmRoteirizado([{ conteudo: "NAO_E_CONSULTA" }]);
  const r1 = await conversarComFerramentas({ chat: llm1.chat, ferramentasPermitidas, executarFerramenta: async () => "x" }, { mensagem: "bom dia, tudo bem?" });
  assert.equal(r1.resposta, null);
  const llm2 = llmRoteirizado([{ conteudo: "Tudo ótimo!" }]);
  const r2 = await conversarComFerramentas({ chat: llm2.chat, ferramentasPermitidas, executarFerramenta: async () => "x" }, { mensagem: "e você?" });
  assert.equal(r2.resposta, null);
});

test("loop: histórico entra só como contexto (no máximo 4 mensagens) e o prompt proíbe cálculo", async () => {
  let capturado = null;
  const r = await conversarComFerramentas(
    {
      chat: async (mensagens) => {
        capturado = mensagens;
        return { conteudo: "NAO_E_CONSULTA" };
      },
      ferramentasPermitidas,
      executarFerramenta: async () => "x",
    },
    {
      mensagem: "e aquele cartão?",
      historico: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` })),
    }
  );
  assert.equal(r.resposta, null);
  assert.equal(capturado.length, 1 + 4 + 1); // sistema + 4 do histórico + pergunta
  assert.match(capturado[0].content, /NUNCA calcula/);
  assert.match(capturado[0].content, /posso_gastar/);
});

test("loop: erro numa ferramenta não derruba o agente", async () => {
  const llm = llmRoteirizado([
    { conteudo: "", toolCalls: [tc("1", "metas")] },
    { conteudo: "Não consegui consultar suas metas agora." },
  ]);
  const r = await conversarComFerramentas(
    { chat: llm.chat, ferramentasPermitidas, executarFerramenta: async () => { throw new Error("db fora"); } },
    { mensagem: "como estão minhas metas?" }
  );
  assert.equal(r.ferramentasUsadas.length, 1);
  assert.ok(r.resposta);
});

// ── disjuntor global ────────────────────────────────────────────────────

test("disjuntor: só abre com volume mínimo e taxa alta de errado/silenciado", () => {
  assert.equal(disjuntorAberto({ enviados: 5, errados: 5, silenciados: 0 }), false); // amostra pequena
  assert.equal(disjuntorAberto({ enviados: 20, errados: 1, silenciados: 1 }), false);
  assert.equal(disjuntorAberto({ enviados: 20, errados: 4, silenciados: 3 }), true); // 35%
  assert.equal(disjuntorAberto({ enviados: 10, errados: 3, silenciados: 0 }), false); // exatamente 30% não abre
});
