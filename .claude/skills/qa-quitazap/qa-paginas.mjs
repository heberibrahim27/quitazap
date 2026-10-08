// QA das PÁGINAS do app com dados importados + regressão do básico nos dois canais.
// Conta isTeste PRÓPRIA (5571900004444); servidor local em :3100 (ver SKILL.md).
// node .claude/skills/qa-quitazap/qa-paginas.mjs
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
const BASE = "http://localhost:3100";
const TEL = "5571900004444";
const prisma = new PrismaClient();
const resultados = [];
const check = (nome, ok, extra = "") => {
  resultados.push({ nome, ok: !!ok, extra });
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
  await prisma.auditoriaAssistente.deleteMany({ where: { ferramenta: { startsWith: "agente:" } } });
}

const texto = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

try {
  await limpar();
  const { criarSessaoCliente } = carregarTs("src/lib/cliente-auth.ts");
  const c = await prisma.cliente.create({
    data: { nome: "QA Paginas", telefone: TEL, isTeste: true, gratuito: false, aceitaProativas: true, rendaMensal: 5000, assinaturaVenceEm: new Date(Date.now() + 30 * 86400000) },
  });
  const cookie = `qz_cliente_auth=${criarSessaoCliente(c.id)}`;
  const chat = async (mensagem) => {
    const r = await fetch(`${BASE}/api/minha-conta/chat/mensagem`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ mensagem }), signal: AbortSignal.timeout(120000) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  const whats = async (msg) => {
    const r = await fetch(`${BASE}/api/webhook/zapi?secret=qa-wh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ReceivedCallback", phone: TEL, messageId: `qa-${Date.now()}-${Math.random()}`, text: { message: msg }, fromMe: false }),
      signal: AbortSignal.timeout(120000),
    });
    await dorme(2500);
    return r.status;
  };
  const lancs = () => prisma.lancamento.findMany({ where: { clienteId: c.id }, orderBy: { criadoEm: "asc" } });

  // ── dados: fatura importada pelo chat (OFX real) ──
  const fd = new FormData();
  fd.set("arquivo", new File([fs.readFileSync("tests/fixtures/Nubank_2026-11-01.ofx")], "Nubank_2026-11-01.ofx"));
  let r = await fetch(`${BASE}/api/minha-conta/chat/arquivo`, { method: "POST", headers: { cookie }, body: fd, signal: AbortSignal.timeout(150000) });
  const arq = await r.json();
  check("setup: OFX lido pelo chat", arq.dadosEstruturados?.tipo === "fatura_detectada");
  r = await fetch(`${BASE}/api/minha-conta/fatura/confirmar`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ acao: "confirmar" }) });
  check("setup: fatura confirmada", r.status === 200);

  // ── páginas: nenhuma pode quebrar, e os números têm que bater ──
  console.log("\n=== Páginas com a fatura importada (out/2026)");
  const paginas = ["/minha-conta", "/minha-conta/hoje", "/minha-conta/despesas?mes=2026-10", "/minha-conta/cartoes", "/minha-conta/movimentacoes?mes=2026-10", "/minha-conta/gastos", "/minha-conta/dividas", "/minha-conta/emprestimos", "/minha-conta/agenda", "/minha-conta/metas", "/minha-conta/receitas", "/minha-conta/perfil", "/minha-conta/plano", "/minha-conta/chat", "/minha-conta/busca"];
  const html = {};
  for (const p of paginas) {
    const res = await fetch(BASE + p, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(120000) });
    const t = texto(await res.text());
    html[p] = t;
    const quebrou = res.status >= 500 || /Application error|Internal Server Error|This page couldn.t load/i.test(t);
    check(`GET ${p} abre sem erro`, res.status === 200 && !quebrou, `status=${res.status}${quebrou ? " " + t.slice(0, 120) : ""}`);
  }
  const desp = html["/minha-conta/despesas?mes=2026-10"] ?? "";
  // out/2026 = tudo menos as 2 parcelas de 24/09 (73,23 + 10,03) → 2644,42 − 83,26 = 2561,16
  check("despesas de outubro somam R$ 2.561,16", desp.includes("2.561,16"), desp.match(/Total[^R]*R\$\s*[\d.,]+/)?.[0] ?? desp.slice(0, 160));
  check("despesas mostram 'Pix/Boleto no crédito'", /Pix\/Boleto no crédito/.test(desp));
  check("cartões mostra o Nubank", /Nubank/.test(html["/minha-conta/cartoes"] ?? ""));

  // ── regressão do básico: mesmos cenários nos dois canais, compara o EFEITO no banco ──
  console.log("\n=== Básico: chat × WhatsApp");
  const antes = (await lancs()).length;
  await chat("gastei 80 no mercado");
  let l = await lancs();
  const viaChat = l.at(-1);
  check("chat: 'gastei 80 no mercado' cria 1 lançamento Mercado R$80", l.length === antes + 1 && viaChat?.valor === 80 && viaChat?.categoria === "Mercado", `${viaChat?.descricao} ${viaChat?.valor} ${viaChat?.categoria}`);
  await chat("desfazer");
  l = await lancs();
  check("chat: 'desfazer' remove o lançamento", l.length === antes, `n=${l.length}`);

  await whats("gastei 80 no mercado");
  l = await lancs();
  const viaZap = l.at(-1);
  check("whats: 'gastei 80 no mercado' cria o MESMO efeito (Mercado R$80)", l.length === antes + 1 && viaZap?.valor === 80 && viaZap?.categoria === "Mercado", `${viaZap?.descricao} ${viaZap?.valor} ${viaZap?.categoria}`);
  await whats("desfazer");
  l = await lancs();
  check("whats: 'desfazer' remove o lançamento", l.length === antes, `n=${l.length}`);

  await chat("gastei 45 no ze delivery");
  l = await lancs();
  check("chat: 'ze delivery' vira Lazer (dicionário novo)", l.at(-1)?.categoria === "Lazer", l.at(-1)?.categoria);
  await chat("desfazer");

  await chat("paguei 120 de pix no credito pro joao");
  l = await lancs();
  const pix = l.at(-1);
  check("chat: 'pix no credito' vira 'Pix/Boleto no crédito'", pix?.categoria === "Pix/Boleto no crédito", `${pix?.descricao} ${pix?.categoria} ${pix?.valor}`);
  await chat("desfazer");

  const q = await chat("quanto gastei no cartão este mês");
  check("chat responde consulta de cartão sem erro", q.status === 200 && (q.data.resposta ?? "").length > 10, (q.data.resposta ?? "").slice(0, 120));
} catch (err) {
  console.error("ERRO NO ROTEIRO:", err);
  check("roteiro executou até o fim", false, String(err?.message ?? err).slice(0, 200));
} finally {
  await limpar();
  const sobras = await prisma.cliente.count({ where: { telefone: TEL } });
  console.log(`\nlimpeza: contas de QA restantes = ${sobras}`);
  await prisma.$disconnect();
  const falhas = resultados.filter((x) => !x.ok);
  console.log(`\n══ RESUMO: ${resultados.length - falhas.length}/${resultados.length} passaram ══`);
  for (const f of falhas) console.log(`FALHOU: ${f.nome} — ${f.extra}`);
  process.exit(0);
}
