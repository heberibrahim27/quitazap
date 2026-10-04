// Script do QA do QuitaZAP (ver SKILL.md). Rode da RAIZ do repositório:
//   node .claude/skills/qa-quitazap/qa.mjs <comando> [args]
// Comandos: setup | limpar | chat <msgs...> | whats <msgs...> | page <caminho> [trecho]
//           | sql | cron <sentinela|recorrencias> [querystring] | orc
// Só opera na conta de teste (isTeste) com o telefone abaixo.

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";

for (const l of fs.readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").replace(/\r$/, "");
}
process.env.NEXTAUTH_SECRET = "qa-local-secret";

const BASE = process.env.QA_BASE ?? "http://localhost:3100";
const TEL = process.env.QA_TEL ?? "5571900009999";
const ARQ_SESSAO = ".qa-sessao.txt";
const prisma = new PrismaClient();

function carregarTs(rel) {
  const filename = path.join(process.cwd(), rel);
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

const cliente = () => prisma.cliente.findFirst({ where: { telefone: TEL, isTeste: true } });

async function limpar() {
  const c = await cliente();
  if (c) {
    for (const t of ["logIA", "mensagemChat", "eventoAnalytics", "mensagemPendenteRevisao", "lancamentoAuditoria"]) {
      await prisma[t].deleteMany({ where: { clienteId: c.id } });
    }
    await prisma.cliente.delete({ where: { id: c.id } });
  }
  await prisma.botSessao.deleteMany({ where: { telefone: TEL } });
  // execuções de agente geradas pelo ensaio (não há execução real de agente numa conta de teste)
  await prisma.auditoriaAssistente.deleteMany({ where: { ferramenta: { startsWith: "agente:" } } });
  if (fs.existsSync(ARQ_SESSAO)) fs.unlinkSync(ARQ_SESSAO);
}

async function setup() {
  await limpar();
  const { criarSessaoCliente } = carregarTs("src/lib/cliente-auth.ts");
  const c = await prisma.cliente.create({
    data: { nome: "QA Skill", telefone: TEL, isTeste: true, gratuito: false, aceitaProativas: true, rendaMensal: 5000, assinaturaVenceEm: new Date(Date.now() + 30 * 86400000) },
  });
  fs.writeFileSync(ARQ_SESSAO, criarSessaoCliente(c.id));
  console.log("conta de teste criada:", c.id);
}

const sessao = () => fs.readFileSync(ARQ_SESSAO, "utf8").trim();

async function chat(msgs) {
  for (const mensagem of msgs) {
    const res = await fetch(`${BASE}/api/minha-conta/chat/mensagem`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `qz_cliente_auth=${sessao()}` },
      body: JSON.stringify({ mensagem }),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`>>> ${mensagem}\n<<< (${res.status}) ${String(data.resposta ?? data.error ?? "").replace(/\n+/g, " ⏎ ").slice(0, 700)}`);
  }
}

async function whats(msgs) {
  for (const msg of msgs) {
    const res = await fetch(`${BASE}/api/webhook/zapi?secret=qa-wh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ReceivedCallback", phone: TEL, messageId: `qa-${Date.now()}-${Math.random()}`, text: { message: msg }, fromMe: false }),
    });
    console.log(`[WHATSAPP] >>> ${msg} (webhook ${res.status})`);
    await new Promise((r) => setTimeout(r, 3500));
  }
}

function texto(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function pagina(caminho, trecho = "") {
  const r = await fetch(BASE + caminho, { headers: { cookie: `qz_cliente_auth=${sessao()}` }, redirect: "manual" });
  const t = texto(await r.text());
  const i = trecho ? t.indexOf(trecho) : 0;
  console.log(`=== ${caminho} (${r.status})\n${t.slice(i >= 0 ? i : 0, (i >= 0 ? i : 0) + 900)}`);
}

async function sql() {
  const c = await cliente();
  const ls = await prisma.lancamento.findMany({ where: { clienteId: c.id }, include: { cartao: { select: { nome: true } } }, orderBy: { criadoEm: "asc" } });
  for (const l of ls) {
    console.log(`${l.data.toISOString().slice(0, 10)} | ${l.tipo.padEnd(16)} | ${l.descricao.padEnd(24)} | ${String(l.valor).padStart(8)} | ${l.categoria ?? "-"} | ${l.cartao?.nome ?? "-"} | ${l.origem} | rec=${l.recorrente}`);
  }
  for (const t of await prisma.tarefa.findMany({ where: { clienteId: c.id } })) console.log("TAREFA:", t.tipo, t.descricao, t.valor, t.vencimento?.toISOString().slice(0, 10), t.status);
  for (const k of await prisma.cartao.findMany({ where: { clienteId: c.id } })) console.log("CARTAO:", k.nome, "fecha", k.diaFechamento, "vence", k.diaVencimento);
  const alertas = await prisma.mensagemChat.findMany({ where: { clienteId: c.id, direcao: "BOT", dadosEstruturados: { path: ["tipo"], equals: "alerta_proativo" } }, orderBy: { criadoEm: "asc" } });
  for (const a of alertas) console.log("ALERTA:", a.dadosEstruturados.alerta.dedupeKey, a.criadoEm.toISOString());
}

async function cron(rota, qs = "") {
  const c = await cliente();
  // SEMPRE restrito à conta de teste: nunca rode cron sem clienteId a partir da máquina local.
  const res = await fetch(`${BASE}/api/cron/${rota}?clienteId=${c.id}${qs ? `&${qs}` : ""}`, { headers: { "x-internal-call": "1" } });
  console.log(rota, res.status, JSON.stringify(await res.json()).slice(0, 1800));
}

async function orc() {
  const c = await cliente();
  await prisma.orcamentoCategoria.create({ data: { clienteId: c.id, categoria: "Mercado", limiteMensal: 500 } });
  console.log("orçamento Mercado R$ 500 criado");
}

const [, , cmd, ...args] = process.argv;
if (cmd === "setup") await setup();
else if (cmd === "limpar") { await limpar(); console.log("conta de teste removida"); }
else if (cmd === "chat") await chat(args);
else if (cmd === "whats") await whats(args);
else if (cmd === "page") await pagina(args[0], args[1]);
else if (cmd === "sql") await sql();
else if (cmd === "cron") await cron(args[0], args[1]);
else if (cmd === "orc") await orc();
else console.log("comandos: setup | limpar | chat | whats | page | sql | cron | orc");
await prisma.$disconnect();
