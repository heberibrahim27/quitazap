// QA de VOLUME: fatura grande não pode perder compra (respostas da IA têm limite de tamanho).
// Conta isTeste PRÓPRIA (5571900001111); servidor local :3100 (ver SKILL.md).
// node .claude/skills/qa-quitazap/qa-volume.mjs
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
const TEL = "5571900001111";
const prisma = new PrismaClient();
const resultados = [];
const check = (nome, ok, extra = "") => {
  resultados.push(!!ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${extra ? " — " + extra : ""}`);
};

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

function pdfLongo(linhas) {
  // fonte pequena pra caber ~85 linhas numa página
  const conteudo = ["BT", "/F1 8 Tf", "9.5 TL", "30 820 Td", ...linhas.map((l) => `(${l.replace(/[()\\]/g, "")}) Tj T*`), "ET"].join("\n");
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

try {
  await limpar();
  const { criarSessaoCliente } = carregarTs("src/lib/cliente-auth.ts");
  const c = await prisma.cliente.create({
    data: { nome: "QA Volume", telefone: TEL, isTeste: true, gratuito: false, aceitaProativas: true, rendaMensal: 5000, assinaturaVenceEm: new Date(Date.now() + 30 * 86400000) },
  });
  const cookie = `qz_cliente_auth=${criarSessaoCliente(c.id)}`;
  const enviar = async (nome, buf, tipo) => {
    const fd = new FormData();
    fd.set("arquivo", new File([buf], nome, { type: tipo }));
    const r = await fetch(`${BASE}/api/minha-conta/chat/arquivo`, { method: "POST", headers: { cookie }, body: fd, signal: AbortSignal.timeout(280000) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  const confirmar = (corpo = { acao: "confirmar" }) =>
    fetch(`${BASE}/api/minha-conta/fatura/confirmar`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(corpo) });

  // ── V1: 60 estabelecimentos DESCONHECIDOS (força a IA de categoria em lote) ──
  console.log("=== V1  CSV com 60 estabelecimentos desconhecidos");
  const ramos = ["Clinica Odontologica Sorriso", "Studio Pilates Corpo", "Escola de Idiomas Fluente", "Pet Shop Amigo Fiel", "Auto Escola Direcao", "Lavanderia Roupa Limpa"];
  const esperado = ["Saúde/Farmácia", "Beleza/Cuidados", "Educação", "Outros", "Educação", "Outros"];
  let csv = "date,title,amount\n";
  const nomes = [];
  for (let i = 0; i < 60; i++) {
    const nome = `${ramos[i % ramos.length]} ${String(i + 1).padStart(2, "0")}`;
    nomes.push(nome);
    csv += `2026-10-0${1 + (i % 7)},${nome},"${(40 + i * 3.17).toFixed(2).replace(".", ",")}"\n`;
  }
  let r = await enviar("Nubank_2026-11-01.csv", Buffer.from(csv, "utf8"), "text/csv");
  const d1 = r.data.dadosEstruturados ?? {};
  check("V1.1 prévia traz as 60 compras", d1.compras?.length === 60, `n=${d1.compras?.length}`);
  const naoOutros = (d1.compras ?? []).filter((x) => x.categoria && x.categoria !== "Outros").length;
  check("V1.2 a IA categorizou a maior parte (resposta não foi cortada no meio)", naoOutros >= 30, `${naoOutros}/60 fora de 'Outros'`);
  await confirmar();
  const salvos = await prisma.lancamento.count({ where: { clienteId: c.id } });
  check("V1.3 as 60 foram gravadas", salvos === 60, `n=${salvos}`);

  // ── V2: PDF de fatura com 80 linhas ──
  console.log("\n=== V2  PDF de fatura com 80 linhas");
  const linhas = ["PagBank - Fatura do Cartao de Credito", "Vencimento: 01/11/2026    Total da fatura: R$ 0,00", "Lancamentos"];
  let total = 0;
  const lojas = ["MERCADO", "POSTO", "FARMACIA", "PADARIA", "RESTAURANTE", "LOJA", "UBER", "NETFLIX"];
  for (let i = 0; i < 80; i++) {
    const v = Math.round((12 + i * 2.37) * 100) / 100;
    total += v;
    const dia = String(1 + (i % 7)).padStart(2, "0");
    linhas.push(`${dia}/10  ${lojas[i % lojas.length]} ${String(i + 1).padStart(2, "0")}      R$ ${v.toFixed(2).replace(".", ",")}`);
  }
  linhas[1] = `Vencimento: 01/11/2026    Total da fatura: R$ ${total.toFixed(2).replace(".", ",")}`;
  r = await enviar("fatura-grande.pdf", pdfLongo(linhas), "application/pdf");
  const d2 = r.data.dadosEstruturados ?? {};
  const n2 = d2.compras?.length ?? 0;
  const soma2 = Math.round((d2.compras ?? []).reduce((s, x) => s + x.valor, 0) * 100) / 100;
  check("V2.1 PDF grande foi lido (card de fatura, sem erro 500)", r.status === 200 && d2.tipo === "fatura_detectada", `status=${r.status} ${r.data.error ?? ""}`);
  check("V2.2 as 80 compras vieram (nenhuma perdida por corte da resposta)", n2 === 80, `n=${n2}, soma lida=${soma2}, total impresso=${total.toFixed(2)}`);
  check("V2.3 soma bate com o total impresso (sem aviso de divergência)", Math.abs(soma2 - total) < 0.05 && !d2.avisoTotal, JSON.stringify(d2.avisoTotal));
} catch (err) {
  console.error("ERRO NO ROTEIRO:", err);
  check("roteiro executou até o fim", false, String(err?.message ?? err).slice(0, 200));
} finally {
  await limpar();
  console.log(`\nlimpeza: contas de QA restantes = ${await prisma.cliente.count({ where: { telefone: TEL } })}`);
  await prisma.$disconnect();
  console.log(`\n══ RESUMO: ${resultados.filter(Boolean).length}/${resultados.length} passaram ══`);
  process.exit(0);
}
