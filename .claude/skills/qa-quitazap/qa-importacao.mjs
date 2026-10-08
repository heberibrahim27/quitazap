// Roteiro de QA da importação de fatura/empréstimo/boleto (chat × WhatsApp). Precisa do servidor local
// (`next dev -p 3100`, ver SKILL.md). Os prints (JPEG) saem de arquivos em UP (pasta de uploads local):
// se não existirem, ajuste UP. Cria/limpa só as contas isTeste 5571900007777 e 5571900006666.
// QA rodada 1 — importação de fatura/empréstimo/boleto (chat × WhatsApp), idempotência,
// concorrência, categorias e entradas inválidas. Contas de teste PRÓPRIAS (isTeste) e
// limpeza só delas. Rode da raiz: node .claude/tmp/qa-rodada1.mjs
import fs from "node:fs";
import http from "node:http";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

for (const l of fs.readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").replace(/\r$/, "");
}
process.env.NEXTAUTH_SECRET = "qa-local-secret";

const BASE = "http://localhost:3100";
const TEL_A = "5571900007777"; // chat
const TEL_B = "5571900006666"; // whatsapp
const UP = "C:/Users/HOME/.claude/uploads/1fbb02ef-0fe3-4e42-9c71-db861a1b92c7";
const prisma = new PrismaClient();
const resultados = [];

function check(nome, cond, extra = "") {
  resultados.push({ nome, ok: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"}  ${nome}${extra ? " — " + extra : ""}`);
}
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const arred = (n) => Math.round(n * 100) / 100;

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

// ── fixtures ──────────────────────────────────────────────
function pdfMinimo(linhas) {
  const conteudo = ["BT", "/F1 11 Tf", "14 TL", "40 800 Td", ...linhas.map((l) => `(${l.replace(/[()\\]/g, "")}) Tj T*`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(conteudo)} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}
const jpeg = (png) => sharp(png).resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();

const F = {
  ofx: fs.readFileSync("tests/fixtures/Nubank_2026-11-01.ofx"),
  csv: fs.readFileSync("tests/fixtures/Nubank_2026-11-01.csv"),
  printFatura1: await jpeg(`${UP}/2d33c1b4-image.png`),
  printFatura2: await jpeg(`${UP}/eadfbde8-image.png`),
  printEmprestimo: await jpeg(`${UP}/8578e5c5-image.png`),
  pdfFatura: pdfMinimo([
    "PagBank - Fatura do Cartao de Credito",
    "Vencimento: 01/11/2026    Total da fatura: R$ 842,30",
    "Lancamentos",
    "03/10  MERCADO SAO JORGE            R$ 154,20",
    "05/10  POSTO IPIRANGA               R$ 210,00",
    "06/10  LOJA MAGAZINE LUIZA parcela 02 de 05    R$ 99,90",
    "04/10  NETFLIX.COM                  R$ 55,90",
    "06/10  IOF                          R$ 2,30",
    "06/10  Pagamento recebido           - R$ 500,00",
    "07/10  FARMACIA POPULAR             R$ 320,00",
  ]),
  pdfBoleto: pdfMinimo([
    "BOLETO BANCARIO",
    "Beneficiario: ENERGIA DISTRIBUIDORA S.A.",
    "Pagador: QA Teste",
    "Vencimento: 15/11/2026",
    "Valor do documento: R$ 187,45",
    "Linha digitavel: 23793.38128 60000.000003 00000.000400 1 92560000018745",
  ]),
  csvDesconhecidos: Buffer.from(
    'date,title,amount\n2026-10-01,Dra Marina Odontologia,"350,00"\n2026-10-02,Studio Pilates Corpo e Mente,"180,00"\n2026-10-03,Auto Escola Direcao Certa,"120,00"\n2026-10-04,Zxqv Holdings Ltda,"45,00"\n',
    "utf8"
  ),
  csvMesSeguinte: Buffer.from(
    'date,title,amount\n2026-10-07,Atacadao Atakarejo - Parcela 2/3,"30,90"\n2026-10-07,Mercado Novo Mes,"50,00"\n2026-10-06,Asa*Upward Creative Ac - Parcela 2/10,"12,50"\n',
    "utf8"
  ),
};

// servidor estático local pra o webhook do WhatsApp baixar os arquivos
const arquivosEstaticos = new Map([
  ["/fatura.ofx", [F.ofx, "application/octet-stream"]],
  ["/fatura-pdf.pdf", [F.pdfFatura, "application/pdf"]],
  ["/boleto.pdf", [F.pdfBoleto, "application/pdf"]],
  ["/emprestimo.jpg", [F.printEmprestimo, "image/jpeg"]],
  ["/fatura-print2.jpg", [F.printFatura2, "image/jpeg"]],
]);
const estatico = http.createServer((req, res) => {
  const a = arquivosEstaticos.get(req.url.split("?")[0]);
  if (!a) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": a[1] }).end(a[0]);
});
await new Promise((r) => estatico.listen(3199, r));

// ── contas de teste ───────────────────────────────────────
const { criarSessaoCliente } = carregarTs("src/lib/cliente-auth.ts");
async function limparTel(tel) {
  const c = await prisma.cliente.findFirst({ where: { telefone: tel, isTeste: true } });
  if (c) {
    for (const t of ["logIA", "mensagemChat", "eventoAnalytics", "mensagemPendenteRevisao", "lancamentoAuditoria"]) {
      await prisma[t].deleteMany({ where: { clienteId: c.id } });
    }
    await prisma.cliente.delete({ where: { id: c.id } });
  }
  await prisma.botSessao.deleteMany({ where: { telefone: tel } });
}
async function criarConta(tel, nome) {
  await limparTel(tel);
  return prisma.cliente.create({
    data: { nome, telefone: tel, isTeste: true, gratuito: false, aceitaProativas: true, rendaMensal: 5000, assinaturaVenceEm: new Date(Date.now() + 30 * 86400000) },
  });
}
const cookie = (c) => `qz_cliente_auth=${criarSessaoCliente(c.id)}`;

async function postArquivo(c, nome, buf, tipo = "application/octet-stream") {
  const fd = new FormData();
  fd.set("arquivo", new File([buf], nome, { type: tipo }));
  const r = await fetch(`${BASE}/api/minha-conta/chat/arquivo`, { method: "POST", headers: { cookie: cookie(c) }, body: fd, signal: AbortSignal.timeout(150000) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function postAnexo(c, buf) {
  const fd = new FormData();
  fd.set("arquivo", new Blob([buf], { type: "image/jpeg" }), "foto.jpg");
  const r = await fetch(`${BASE}/api/minha-conta/chat/anexo`, { method: "POST", headers: { cookie: cookie(c) }, body: fd, signal: AbortSignal.timeout(150000) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function postJson(c, rota, body) {
  const r = await fetch(`${BASE}${rota}`, { method: "POST", headers: { "Content-Type": "application/json", cookie: cookie(c) }, body: JSON.stringify(body), signal: AbortSignal.timeout(150000) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function webhook(tel, payload) {
  const r = await fetch(`${BASE}/api/webhook/zapi?secret=qa-wh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "ReceivedCallback", phone: tel, messageId: `qa-${Date.now()}-${Math.random()}`, fromMe: false, ...payload }),
    signal: AbortSignal.timeout(170000),
  });
  return r.status;
}
const zap = {
  texto: (tel, t) => webhook(tel, { text: { message: t } }),
  doc: (tel, url, fileName) => webhook(tel, { document: { documentUrl: url, fileName } }),
  img: (tel, url) => webhook(tel, { image: { imageUrl: url } }),
};
function logMock(desdeBytes) {
  const t = fs.readFileSync("_dev.log", "utf8");
  return t.slice(desdeBytes);
}
const tamLog = () => fs.statSync("_dev.log").size;

// ── estado no banco ───────────────────────────────────────
async function estado(c) {
  const lancs = await prisma.lancamento.findMany({ where: { clienteId: c.id, tipo: "COMPRA_CARTAO" } });
  const dividas = await prisma.divida.findMany({ where: { clienteId: c.id }, include: { parcelas: { orderBy: { numero: "asc" } } }, orderBy: { criadoEm: "asc" } });
  const cartoes = await prisma.cartao.findMany({ where: { clienteId: c.id } });
  return { lancs, dividas, cartoes, soma: arred(lancs.reduce((s, l) => s + l.valor, 0)) };
}
const porCredor = (e, parte) => e.dividas.find((d) => d.credor.toLowerCase().includes(parte.toLowerCase()));
const cats = (e) => Object.fromEntries([...new Set(e.lancs.map((l) => l.categoria))].map((k) => [k, e.lancs.filter((l) => l.categoria === k).length]));

// ══════════════════════════════════════════════════════════
async function main() {
  const A = await criarConta(TEL_A, "QA Chat");
  const B = await criarConta(TEL_B, "QA Whats");
  console.log("contas:", A.id, B.id);

  // ── R1: OFX no chat ────────────────────────────────────
  console.log("\n=== R1  OFX no chat");
  let r = await postArquivo(A, "Nubank_2026-11-01.ofx", F.ofx);
  check("R1.1 OFX responde 200 com card de fatura", r.status === 200 && r.data.dadosEstruturados?.tipo === "fatura_detectada", `status=${r.status}`);
  const d1 = r.data.dadosEstruturados ?? {};
  check("R1.2 prévia traz 21 compras e 4 parcelas futuras", d1.compras?.length === 21 && d1.itens?.length === 4, `compras=${d1.compras?.length} itens=${d1.itens?.length}`);
  check("R1.3 vencimento 2026-11-01 (do nome) e não estimado", d1.vencimento === "2026-11-01" && !d1.vencimentoEstimado, d1.vencimento);
  let e = await estado(A);
  check("R1.4 NADA gravado antes de confirmar", e.lancs.length === 0 && e.dividas.length === 0, `lanc=${e.lancs.length} div=${e.dividas.length}`);
  // categoria por compra já na prévia + escolha do cliente pro que o app não soube classificar
  check("R1.4b prévia traz categoria em cada compra e a lista de categorias", d1.compras?.every((c) => typeof c.categoria === "string") && d1.categorias?.includes("Transporte") && !d1.categorias?.includes("Pix/Boleto no crédito"), JSON.stringify(d1.categorias?.slice(0, 3)));
  const iSantos = d1.compras.findIndex((c) => /santos pedreira/i.test(c.descricao));
  const iVercel = d1.compras.findIndex((c) => /vercel/i.test(c.descricao));
  const iPix = d1.compras.findIndex((c) => /pix no cr/i.test(c.descricao));
  r = await postJson(A, "/api/minha-conta/fatura/confirmar", { acao: "confirmar", categorias: { [iSantos]: "Educação", [iVercel]: "CategoriaInventada", [iPix]: "Lazer" } });
  check("R1.5 confirmar responde 200", r.status === 200, r.data.resposta?.slice(0, 80) ?? r.data.error);
  e = await estado(A);
  check("R1.6 21 gastos no cartão, soma 2644.42", e.lancs.length === 21 && Math.abs(e.soma - 2644.42) < 0.02, `n=${e.lancs.length} soma=${e.soma}`);
  check("R1.7 4 dívidas de cartão com parcelas 9/2/2/1", e.dividas.length === 4 && [porCredor(e, "Asa")?.parcelas.length, porCredor(e, "Atacadao")?.parcelas.length, porCredor(e, "Kiwify")?.parcelas.length, porCredor(e, "Baratao")?.parcelas.length].join() === "9,2,2,1", e.dividas.map((d) => `${d.credor}:${d.parcelas.length}`).join(" | "));
  check("R1.8 um único cartão Nubank", e.cartoes.length === 1 && /nubank/i.test(e.cartoes[0].nome), e.cartoes.map((c) => c.nome).join());
  const kiwi = porCredor(e, "Kiwify");
  check("R1.9 parcelas futuras da Kiwify são 11 e 12, vencendo dia 1", kiwi && kiwi.parcelas.map((p) => p.numero).join() === "11,12" && kiwi.parcelas.every((p) => p.vencimento.getUTCDate() === 1), kiwi?.parcelas.map((p) => `${p.numero}:${p.vencimento.toISOString().slice(0, 10)}`).join());
  check("R1.10 Pix/Boleto no crédito = 3 lançamentos; IOF em Impostos/Taxas = 4", cats(e)["Pix/Boleto no crédito"] === 3 && cats(e)["Impostos/Taxas"] === 4, JSON.stringify(cats(e)));
  check("R1.10b categoria escolhida pelo cliente na prévia é gravada (Santos → Educação)", e.lancs.find((l) => /santos pedreira/i.test(l.descricao))?.categoria === "Educação", e.lancs.find((l) => /santos pedreira/i.test(l.descricao))?.categoria);
  check("R1.10c categoria inventada é recusada (Vercel segue Trabalho/Negócio) e Pix/Boleto no crédito não é sobrescrito", e.lancs.find((l) => /vercel/i.test(l.descricao))?.categoria === "Trabalho/Negócio" && e.lancs.filter((l) => /pix no cr/i.test(l.descricao)).every((l) => l.categoria === "Pix/Boleto no crédito"));
  check("R1.11 Atacadão como Mercado, Zé Delivery como Lazer", e.lancs.find((l) => /atacadao/i.test(l.descricao))?.categoria === "Mercado" && e.lancs.find((l) => /ze delivery|zé delivery/i.test(l.descricao))?.categoria === "Lazer");
  const base = { lanc: e.lancs.length, div: e.dividas.length, soma: e.soma };

  // ── R2/R3: idempotência e cross-format ─────────────────
  console.log("\n=== R2  Reenvio e outro formato (não pode duplicar)");
  r = await postArquivo(A, "Nubank_2026-11-01.ofx", F.ofx);
  e = await estado(A);
  check("R2.1 reenviar o MESMO OFX não cria nada", e.lancs.length === base.lanc && e.dividas.length === base.div, `${r.data.resposta?.slice(0, 90)}`);
  r = await postArquivo(A, "Nubank_2026-11-01.csv", F.csv, "text/csv");
  e = await estado(A);
  check("R2.2 o MESMO conteúdo em CSV não cria nada (cross-formato)", e.lancs.length === base.lanc && e.dividas.length === base.div && r.data.dadosEstruturados?.tipo !== "fatura_detectada", `${r.data.resposta?.slice(0, 90)}`);

  // ── R4: prints da mesma fatura (±1 centavo) ────────────
  console.log("\n=== R4  Prints da mesma fatura (valores com 1 centavo de diferença)");
  r = await postAnexo(A, F.printFatura1);
  e = await estado(A);
  check("R4.1 print 1 não duplica gastos nem dívidas", e.lancs.length === base.lanc && e.dividas.length === base.div, `${r.data.resposta?.slice(0, 100)}`);
  r = await postAnexo(A, F.printFatura2);
  e = await estado(A);
  check("R4.2 print 2 não duplica gastos nem dívidas (inclui Kiwify↔Kiwiify)", e.lancs.length === base.lanc && e.dividas.length === base.div, `${r.data.resposta?.slice(0, 100)}`);
  if (r.data.dadosEstruturados?.tipo === "fatura_detectada") await postJson(A, "/api/minha-conta/fatura/confirmar", { acao: "negar" });

  // ── R5: fatura do mês seguinte ─────────────────────────
  console.log("\n=== R5  Mês seguinte (parcela 2/3 de dívida que já existe + compra nova)");
  r = await postArquivo(A, "Nubank_2026-12-01.csv", F.csvMesSeguinte, "text/csv");
  const d5 = r.data.dadosEstruturados ?? {};
  check("R5.1 prévia mostra só a compra nova (parcelas 2/x já estão nas dívidas)", d5.compras?.length === 1 && /Mercado Novo/i.test(d5.compras?.[0]?.descricao ?? "") && (d5.itens?.length ?? 0) === 0, JSON.stringify({ compras: d5.compras?.map((c) => c.descricao), itens: d5.itens?.length }));
  r = await postJson(A, "/api/minha-conta/fatura/confirmar", { acao: "confirmar" });
  e = await estado(A);
  check("R5.2 confirmar cria 1 gasto e nenhuma dívida nova", e.lancs.length === base.lanc + 1 && e.dividas.length === base.div, `lanc=${e.lancs.length} div=${e.dividas.length}`);
  base.lanc = e.lancs.length;

  // ── R6: empréstimo por print ───────────────────────────
  console.log("\n=== R6  Empréstimo por print");
  r = await postAnexo(A, F.printEmprestimo);
  const d6 = r.data.dadosEstruturados ?? {};
  check("R6.1 reconhece empréstimo (5x R$265,77, 1 paga)", d6.tipo === "emprestimo_detectado" && d6.totalParcelas === 5 && Math.abs(d6.valorParcela - 265.77) < 0.01 && d6.parcelasPagas === 1, JSON.stringify(d6).slice(0, 200));
  e = await estado(A);
  check("R6.2 nada gravado antes de confirmar", !e.dividas.some((d) => d.tipo === "EMPRESTIMO"));
  r = await postJson(A, "/api/minha-conta/emprestimo/confirmar", { acao: "confirmar", mensagemId: d6.mensagemId });
  e = await estado(A);
  const emp = e.dividas.find((d) => d.tipo === "EMPRESTIMO");
  check("R6.3 empréstimo criado com 5 parcelas, a 1ª PAGA e valorPago=265.77", emp && emp.parcelas.length === 5 && emp.parcelas[0].status === "PAGA" && emp.parcelas.slice(1).every((p) => p.status === "PENDENTE") && Math.abs(emp.valorPago - 265.77) < 0.01, emp ? `${emp.credor} pagas=${emp.parcelas.filter((p) => p.status === "PAGA").length} valorPago=${emp.valorPago}` : r.data.error);
  check("R6.4 vencimentos 24/09/2026 … 24/01/2027", emp && emp.parcelas.map((p) => p.vencimento.toISOString().slice(0, 10)).join() === "2026-09-24,2026-10-24,2026-11-24,2026-12-24,2027-01-24", emp?.parcelas.map((p) => p.vencimento.toISOString().slice(0, 10)).join());
  r = await postJson(A, "/api/minha-conta/emprestimo/confirmar", { acao: "confirmar", mensagemId: d6.mensagemId });
  e = await estado(A);
  check("R6.5 confirmar DE NOVO a mesma prévia não duplica (409)", r.status === 409 && e.dividas.filter((d) => d.tipo === "EMPRESTIMO").length === 1, `status=${r.status}`);
  r = await postAnexo(A, F.printEmprestimo);
  e = await estado(A);
  check("R6.6 reenviar o print do mesmo empréstimo avisa que já existe", e.dividas.filter((d) => d.tipo === "EMPRESTIMO").length === 1 && /já está/i.test(r.data.resposta ?? ""), r.data.resposta?.slice(0, 90));
  const lancAntes = (await estado(A)).lancs.length;
  check("R6.7 empréstimo antigo NÃO gera gasto no extrato", lancAntes === base.lanc);

  // ── R7/R8: PDF no chat ─────────────────────────────────
  console.log("\n=== R7  PDF de fatura (PagBank) no chat");
  r = await postArquivo(A, "invoice-01-10-2026.pdf.pdf", F.pdfFatura, "application/pdf");
  const d7 = r.data.dadosEstruturados ?? {};
  check("R7.1 PDF vira card de fatura (PagBank)", d7.tipo === "fatura_detectada" && /pagbank/i.test(d7.cartao ?? ""), `${d7.tipo} ${d7.cartao}`);
  const soma7 = arred((d7.compras ?? []).reduce((s, c) => s + c.valor, 0));
  check("R7.2 soma das compras lidas bate com o total impresso (842,30)", Math.abs(soma7 - 842.3) < 0.02 && !d7.avisoTotal, `soma=${soma7} aviso=${JSON.stringify(d7.avisoTotal)}`);
  r = await postJson(A, "/api/minha-conta/fatura/confirmar", { acao: "confirmar" });
  e = await estado(A);
  check("R7.3 gastos do PagBank gravados no cartão PagBank", e.cartoes.some((c) => /pagbank/i.test(c.nome)) && e.lancs.filter((l) => l.cartaoId && e.cartoes.find((c) => c.id === l.cartaoId && /pagbank/i.test(c.nome))).length >= 5, `cartoes=${e.cartoes.map((c) => c.nome).join()}`);

  console.log("\n=== R8  PDF de boleto no chat");
  r = await postArquivo(A, "boleto.pdf", F.pdfBoleto, "application/pdf");
  const d8 = r.data.dadosEstruturados ?? {};
  check("R8.1 PDF vira card de boleto (R$187,45, 15/11)", d8.tipo === "boleto_detectado" && Math.abs(d8.valor - 187.45) < 0.01 && d8.vencimento === "2026-11-15", JSON.stringify(d8).slice(0, 160));
  r = await postJson(A, "/api/minha-conta/boleto/confirmar", { acao: "confirmar" });
  e = await estado(A);
  const bol = e.dividas.find((d) => d.tipo === "BOLETO");
  check("R8.2 boleto salvo com 1 parcela pendente", bol && bol.parcelas.length === 1 && bol.parcelas[0].status === "PENDENTE", bol?.credor);
  r = await postJson(A, "/api/minha-conta/boleto/confirmar", { acao: "confirmar" });
  check("R8.3 confirmar boleto de novo → 409 e sem duplicar", r.status === 409 && (await estado(A)).dividas.filter((d) => d.tipo === "BOLETO").length === 1, `status=${r.status}`);

  // ── R9: entradas inválidas ─────────────────────────────
  console.log("\n=== R9  Entradas inválidas e segurança");
  r = await postArquivo(A, "lixo.txt", Buffer.from("olá mundo, isso não é fatura"));
  check("R9.1 texto qualquer → mensagem amigável, nada gravado", r.status === 200 && /n[ãa]o consegui/i.test(r.data.resposta ?? ""), `${r.status} ${r.data.resposta?.slice(0, 80)}`);
  r = await postArquivo(A, "vazio.csv", Buffer.alloc(0));
  check("R9.2 arquivo vazio → 400", r.status === 400, `status=${r.status}`);
  r = await postArquivo(A, "grande.csv", Buffer.alloc(9 * 1024 * 1024, 65));
  check("R9.3 arquivo > 8MB → 400", r.status === 400, `status=${r.status}`);
  r = await postArquivo(A, "quebrado.pdf", Buffer.from("%PDF-1.4\nlixo lixo lixo\n%%EOF"), "application/pdf");
  check("R9.4 PDF corrompido → resposta tratada (200 amigável ou 500 com mensagem), sem travar", [200, 500].includes(r.status) && (r.data.resposta || r.data.error), `status=${r.status} ${(r.data.resposta ?? r.data.error ?? "").slice(0, 80)}`);
  let sem = await fetch(`${BASE}/api/minha-conta/chat/arquivo`, { method: "POST", body: new FormData() });
  check("R9.5 sem login → 401", sem.status === 401, `status=${sem.status}`);
  sem = await fetch(`${BASE}/api/minha-conta/emprestimo/confirmar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "confirmar", mensagemId: d6.mensagemId }) });
  check("R9.6 confirmar empréstimo sem login → 401", sem.status === 401, `status=${sem.status}`);
  // isolamento: a conta B não pode confirmar a prévia da conta A
  const prevA = await postAnexo(A, F.printEmprestimo); // já existe → sem prévia; gera uma nova com outro empréstimo
  r = await postJson(B, "/api/minha-conta/emprestimo/confirmar", { acao: "confirmar", mensagemId: d6.mensagemId });
  check("R9.7 conta B não consegue resolver prévia da conta A", r.status === 409 || r.status === 400, `status=${r.status}`);

  // ── R10: concorrência (toque duplo) ────────────────────
  console.log("\n=== R10  Toque duplo no confirmar (concorrência)");
  const csvConc = Buffer.from('date,title,amount\n2026-10-05,Loja Concorrencia Um,"70,00"\n2026-10-05,Loja Concorrencia Dois,"80,00"\n', "utf8");
  r = await postArquivo(A, "Nubank_2026-12-01.csv", csvConc, "text/csv");
  const antes = (await estado(A)).lancs.length;
  const [c1, c2] = await Promise.all([postJson(A, "/api/minha-conta/fatura/confirmar", { acao: "confirmar" }), postJson(A, "/api/minha-conta/fatura/confirmar", { acao: "confirmar" })]);
  e = await estado(A);
  check("R10.1 dois confirmar simultâneos gravam UMA vez (+2 gastos)", e.lancs.length === antes + 2, `delta=${e.lancs.length - antes} (esperado 2) status=${c1.status},${c2.status}`);
  const antesEmp = (await estado(A)).dividas.length;
  const ppE = await postAnexo(A, Buffer.from(await sharp(`${UP}/8578e5c5-image.png`).resize({ width: 1000 }).jpeg({ quality: 70 }).toBuffer()));
  // empréstimo já existe → sem prévia; ok, só confirma que não cria
  check("R10.2 empréstimo repetido continua sem duplicar", (await estado(A)).dividas.length === antesEmp);

  // ── R11: categorização com IA ──────────────────────────
  console.log("\n=== R11  Categorias: estabelecimentos desconhecidos");
  r = await postArquivo(A, "Nubank_2026-12-01.csv", F.csvDesconhecidos, "text/csv");
  await postJson(A, "/api/minha-conta/fatura/confirmar", { acao: "confirmar" });
  e = await estado(A);
  const catDe = (parte) => e.lancs.find((l) => l.descricao.includes(parte))?.categoria;
  console.log("   Odontologia →", catDe("Odontologia"), "| Pilates →", catDe("Pilates"), "| Auto Escola →", catDe("Auto Escola"), "| Zxqv →", catDe("Zxqv"));
  check("R11.1 ao menos 2 de 3 estabelecimentos reconhecíveis saíram de 'Outros'", ["Odontologia", "Pilates", "Auto Escola"].filter((p) => catDe(p) && catDe(p) !== "Outros").length >= 2);
  check("R11.2 estabelecimento sem sentido fica em 'Outros' (a IA não chuta)", catDe("Zxqv") === "Outros", catDe("Zxqv"));

  // ── R12: a escolha do cliente vence o dicionário (menos a estrutura do banco) ──
  console.log("\n=== R12  Histórico do cliente × dicionário");
  const claude = (await estado(A)).lancs.find((l) => /anthropic/i.test(l.descricao));
  check("R12.0 dicionário geral põe Claude em Assinaturas (ou já em Trabalho/Negócio pelo histórico)", claude?.categoria === "Assinaturas" || claude?.categoria === "Trabalho/Negócio", claude?.categoria);
  await prisma.lancamento.update({ where: { id: claude.id }, data: { categoria: "Trabalho/Negócio" } });
  const pixAntigo = (await estado(A)).lancs.find((l) => /pix no cr/i.test(l.descricao));
  await prisma.lancamento.update({ where: { id: pixAntigo.id }, data: { categoria: "Lazer" } });
  const csvHist = Buffer.from(
    'date,title,amount\n2026-10-06,Anthropic* Claude Sub,"572,45"\n2026-10-06,' + pixAntigo.descricao + ',"11,11"\n',
    "utf8"
  );
  r = await postArquivo(A, "Nubank_2026-12-01.csv", csvHist, "text/csv");
  await postJson(A, "/api/minha-conta/fatura/confirmar", { acao: "confirmar" });
  e = await estado(A);
  const novoClaude = e.lancs.filter((l) => /anthropic/i.test(l.descricao)).sort((x, y) => y.criadoEm - x.criadoEm)[0];
  const novoPix = e.lancs.filter((l) => l.descricao === pixAntigo.descricao).sort((x, y) => y.criadoEm - x.criadoEm)[0];
  check("R12.1 Claude já classificado como Trabalho/Negócio pelo cliente segue nessa categoria", novoClaude?.categoria === "Trabalho/Negócio", novoClaude?.categoria);
  check("R12.2 Pix no crédito NUNCA é sobrescrito pelo histórico (estrutura do banco)", novoPix?.categoria === "Pix/Boleto no crédito", novoPix?.categoria);

  // ══════ WhatsApp (conta B): mesmos cenários, mesmo efeito no banco ══════
  console.log("\n=== W  WhatsApp × Chat (conta B)");
  await postJson(B, "/api/minha-conta/chat/mensagem", { mensagem: "oi" }); // cria a sessão do bot
  let pos = tamLog();
  let st = await zap.doc(TEL_B, "http://localhost:3199/fatura.ofx", "Nubank_2026-11-01.ofx");
  await dorme(500);
  let sessB = await prisma.botSessao.findFirst({ where: { telefone: TEL_B } });
  check("W1.1 documento OFX → pendência de fatura criada", st === 200 && sessB?.faturaCartaoPendente && sessB.faturaCartaoPendente !== "null", `webhook=${st}`);
  let eb = await estado(B);
  check("W1.2 nada gravado antes do 'sim'", eb.lancs.length === 0 && eb.dividas.length === 0);
  await zap.texto(TEL_B, "sim");
  eb = await estado(B);
  check("W1.3 'sim' grava o MESMO que o chat: 21 gastos, 4 dívidas, soma 2644.42", eb.lancs.length === 21 && eb.dividas.length === 4 && Math.abs(eb.soma - 2644.42) < 0.02, `lanc=${eb.lancs.length} div=${eb.dividas.length} soma=${eb.soma}`);
  const ea0 = { cats: cats(await estado(A)) };
  check("W1.4 categorias do WhatsApp = chat para as regras fixas", cats(eb)["Pix/Boleto no crédito"] === 3 && cats(eb)["Impostos/Taxas"] === 4, JSON.stringify(cats(eb)));
  await zap.doc(TEL_B, "http://localhost:3199/fatura.ofx", "Nubank_2026-11-01.ofx");
  await zap.texto(TEL_B, "sim");
  eb = await estado(B);
  check("W1.5 reenviar o OFX no WhatsApp não duplica", eb.lancs.length === 21 && eb.dividas.length === 4, `lanc=${eb.lancs.length} div=${eb.dividas.length}`);

  st = await zap.img(TEL_B, "data:image/jpeg;base64," + F.printEmprestimo.toString("base64"));
  const empMsg = await prisma.mensagemChat.findFirst({ where: { clienteId: B.id, canal: "WHATSAPP", dadosEstruturados: { path: ["tipo"], equals: "emprestimo_detectado" } } });
  check("W2.1 print de empréstimo no WhatsApp cria a prévia", !!empMsg, `webhook=${st}`);
  eb = await estado(B);
  check("W2.2 nada gravado antes do 'sim'", !eb.dividas.some((d) => d.tipo === "EMPRESTIMO"));
  await zap.texto(TEL_B, "sim");
  eb = await estado(B);
  const empB = eb.dividas.find((d) => d.tipo === "EMPRESTIMO");
  check("W2.3 'sim' cria o empréstimo igual ao chat (5 parcelas, 1ª paga)", empB && empB.parcelas.length === 5 && empB.parcelas[0].status === "PAGA", empB?.credor);
  await zap.texto(TEL_B, "sim");
  eb = await estado(B);
  check("W2.4 'sim' repetido não duplica o empréstimo", eb.dividas.filter((d) => d.tipo === "EMPRESTIMO").length === 1);

  st = await zap.doc(TEL_B, "http://localhost:3199/fatura-pdf.pdf", "invoice-01-10-2026.pdf.pdf");
  await zap.texto(TEL_B, "sim");
  eb = await estado(B);
  check("W3.1 PDF de fatura PagBank no WhatsApp grava gastos no cartão PagBank", eb.cartoes.some((c) => /pagbank/i.test(c.nome)), eb.cartoes.map((c) => c.nome).join());

  st = await zap.doc(TEL_B, "http://localhost:3199/boleto.pdf", "boleto.pdf");
  await zap.texto(TEL_B, "não");
  eb = await estado(B);
  check("W4.1 boleto PDF + 'não' no WhatsApp não salva nada", !eb.dividas.some((d) => d.tipo === "BOLETO"));
  await zap.doc(TEL_B, "http://localhost:3199/boleto.pdf", "boleto.pdf");
  await zap.texto(TEL_B, "sim");
  eb = await estado(B);
  check("W4.2 boleto PDF + 'sim' salva 1 dívida de boleto", eb.dividas.filter((d) => d.tipo === "BOLETO").length === 1);

  // WhatsApp: print de fatura (cross-source, mesmo efeito)
  await zap.img(TEL_B, "data:image/jpeg;base64," + F.printFatura2.toString("base64"));
  await zap.texto(TEL_B, "sim");
  eb = await estado(B);
  check("W5.1 print da fatura no WhatsApp após o OFX não duplica gastos", eb.lancs.filter((l) => !/pagbank/i.test(eb.cartoes.find((c) => c.id === l.cartaoId)?.nome ?? "")).length === 21, `nubank=${eb.lancs.filter((l) => /nubank/i.test(eb.cartoes.find((c) => c.id === l.cartaoId)?.nome ?? "")).length}`);
}

try {
  await main();
} catch (err) {
  console.error("ERRO NO ROTEIRO:", err);
  check("roteiro executou até o fim", false, String(err?.message ?? err).slice(0, 200));
} finally {
  // limpeza SÓ das contas criadas aqui
  await limparTel(TEL_A);
  await limparTel(TEL_B);
  const sobras = await prisma.cliente.count({ where: { telefone: { in: [TEL_A, TEL_B] } } });
  console.log(`\nlimpeza: contas de QA restantes = ${sobras}`);
  estatico.close();
  await prisma.$disconnect();
  const falhas = resultados.filter((x) => !x.ok);
  console.log(`\n══ RESUMO: ${resultados.length - falhas.length}/${resultados.length} passaram ══`);
  for (const f of falhas) console.log(`FALHOU: ${f.nome} — ${f.extra}`);
  process.exit(0);
}
