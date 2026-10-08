// QA da JORNADA DE COMPRA (o que decide se dá pra vender): aviso da Cakto → cliente criado →
// boas-vindas com link → criar senha → entrar → renovação → duplicata → reembolso (bloqueio no app
// E no WhatsApp) → recompra (libera de novo). Servidor local COM CAKTO_SECRET=qa-cakto (ver SKILL.md).
// Cria um cliente REAL de teste (não isTeste, pra exercitar o bloqueio) com telefone 5571988884444
// e remove tudo no fim (cliente, sessão e eventos 'qa-compra-*').
// node .claude/skills/qa-quitazap/qa-compra.mjs
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const l of fs.readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").replace(/\r$/, "");
}
const BASE = "http://localhost:3100";
const SEGREDO = process.env.QA_CAKTO_SECRET ?? "qa-cakto";
const TEL = "5571988884444"; // com o 9
const TEL_SEM9 = "557188884444"; // mesmo número, formato antigo
const prisma = new PrismaClient();
const resultados = [];
const check = (nome, ok, extra = "") => {
  resultados.push(!!ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${extra ? " — " + extra : ""}`);
};
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const DIA = 86400000;

async function limpar() {
  const cs = await prisma.cliente.findMany({ where: { telefone: { in: [TEL, TEL_SEM9] } }, select: { id: true } });
  for (const c of cs) {
    for (const t of ["logIA", "mensagemChat", "eventoAnalytics", "mensagemPendenteRevisao", "lancamentoAuditoria", "eventoCakto"]) {
      await prisma[t].deleteMany({ where: { clienteId: c.id } }).catch(() => {});
    }
    await prisma.cliente.delete({ where: { id: c.id } });
  }
  await prisma.botSessao.deleteMany({ where: { telefone: { in: [TEL, TEL_SEM9] } } });
  await prisma.eventoCakto.deleteMany({ where: { transacaoId: { startsWith: "qa-compra" } } });
}

const cakto = async (corpo, { cabecalhos = {}, query = "" } = {}) => {
  const r = await fetch(`${BASE}/api/webhook/cakto${query}`, { method: "POST", headers: { "Content-Type": "application/json", ...cabecalhos }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(60000) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const evento = (event, transacao, extra = {}) => ({
  secret: SEGREDO,
  event,
  data: { id: transacao, amount: 29.9, customer: { name: "QA Compra", phone: "+55 (71) 98888-4444", email: "qa.compra@example.com" }, offer: { name: "QuitaZAP Controle" }, ...extra },
});
const cliente = () => prisma.cliente.findFirst({ where: { telefone: { in: [TEL, TEL_SEM9] } } });
const zap = async (texto) => {
  const pos = fs.statSync("_dev.log").size;
  await fetch(`${BASE}/api/webhook/zapi?secret=qa-wh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "ReceivedCallback", phone: TEL, messageId: `qa-${Date.now()}-${Math.random()}`, text: { message: texto }, fromMe: false }),
    signal: AbortSignal.timeout(120000),
  });
  await dorme(2500);
  const fd = fs.openSync("_dev.log", "r");
  const buf = Buffer.alloc(fs.statSync("_dev.log").size - pos);
  fs.readSync(fd, buf, 0, buf.length, pos);
  fs.closeSync(fd);
  return buf.toString("utf8");
};

try {
  await limpar();

  console.log("=== C1  Segurança do aviso");
  let r = await cakto({ ...evento("purchase_approved", "qa-compra-x"), secret: "errado" });
  check("C1.1 segredo errado → 401", r.status === 401, `status=${r.status}`);
  const { secret: _s, ...semSegredo } = evento("purchase_approved", "qa-compra-x");
  r = await cakto(semSegredo);
  check("C1.2 sem segredo → 401", r.status === 401, `status=${r.status}`);
  check("C1.3 nada foi criado pelos avisos recusados", (await cliente()) === null);

  console.log("\n=== C2  Compra aprovada");
  r = await cakto(evento("purchase_approved", "qa-compra-1"));
  check("C2.1 compra aprovada → 200", r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
  let c = await cliente();
  check("C2.2 cliente criado com o telefone normalizado", c?.telefone === TEL && c.nome === "QA Compra" && c.gratuito === false, `${c?.telefone} ${c?.nome}`);
  const venc1 = c?.assinaturaVenceEm?.getTime() ?? 0;
  check("C2.3 assinatura válida por 30 dias", Math.abs(venc1 - (Date.now() + 30 * DIA)) < 5 * 60000, new Date(venc1).toISOString());
  const sessao = await prisma.botSessao.findFirst({ where: { telefone: TEL } });
  const link = String(sessao?.dividasTemp ?? "").match(/primeiro-acesso\?t=([A-Za-z0-9_\-]+)/);
  check("C2.4 boas-vindas guardam o link de primeiro acesso", !!link, link ? "link ok" : "sem link");
  check("C2.5 evento registrado como APROVADA", (await prisma.eventoCakto.count({ where: { transacaoId: "qa-compra-1#APROVADA", status: "APROVADA" } })) === 1);

  console.log("\n=== C3  Aviso duplicado (a Cakto reenvia)");
  r = await cakto(evento("purchase_approved", "qa-compra-1"));
  c = await cliente();
  check("C3.1 duplicata é ignorada (duplicate=true) e a assinatura NÃO é renovada de novo", r.data.duplicate === true && c.assinaturaVenceEm.getTime() === venc1, JSON.stringify(r.data));
  check("C3.2 continua 1 cliente só", (await prisma.cliente.count({ where: { telefone: { in: [TEL, TEL_SEM9] } } })) === 1);

  console.log("\n=== C4  Primeiro acesso: criar senha e entrar");
  const token = link?.[1] ?? "";
  r = await fetch(`${BASE}/api/auth-cliente/primeiro-acesso`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, senha: "curta" }) });
  check("C4.1 senha curta é recusada (400)", r.status === 400, `status=${r.status}`);
  r = await fetch(`${BASE}/api/auth-cliente/primeiro-acesso`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "lixo", senha: "SenhaForte123!" }) });
  check("C4.2 token inválido é recusado (400)", r.status === 400, `status=${r.status}`);
  r = await fetch(`${BASE}/api/auth-cliente/primeiro-acesso`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, senha: "SenhaForte123!" }) });
  const setCookie = r.headers.get("set-cookie") ?? "";
  check("C4.3 link válido cria a senha e já entra (cookie de sessão)", r.status === 200 && /qz_cliente_auth=/.test(setCookie), `status=${r.status}`);
  const cookie = setCookie.match(/qz_cliente_auth=[^;]+/)?.[0] ?? "";
  r = await fetch(`${BASE}/api/auth-cliente/primeiro-acesso`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, senha: "OutraSenha456!" }) });
  check("C4.4 o MESMO link não funciona de novo (uso único)", r.status === 400, `status=${r.status}`);
  r = await fetch(`${BASE}/api/auth-cliente/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ telefone: "(71) 98888-4444", senha: "SenhaForte123!" }) });
  check("C4.5 login com telefone formatado + senha → 200", r.status === 200, `status=${r.status}`);
  r = await fetch(`${BASE}/api/auth-cliente/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ telefone: "5571988884444", senha: "senha-errada" }) });
  check("C4.6 senha errada → 401", r.status === 401, `status=${r.status}`);
  r = await fetch(`${BASE}/minha-conta`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(120000) });
  let html = await r.text();
  check("C4.7 com assinatura ativa o app abre normalmente", r.status === 200 && !/Sua assinatura venceu/.test(html), `status=${r.status}`);

  console.log("\n=== C5  Renovação (outro pagamento, número em outro formato, segredo no cabeçalho)");
  const antes = (await cliente()).assinaturaVenceEm.getTime();
  const ev5 = evento("purchase_approved", "qa-compra-2");
  ev5.data.customer.phone = "5571 8888-4444"; // sem o 9
  delete ev5.secret;
  r = await cakto(ev5, { cabecalhos: { "x-cakto-secret": SEGREDO } });
  c = await cliente();
  check("C5.1 segredo no cabeçalho também é aceito", r.status === 200, `status=${r.status}`);
  check("C5.2 mesmo cliente (sem duplicar pelo 9 a mais/a menos)", (await prisma.cliente.count({ where: { telefone: { in: [TEL, TEL_SEM9] } } })) === 1);
  check("C5.3 renovação soma 30 dias ao que já estava pago (não come os dias)", Math.abs(c.assinaturaVenceEm.getTime() - (antes + 30 * DIA)) < 60000, `+${Math.round((c.assinaturaVenceEm.getTime() - antes) / DIA)} dias`);

  console.log("\n=== C6  Outros avisos");
  const semFone = evento("purchase_approved", "qa-compra-3");
  delete semFone.data.customer.phone;
  r = await cakto(semFone);
  check("C6.1 compra sem telefone → 400 (não cria cliente fantasma)", r.status === 400, `status=${r.status}`);
  r = await cakto(evento("purchase_pending", "qa-compra-4"));
  check("C6.2 evento que não é compra aprovada é registrado e ignorado (não renova)", r.status === 200 && (await cliente()).assinaturaVenceEm.getTime() === c.assinaturaVenceEm.getTime(), JSON.stringify(r.data));

  console.log("\n=== C7  Reembolso: bloqueia no APP e no WHATSAPP");
  r = await cakto(evento("purchase_refunded", "qa-compra-5"));
  c = await cliente();
  check("C7.1 reembolso expira a assinatura na hora", r.status === 200 && c.assinaturaVenceEm.getTime() <= Date.now() + 1000, `status=${r.data.status}`);
  r = await fetch(`${BASE}/minha-conta`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(120000) });
  html = await r.text();
  check("C7.2 o app mostra 'Sua assinatura venceu' no lugar do conteúdo", /Sua assinatura venceu/.test(html), `status=${r.status}`);
  r = await fetch(`${BASE}/api/minha-conta/chat/mensagem`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ mensagem: "gastei 10 no mercado" }) });
  check("C7.3 chat do app → 402 (não registra, não gasta IA)", r.status === 402, `status=${r.status}`);
  const fd = new FormData();
  fd.set("arquivo", new File([fs.readFileSync("tests/fixtures/Nubank_2026-11-01.ofx")], "Nubank_2026-11-01.ofx"));
  r = await fetch(`${BASE}/api/minha-conta/chat/arquivo`, { method: "POST", headers: { cookie }, body: fd });
  check("C7.4 envio de fatura pelo app → 402", r.status === 402, `status=${r.status}`);
  const log = await zap("gastei 10 no mercado");
  const lancs = await prisma.lancamento.count({ where: { clienteId: c.id } });
  check("C7.5 WhatsApp responde que a assinatura venceu e NÃO registra", /assinatura/i.test(log) && /venceu/i.test(log) && lancs === 0, `lanc=${lancs}`);

  console.log("\n=== C8  Chargeback e cancelamento também expiram");
  await prisma.cliente.update({ where: { id: c.id }, data: { assinaturaVenceEm: new Date(Date.now() + 20 * DIA) } });
  r = await cakto(evento("subscription_canceled", "qa-compra-6"));
  check("C8.1 cancelamento expira a assinatura", (await cliente()).assinaturaVenceEm.getTime() <= Date.now() + 1000, JSON.stringify(r.data));
  await prisma.cliente.update({ where: { id: c.id }, data: { assinaturaVenceEm: new Date(Date.now() + 20 * DIA) } });
  r = await cakto(evento("chargeback", "qa-compra-7"));
  check("C8.2 chargeback expira a assinatura", (await cliente()).assinaturaVenceEm.getTime() <= Date.now() + 1000, JSON.stringify(r.data));

  console.log("\n=== C9  Recompra: libera de novo, dados preservados");
  r = await cakto(evento("purchase_approved", "qa-compra-8"));
  c = await cliente();
  check("C9.1 nova compra reativa por 30 dias a partir de agora", Math.abs(c.assinaturaVenceEm.getTime() - (Date.now() + 30 * DIA)) < 5 * 60000);
  r = await fetch(`${BASE}/minha-conta`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(120000) });
  html = await r.text();
  check("C9.2 o app volta a abrir", r.status === 200 && !/Sua assinatura venceu/.test(html), `status=${r.status}`);
  r = await fetch(`${BASE}/api/minha-conta/chat/mensagem`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ mensagem: "gastei 10 no mercado" }), signal: AbortSignal.timeout(120000) });
  check("C9.3 o chat volta a registrar", r.status === 200, `status=${r.status}`);

  console.log("\n=== C11  Reembolso com o MESMO id do pedido original e renovação mensal");
  await prisma.cliente.update({ where: { id: c.id }, data: { gratuito: false, assinaturaVenceEm: new Date(Date.now() + 20 * DIA) } });
  r = await cakto(evento("purchase_refunded", "qa-compra-1"));
  c = await cliente();
  check("C11.1 reembolso com o MESMO id da compra NÃO é tratado como duplicata (expira o acesso)", r.data.duplicate !== true && c.assinaturaVenceEm.getTime() <= Date.now() + 1000, JSON.stringify(r.data));
  r = await cakto(evento("purchase_refunded", "qa-compra-1"));
  check("C11.2 o mesmo reembolso reenviado É duplicata (idempotente)", r.data.duplicate === true, JSON.stringify(r.data));
  await prisma.cliente.update({ where: { id: c.id }, data: { assinaturaVenceEm: new Date(Date.now() + 10 * DIA) } });
  const antesRenov = (await cliente()).assinaturaVenceEm.getTime();
  r = await cakto(evento("subscription_renewed", "qa-compra-1"));
  c = await cliente();
  check("C11.3 renovação mensal (subscription_renewed) soma 30 dias, mesmo com o id do pedido original", r.status === 200 && Math.abs(c.assinaturaVenceEm.getTime() - (antesRenov + 30 * DIA)) < 60000, `+${Math.round((c.assinaturaVenceEm.getTime() - antesRenov) / DIA)} dias`);
  r = await cakto(evento("subscription_renewed", "qa-compra-1"));
  check("C11.4 a mesma renovação reenviada no mesmo dia é duplicata (não soma 2x)", r.data.duplicate === true && (await cliente()).assinaturaVenceEm.getTime() === c.assinaturaVenceEm.getTime(), JSON.stringify(r.data));
  const antesRecusa = (await cliente()).assinaturaVenceEm.getTime();
  r = await cakto(evento("subscription_renewal_refused", "qa-compra-9"));
  check("C11.5 renovação RECUSADA não renova", (await cliente()).assinaturaVenceEm.getTime() === antesRecusa, JSON.stringify(r.data));

  console.log("\n=== C10  Cortesia nunca é bloqueada");
  await prisma.cliente.update({ where: { id: c.id }, data: { gratuito: true, assinaturaVenceEm: new Date(Date.now() - 60 * DIA) } });
  r = await fetch(`${BASE}/minha-conta`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(120000) });
  html = await r.text();
  check("C10.1 cortesia com data vencida continua com acesso", r.status === 200 && !/Sua assinatura venceu/.test(html), `status=${r.status}`);
} catch (err) {
  console.error("ERRO NO ROTEIRO:", err);
  check("roteiro executou até o fim", false, String(err?.message ?? err).slice(0, 200));
} finally {
  await limpar();
  console.log(`\nlimpeza: clientes de QA restantes = ${await prisma.cliente.count({ where: { telefone: { in: [TEL, TEL_SEM9] } } })}`);
  await prisma.$disconnect();
  console.log(`\n══ RESUMO: ${resultados.filter(Boolean).length}/${resultados.length} passaram ══`);
  process.exit(0);
}
