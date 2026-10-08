// QA da fila de "compra parecida" no WhatsApp (sim = mesma compra, não = outra) e de "sim" fora de contexto.
// Conta isTeste PRÓPRIA (5571900001112); servidor local :3100 e log em _dev.log (envio simulado "[EVO MOCK]").
// node .claude/skills/qa-quitazap/qa-whats-parecidas.mjs
import fs from "node:fs";
import http from "node:http";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";

for (const l of fs.readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").replace(/\r$/, "");
}
process.env.NEXTAUTH_SECRET = "qa-local-secret";
const BASE = "http://localhost:3100";
const TEL = "5571900001112";
const prisma = new PrismaClient();
const resultados = [];
const check = (nome, ok, extra = "") => {
  resultados.push(!!ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${extra ? " — " + extra : ""}`);
};
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

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
async function limpar() {
  const c = await prisma.cliente.findFirst({ where: { telefone: TEL, isTeste: true } });
  if (c) {
    for (const t of ["logIA", "mensagemChat", "eventoAnalytics", "mensagemPendenteRevisao", "lancamentoAuditoria"]) {
      await prisma[t].deleteMany({ where: { clienteId: c.id } });
    }
    await prisma.cliente.delete({ where: { id: c.id } });
  }
  await prisma.botSessao.deleteMany({ where: { telefone: TEL } });
}

const arquivos = new Map();
const servidor = http.createServer((req, res) => {
  const a = arquivos.get(req.url.split("?")[0].slice(1));
  if (!a) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": "application/octet-stream" }).end(a);
});
await new Promise((r) => servidor.listen(3198, r));

const zap = async (payload) => {
  const pos = fs.statSync("_dev.log").size;
  const r = await fetch(`${BASE}/api/webhook/zapi?secret=qa-wh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "ReceivedCallback", phone: TEL, messageId: `qa-${Date.now()}-${Math.random()}`, fromMe: false, ...payload }),
    signal: AbortSignal.timeout(170000),
  });
  await dorme(2500);
  const fd = fs.openSync("_dev.log", "r");
  const buf = Buffer.alloc(fs.statSync("_dev.log").size - pos);
  fs.readSync(fd, buf, 0, buf.length, pos);
  fs.closeSync(fd);
  return { status: r.status, log: buf.toString("utf8") };
};
const texto = (t) => zap({ text: { message: t } });
const doc = (nome) => zap({ document: { documentUrl: `http://localhost:3198/${nome}`, fileName: nome } });

try {
  await limpar();
  const { criarSessaoCliente } = carregarTs("src/lib/cliente-auth.ts");
  const c = await prisma.cliente.create({
    data: { nome: "QA Parecidas", telefone: TEL, isTeste: true, gratuito: false, aceitaProativas: true, rendaMensal: 5000, assinaturaVenceEm: new Date(Date.now() + 30 * 86400000) },
  });
  await fetch(`${BASE}/api/minha-conta/chat/mensagem`, { method: "POST", headers: { "Content-Type": "application/json", cookie: `qz_cliente_auth=${criarSessaoCliente(c.id)}` }, body: JSON.stringify({ mensagem: "oi" }) });
  const estado = async () => ({
    dividas: await prisma.divida.count({ where: { clienteId: c.id, tipo: "CARTAO" } }),
    lancs: await prisma.lancamento.count({ where: { clienteId: c.id } }),
    sessao: await prisma.botSessao.findFirst({ where: { telefone: TEL } }),
  });
  const pendente = (s) => s.sessao?.faturaCartaoPendente && s.sessao.faturaCartaoPendente !== "null" && JSON.stringify(s.sessao.faturaCartaoPendente) !== "null";

  // base: OFX real
  arquivos.set("Nubank_2026-11-01.ofx", fs.readFileSync("tests/fixtures/Nubank_2026-11-01.ofx"));
  await doc("Nubank_2026-11-01.ofx");
  await texto("sim");
  let e = await estado();
  check("base: OFX + 'sim' → 4 dívidas e 21 gastos", e.dividas === 4 && e.lancs === 21, `div=${e.dividas} lanc=${e.lancs}`);

  // ── cenário A: parecida e É OUTRA compra ("não") ──
  console.log("\n=== A  compra parecida → 'não' (é outra compra)");
  arquivos.set("Nubank_2026-12-01.csv", Buffer.from('date,title,amount\n2026-10-06,Atacadao Atakarejo Ltda - Parcela 1/3,"30,90"\n2026-10-07,Mercado Novo Dois,"25,00"\n', "utf8"));
  let r = await doc("Nubank_2026-12-01.csv");
  e = await estado();
  check("A.1 pergunta se é a mesma compra (parecida), sem gravar nada", /parecid/i.test(r.log) && pendente(e) && e.dividas === 4, r.log.match(/compra parecida[^\n]{0,60}/i)?.[0] ?? r.log.slice(-200).replace(/\n/g, " "));
  r = await texto("não");
  e = await estado();
  check("A.2 'não' avança pro resumo do lote, ainda sem gravar", pendente(e) && e.dividas === 4 && /Quer que eu lance|Fatura Nubank/i.test(r.log), r.log.slice(-160).replace(/\n/g, " "));
  r = await texto("sim");
  e = await estado();
  check("A.3 'sim' no lote grava a compra 'diferente' (5 dívidas) sem duplicar o gasto já lançado", e.dividas === 5 && e.lancs === 22 && !pendente(e), `div=${e.dividas} lanc=${e.lancs}`);

  // ── cenário B: parecida e É A MESMA ("sim") ──
  console.log("\n=== B  compra parecida → 'sim' (é a mesma, não duplica)");
  arquivos.set("Nubank_2027-01-01.csv", Buffer.from('date,title,amount\n2026-10-06,Asa*Upward Creative Ac Cursos - Parcela 1/10,"12,50"\n', "utf8"));
  r = await doc("Nubank_2027-01-01.csv");
  e = await estado();
  check("B.1 pergunta se é a mesma compra", /parecid/i.test(r.log) && pendente(e), r.log.slice(-160).replace(/\n/g, " "));
  const antes = e;
  r = await texto("sim");
  e = await estado();
  check("B.2 'sim' (é a mesma) NÃO cria dívida nova e limpa a pendência", e.dividas === antes.dividas && !pendente(e), `div=${e.dividas} (antes ${antes.dividas}) pendente=${pendente(e)}`);

  // ── cenário C: 'sim'/'não' soltos, sem nada pendente ──
  console.log("\n=== C  'sim' e 'não' fora de contexto");
  const base = await estado();
  r = await texto("sim");
  const r2 = await texto("não");
  e = await estado();
  check("C.1 'sim'/'não' sem pendência não gravam nada nem quebram (webhook 200)", r.status === 200 && r2.status === 200 && e.dividas === base.dividas && e.lancs === base.lancs, `status=${r.status},${r2.status}`);

  // ── cenário D: dois arquivos seguidos sem responder ──
  console.log("\n=== D  segundo arquivo antes de responder o primeiro");
  arquivos.set("Nubank_2027-02-01.csv", Buffer.from('date,title,amount\n2026-10-05,Loja Pendente Um,"11,00"\n', "utf8"));
  arquivos.set("Nubank_2027-03-01.csv", Buffer.from('date,title,amount\n2026-10-05,Loja Pendente Dois,"22,00"\n', "utf8"));
  await doc("Nubank_2027-02-01.csv");
  await doc("Nubank_2027-03-01.csv");
  const antesD = await estado();
  await texto("sim");
  e = await estado();
  const lojas = await prisma.lancamento.findMany({ where: { clienteId: c.id, descricao: { startsWith: "Loja Pendente" } }, select: { descricao: true } });
  check("D.1 o 'sim' vale só pro ÚLTIMO arquivo (o 1º é substituído, nada em dobro)", lojas.length === 1 && lojas[0].descricao === "Loja Pendente Dois", lojas.map((l) => l.descricao).join());
} catch (err) {
  console.error("ERRO NO ROTEIRO:", err);
  check("roteiro executou até o fim", false, String(err?.message ?? err).slice(0, 200));
} finally {
  servidor.close();
  await limpar();
  console.log(`\nlimpeza: contas de QA restantes = ${await prisma.cliente.count({ where: { telefone: TEL } })}`);
  await prisma.$disconnect();
  console.log(`\n══ RESUMO: ${resultados.filter(Boolean).length}/${resultados.length} passaram ══`);
  process.exit(0);
}
