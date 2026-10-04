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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

process.env.NEXTAUTH_SECRET = "segredo-de-teste-primeiro-acesso";

const {
  gerarTokenPrimeiroAcesso,
  verificarTokenPrimeiroAcesso,
  clienteIdDoTokenPrimeiroAcesso,
  validarNovaSenha,
  pareceEsqueciSenha,
  VALIDADE_PRIMEIRO_ACESSO_MS,
} = loadTsModule("src/lib/primeiro-acesso.ts");
const { criarSessaoCliente, verificarSessaoCliente } = loadTsModule("src/lib/cliente-auth.ts");
const { mensagemBoasVindasControle } = loadTsModule("src/lib/onboarding-controle.ts");

const AGORA = 1_800_000_000_000;

test("link de primeiro acesso de cliente sem senha é válido e identifica o cliente", () => {
  const token = gerarTokenPrimeiroAcesso("cli_1", null, AGORA);
  assert.equal(clienteIdDoTokenPrimeiroAcesso(token), "cli_1");
  assert.equal(verificarTokenPrimeiroAcesso(token, "cli_1", null, AGORA + 1000), "ok");
});

test("token adulterado ou de outro cliente é inválido", () => {
  const token = gerarTokenPrimeiroAcesso("cli_1", null, AGORA);
  assert.equal(verificarTokenPrimeiroAcesso(token, "cli_2", null, AGORA), "invalido");

  const partes = Buffer.from(token, "base64url").toString("utf-8").split(":");
  partes[1] = "cli_2";
  const forjado = Buffer.from(partes.join(":")).toString("base64url");
  assert.equal(verificarTokenPrimeiroAcesso(forjado, "cli_2", null, AGORA), "invalido");

  assert.equal(verificarTokenPrimeiroAcesso("lixo", "cli_1", null, AGORA), "invalido");
  assert.equal(verificarTokenPrimeiroAcesso("", "cli_1", null, AGORA), "invalido");
  assert.equal(clienteIdDoTokenPrimeiroAcesso("lixo"), null);
});

test("link expira depois de 7 dias", () => {
  const token = gerarTokenPrimeiroAcesso("cli_1", null, AGORA);
  assert.equal(verificarTokenPrimeiroAcesso(token, "cli_1", null, AGORA + VALIDADE_PRIMEIRO_ACESSO_MS - 1), "ok");
  assert.equal(verificarTokenPrimeiroAcesso(token, "cli_1", null, AGORA + VALIDADE_PRIMEIRO_ACESSO_MS + 1), "expirado");
});

test("link morre depois que a senha é criada (uso único na prática)", () => {
  const token = gerarTokenPrimeiroAcesso("cli_1", null, AGORA);
  assert.equal(verificarTokenPrimeiroAcesso(token, "cli_1", "$2b$12$hashNovoDaSenha", AGORA), "ja-usado");
});

test("link de redefinição (cliente com senha) vale só enquanto a senha atual não mudou", () => {
  const hashAntigo = "$2b$12$hashAntigo";
  const token = gerarTokenPrimeiroAcesso("cli_1", hashAntigo, AGORA);
  assert.equal(verificarTokenPrimeiroAcesso(token, "cli_1", hashAntigo, AGORA), "ok");
  assert.equal(verificarTokenPrimeiroAcesso(token, "cli_1", "$2b$12$hashNovo", AGORA), "ja-usado");
});

test("token de sessão nunca vale como link de acesso, e o contrário também", () => {
  const sessao = criarSessaoCliente("cli_1");
  assert.equal(verificarTokenPrimeiroAcesso(sessao, "cli_1", null), "invalido");
  assert.equal(clienteIdDoTokenPrimeiroAcesso(sessao), null);

  const link = gerarTokenPrimeiroAcesso("cli_1", null);
  assert.equal(verificarSessaoCliente(link), null);
});

test("sem segredo configurado, gerar link falha em vez de usar segredo previsível", () => {
  const guardado = { n: process.env.NEXTAUTH_SECRET, c: process.env.CRON_SECRET };
  delete process.env.NEXTAUTH_SECRET;
  delete process.env.CRON_SECRET;
  try {
    assert.throws(() => gerarTokenPrimeiroAcesso("cli_1", null, AGORA));
  } finally {
    process.env.NEXTAUTH_SECRET = guardado.n;
    if (guardado.c !== undefined) process.env.CRON_SECRET = guardado.c;
  }
});

test("regra de senha: mínimo 8, máximo 72 bytes", () => {
  assert.notEqual(validarNovaSenha("1234567"), null);
  assert.equal(validarNovaSenha("12345678"), null);
  assert.equal(validarNovaSenha("a".repeat(72)), null);
  assert.notEqual(validarNovaSenha("a".repeat(73)), null);
  assert.notEqual(validarNovaSenha("é".repeat(40)), null); // 80 bytes
});

test("boas-vindas inclui o link de acesso só quando existe, e continua com os exemplos", () => {
  const sem = mensagemBoasVindasControle("João", "Plano Mensal");
  assert.doesNotMatch(sem, /crie sua senha/i);

  const com = mensagemBoasVindasControle("João", "Plano Mensal", "https://www.quitazap.com.br/minha-conta/primeiro-acesso?t=abc");
  assert.match(com, /crie sua senha por este link \(vale por 7 dias\)/);
  assert.match(com, /primeiro-acesso\?t=abc/);
  assert.match(com, /Pode me mandar qualquer coisa/);
  assert.match(com, /gastei 45 no mercado/);
});

test("pedido de link de acesso pelo WhatsApp: reconhece frases claras e ignora gasto comum", () => {
  for (const frase of [
    "esqueci minha senha",
    "Esqueci a senha",
    "esqueci senha",
    "perdi minha senha",
    "redefinir senha",
    "quero recuperar minha senha".replace("quero ", ""),
    "nova senha",
    "meu link de acesso",
    "link do site",
    "acesso ao site",
    "como acesso o site",
  ]) {
    assert.equal(pareceEsqueciSenha(frase), true, frase);
  }

  for (const frase of [
    "gastei 50 no mercado",
    "paguei a senha do wifi 30",
    "uber 25",
    "recebi 3800 de salário",
    "meu painel",
    "resumo do mês",
    "esqueci de lançar o mercado",
  ]) {
    assert.equal(pareceEsqueciSenha(frase), false, frase);
  }
});

// Cobertura estática do webhook de compra (a verificação funcional de
// verdade foi feita ao vivo — ver commit): falha no WhatsApp de boas-vindas
// não pode virar erro 500, senão a Cakto repete o evento, o transacaoId
// único descarta e o cliente que pagou fica sem nada.
test("webhook da Cakto não deixa falha de WhatsApp derrubar a compra de quem pagou", () => {
  const fonte = fs.readFileSync(path.join(root, "src/app/api/webhook/cakto/route.ts"), "utf8");
  const idxEnvio = fonte.indexOf("await sendWhatsApp(telefone, boasVindas)");
  assert.notEqual(idxEnvio, -1);

  const antes = fonte.slice(0, idxEnvio);
  const ultimoTry = antes.lastIndexOf("try {");
  const ultimoCatchFechado = antes.lastIndexOf("} catch");
  assert.ok(ultimoTry > ultimoCatchFechado, "sendWhatsApp de boas-vindas precisa estar dentro de try/catch");

  assert.match(fonte, /urlPrimeiroAcesso\(cliente\.id, null\)/);
  assert.match(fonte, /variacoesTelefone/);
});
