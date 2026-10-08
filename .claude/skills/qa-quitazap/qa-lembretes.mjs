// QA do cron de lembretes (D-3/D-1/D0) com conta isTeste PRÓPRIA e relógio simulado (?agora=).
// Servidor local com CRON_SECRET=qa-cron (ver SKILL.md). Nunca roda sem ?clienteId=.
// node .claude/skills/qa-quitazap/qa-lembretes.mjs
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
const TEL = "5571900005555";
const SEGREDO = process.env.QA_CRON_SECRET ?? "qa-cron";
const prisma = new PrismaClient();
const resultados = [];
const check = (nome, ok, extra = "") => {
  resultados.push(ok);
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
  await prisma.auditoriaAssistente.deleteMany({ where: { ferramenta: { startsWith: "agente:" } } });
}

const cron = async (clienteId, agora, bearer = SEGREDO) => {
  const r = await fetch(`${BASE}/api/cron/lembretes?clienteId=${clienteId}&agora=${encodeURIComponent(agora)}`, { headers: { authorization: `Bearer ${bearer}` } });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const dia = (iso) => new Date(`${iso}T12:00:00Z`);

try {
  await limpar();
  const { criarSessaoCliente } = carregarTs("src/lib/cliente-auth.ts");
  const c = await prisma.cliente.create({
    data: { nome: "QA Lembretes", telefone: TEL, isTeste: true, gratuito: false, aceitaProativas: true, rendaMensal: 5000, assinaturaVenceEm: new Date(Date.now() + 30 * 86400000) },
  });
  // cria a sessão do bot (precisa de telefone na BotSessao pro envio)
  await fetch(`${BASE}/api/minha-conta/chat/mensagem`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `qz_cliente_auth=${criarSessaoCliente(c.id)}` },
    body: JSON.stringify({ mensagem: "oi" }),
  });

  const mk = async (credor, extra, parcelas = []) => {
    const d = await prisma.divida.create({ data: { clienteId: c.id, credor, tipo: "EMPRESTIMO", status: "ATIVA", valorTotal: extra.valorTotal ?? 1000, ...extra } });
    for (const [i, p] of parcelas.entries()) {
      await prisma.parcela.create({ data: { dividaId: d.id, numero: i + 1, valor: p.valor, vencimento: dia(p.venc), status: p.status ?? "PENDENTE" } });
    }
    return d;
  };
  // 1) empréstimo com parcela ATRASADA não paga + próxima em 10/10 (265,77) — total 1328,85
  await mk("EMP-ATRASADA", { valorTotal: 1328.85, totalParcelas: 3 }, [
    { valor: 265.77, venc: "2026-09-10" },
    { valor: 265.77, venc: "2026-10-10" },
    { valor: 265.77, venc: "2026-11-10" },
  ]);
  // 2) parcelada com próxima parcela só em dezembro
  await mk("EMP-DISTANTE", { valorTotal: 61.8, totalParcelas: 3, diaVencimento: 1 }, [
    { valor: 30.9, venc: "2026-12-01" },
    { valor: 30.9, venc: "2027-01-01" },
  ]);
  // 3) parcela da janela mas JÁ PAGA
  await mk("EMP-PAGA", { valorTotal: 100, totalParcelas: 1 }, [{ valor: 100, venc: "2026-10-10", status: "PAGA" }]);
  // 4) avulsa dia 1 (virada de mês) e 5) avulsa dia 31 (mês curto)
  await mk("AVULSA-DIA1", { valorTotal: 77.7, diaVencimento: 1 });
  await mk("AVULSA-DIA31", { valorTotal: 88.8, diaVencimento: 31 });

  console.log("\n=== 07/10 08:00 (Brasília)");
  let r = await cron(c.id, "2026-10-07T11:00:00Z");
  const env1 = r.data.enviados ?? [];
  check("200 e só EMP-ATRASADA avisa (parcela atrasada não bloqueia)", r.status === 200 && env1.length === 1 && env1[0].credor === "EMP-ATRASADA", JSON.stringify(env1));
  check("aviso usa o valor da PARCELA (265,77), não o total (1328,85)", env1[0]?.valor === 265.77 && env1[0]?.dias === 3);

  console.log("\n=== 29/10 (virada de mês: dia 1 está a 3 dias)");
  r = await cron(c.id, "2026-10-29T11:00:00Z");
  const env2 = (r.data.enviados ?? []).map((e) => e.credor);
  check("AVULSA-DIA1 avisa em D-3 cruzando o mês", env2.includes("AVULSA-DIA1"), env2.join());
  check("parcela de dezembro ainda NÃO avisa em 29/10", !env2.includes("EMP-DISTANTE"));

  console.log("\n=== 28/11 (3 dias antes de 01/12)");
  r = await cron(c.id, "2026-11-28T11:00:00Z");
  const env3 = r.data.enviados ?? [];
  check("EMP-DISTANTE avisa 30,90 em 28/11 (D-3 de 01/12)", env3.some((e) => e.credor === "EMP-DISTANTE" && e.valor === 30.9 && e.dias === 3), JSON.stringify(env3));

  console.log("\n=== 27/04/2027 (mês curto: dia 31 vence dia 30)");
  r = await cron(c.id, "2027-04-27T11:00:00Z");
  check("AVULSA-DIA31 avisa em D-3 no mês de 30 dias", (r.data.enviados ?? []).some((e) => e.credor === "AVULSA-DIA31"), JSON.stringify(r.data.enviados));

  console.log("\n=== Nenhuma dívida na janela");
  r = await cron(c.id, "2026-10-15T11:00:00Z");
  check("15/10: ninguém avisa (nada em D-3/D-1/D0)", (r.data.enviados ?? []).length === 0, JSON.stringify(r.data.enviados));

  console.log("\n=== Cliente que não aceita proativas");
  await prisma.cliente.update({ where: { id: c.id }, data: { aceitaProativas: false } });
  r = await cron(c.id, "2026-10-07T11:00:00Z");
  check("aceitaProativas=false → não envia nada", (r.data.enviados ?? []).length === 0);
  await prisma.cliente.update({ where: { id: c.id }, data: { aceitaProativas: true } });

  console.log("\n=== Segurança");
  const semCred = await fetch(`${BASE}/api/cron/lembretes?clienteId=${c.id}`);
  const antigo = await fetch(`${BASE}/api/cron/lembretes?clienteId=${c.id}`, { headers: { "x-internal-call": "1" } });
  const errado = await cron(c.id, "2026-10-07T11:00:00Z", "errado");
  check("sem credencial → 401", semCred.status === 401, `status=${semCred.status}`);
  check("cabeçalho x-internal-call (antigo) → 401", antigo.status === 401, `status=${antigo.status}`);
  check("Bearer errado → 401", errado.status === 401, `status=${errado.status}`);
} catch (err) {
  console.error("ERRO NO ROTEIRO:", err);
  check("roteiro executou até o fim", false, String(err?.message ?? err).slice(0, 200));
} finally {
  await limpar();
  const sobras = await prisma.cliente.count({ where: { telefone: TEL } });
  console.log(`\nlimpeza: contas de QA restantes = ${sobras}`);
  await prisma.$disconnect();
  console.log(`\n══ RESUMO: ${resultados.filter(Boolean).length}/${resultados.length} passaram ══`);
  process.exit(0);
}
