// QA de ACESSO: uma conta não pode ver/mexer nos dados de outra, e área de admin exige login.
// Duas contas isTeste PRÓPRIAS (5571900000111 = A, 5571900000222 = B); servidor local :3100.
// node .claude/skills/qa-quitazap/qa-acesso.mjs
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
const TEL_A = "5571900000111";
const TEL_B = "5571900000222";
const SEGREDO = "SEGREDO-DA-CONTA-A";
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
  for (const tel of [TEL_A, TEL_B]) {
    const c = await prisma.cliente.findFirst({ where: { telefone: tel, isTeste: true } });
    if (c) {
      for (const t of ["logIA", "mensagemChat", "eventoAnalytics", "mensagemPendenteRevisao", "lancamentoAuditoria"]) {
        await prisma[t].deleteMany({ where: { clienteId: c.id } });
      }
      await prisma.cliente.delete({ where: { id: c.id } });
    }
    await prisma.botSessao.deleteMany({ where: { telefone: tel } });
  }
}
const get = async (rota, cookie) => {
  const r = await fetch(BASE + rota, { headers: cookie ? { cookie } : {}, redirect: "manual", signal: AbortSignal.timeout(120000) });
  return { status: r.status, loc: r.headers.get("location") ?? "", corpo: await r.text() };
};
const post = async (rota, cookie, corpo = {}) => {
  const r = await fetch(BASE + rota, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(corpo), redirect: "manual", signal: AbortSignal.timeout(120000) });
  return { status: r.status, corpo: await r.text() };
};

try {
  await limpar();
  const { criarSessaoCliente } = carregarTs("src/lib/cliente-auth.ts");
  const mk = (tel, nome) =>
    prisma.cliente.create({ data: { nome, telefone: tel, isTeste: true, gratuito: false, aceitaProativas: true, rendaMensal: 5000, assinaturaVenceEm: new Date(Date.now() + 30 * 86400000) } });
  const A = await mk(TEL_A, "QA Acesso A");
  const B = await mk(TEL_B, "QA Acesso B");
  const cookieA = `qz_cliente_auth=${criarSessaoCliente(A.id)}`;
  const cookieB = `qz_cliente_auth=${criarSessaoCliente(B.id)}`;

  // dados da conta A, todos com um texto-isca
  const cartaoA = await prisma.cartao.create({ data: { clienteId: A.id, nome: `${SEGREDO}-CARTAO` } });
  const lancA = await prisma.lancamento.create({ data: { clienteId: A.id, tipo: "DESPESA_VARIAVEL", descricao: `${SEGREDO}-LANC`, categoria: "Outros", valor: 123.45, data: new Date() } });
  const dividaA = await prisma.divida.create({ data: { clienteId: A.id, credor: `${SEGREDO}-DIVIDA`, tipo: "EMPRESTIMO", status: "ATIVA", valorTotal: 1000, totalParcelas: 2, diaVencimento: 10 } });
  const parcelaA = await prisma.parcela.create({ data: { dividaId: dividaA.id, numero: 1, valor: 500, vencimento: new Date(), status: "PENDENTE" } });
  const tarefaA = await prisma.tarefa.create({ data: { clienteId: A.id, tipo: "LEMBRETE", descricao: `${SEGREDO}-TAREFA`, status: "PENDENTE" } });

  console.log("=== A1  Conta B tenta ver dados da conta A (páginas por ID)");
  for (const [nome, rota] of [
    ["editar lançamento", `/minha-conta/lancamento/${lancA.id}/editar`],
    ["detalhe do empréstimo", `/minha-conta/emprestimos/${dividaA.id}`],
    ["detalhe da dívida", `/minha-conta/dividas/${dividaA.id}`],
    ["editar cartão", `/minha-conta/cartoes/${cartaoA.id}/editar`],
  ]) {
    const r = await get(rota, cookieB);
    check(`A1 ${nome}: B não vê nada da conta A`, !r.corpo.includes(SEGREDO) && r.status !== 500, `status=${r.status}`);
  }
  const dono = await get(`/minha-conta/lancamento/${lancA.id}/editar`, cookieA);
  check("A1.5 (controle) o DONO consegue abrir a própria página", dono.status === 200 && dono.corpo.includes(SEGREDO), `status=${dono.status}`);

  console.log("\n=== A2  Conta B tenta mexer na conta A (APIs por ID)");
  for (const [nome, rota, corpo] of [
    ["editar", `/api/minha-conta/lancamento/${lancA.id}/editar`, { descricao: "HACKEADO", valor: 1 }],
    ["dividir", `/api/minha-conta/lancamento/${lancA.id}/dividir`, { partes: [{ valor: 100 }, { valor: 23.45 }] }],
    ["desfazer", `/api/minha-conta/lancamento/${lancA.id}/desfazer`, {}],
  ]) {
    const r = await post(rota, cookieB, corpo);
    check(`A2 ${nome}: B é recusado`, [400, 401, 403, 404, 409].includes(r.status), `status=${r.status}`);
  }
  const intacto = await prisma.lancamento.findUnique({ where: { id: lancA.id } });
  check("A2.4 o lançamento da conta A continua intacto (existe, mesmo valor e descrição)", intacto && intacto.valor === 123.45 && intacto.descricao === `${SEGREDO}-LANC`, `${intacto?.descricao} ${intacto?.valor}`);
  const g = await get(`/api/minha-conta/lancamento/${lancA.id}`, cookieB);
  check("A2.5 B não lê o lançamento de A pela API", !g.corpo.includes(SEGREDO), `status=${g.status}`);

  console.log("\n=== A3  Listagens e exportações de B não vazam dados de A");
  for (const rota of ["/api/minha-conta/movimentacoes", "/api/minha-conta/exportar-gastos", "/minha-conta/despesas", "/minha-conta/movimentacoes", "/minha-conta/dividas", "/minha-conta/emprestimos", "/minha-conta/cartoes", "/minha-conta/agenda", "/minha-conta/busca?q=SEGREDO"]) {
    const r = await get(rota, cookieB);
    check(`A3 ${rota}`, !r.corpo.includes(SEGREDO) && r.status < 500, `status=${r.status}`);
  }
  const vazio = await get(`/minha-conta/busca?q=SEGREDO`, cookieB);
  // a tela repete o termo digitado; o que NÃO pode aparecer é o CONTEÚDO da conta A
  check("A3.x busca de B por SEGREDO não acha nada da conta A", !/SEGREDO-DA-CONTA-A-(LANC|DIVIDA|CARTAO|TAREFA)/.test(vazio.corpo));

  console.log("\n=== A4  Sem login");
  for (const rota of ["/minha-conta", "/minha-conta/despesas", `/minha-conta/lancamento/${lancA.id}/editar`, "/minha-conta/chat"]) {
    const r = await get(rota);
    check(`A4 ${rota} sem login manda pra entrar`, r.status >= 300 && r.status < 400 && /entrar/.test(r.loc), `status=${r.status} → ${r.loc}`);
  }
  for (const [rota, m] of [["/api/minha-conta/movimentacoes", "get"], ["/api/minha-conta/exportar-gastos", "get"], ["/api/minha-conta/chat/mensagem", "post"], ["/api/minha-conta/fatura/confirmar", "post"], ["/api/minha-conta/boleto/confirmar", "post"], ["/api/minha-conta/emprestimo/confirmar", "post"], [`/api/minha-conta/lancamento/${lancA.id}/desfazer`, "post"]]) {
    const r = m === "get" ? await get(rota) : await post(rota, null, {});
    check(`A4 API ${rota} sem login → 401`, r.status === 401, `status=${r.status}`);
  }

  console.log("\n=== A5  Área de ADMIN sem login");
  for (const rota of ["/clientes", "/painel", "/agentes", "/financeiro", "/assinaturas", "/leads", "/cobrador", "/configuracoes", "/revisao-pendente", "/insights-sombra", "/testar-funil", "/assistente", "/marketing", "/acessos"]) {
    const r = await get(rota);
    check(`A5 ${rota} exige login de admin`, r.status >= 300 && r.status < 400 && /login/.test(r.loc), `status=${r.status} → ${r.loc}`);
  }
  for (const [rota, m] of [["/api/exportar", "get"], ["/api/cobrador", "get"], ["/api/assistente-admin/chat", "post"], ["/api/assistente-admin/confirmar", "post"], ["/api/cobrador/disparar", "post"]]) {
    const r = m === "get" ? await get(rota) : await post(rota, null, {});
    check(`A5 API ${rota} sem cookie de admin recusa`, [401, 403].includes(r.status) || (r.status >= 300 && r.status < 400), `status=${r.status}`);
  }

  console.log("\n=== A6  Rotas públicas legítimas");
  for (const rota of ["/", "/privacidade", "/minha-conta/entrar", "/login"]) {
    const r = await get(rota);
    check(`A6 ${rota} abre sem login`, r.status === 200, `status=${r.status}`);
  }
  const inex = await get("/rota-que-nao-existe-xyz");
  // hoje o middleware manda rota desconhecida pro login do admin (307) — não é erro de servidor, mas é melhoria de UX
  check("A6.5 URL inexistente não gera erro de servidor (404 ou redirecionamento)", inex.status === 404 || (inex.status >= 300 && inex.status < 400), `status=${inex.status}`);
} catch (err) {
  console.error("ERRO NO ROTEIRO:", err);
  check("roteiro executou até o fim", false, String(err?.message ?? err).slice(0, 200));
} finally {
  await limpar();
  console.log(`\nlimpeza: contas de QA restantes = ${await prisma.cliente.count({ where: { telefone: { in: [TEL_A, TEL_B] } } })}`);
  await prisma.$disconnect();
  console.log(`\n══ RESUMO: ${resultados.filter(Boolean).length}/${resultados.length} passaram ══`);
  process.exit(0);
}
