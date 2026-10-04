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

const alertas = loadTsModule("src/lib/agentes/alertas.ts");
const politica = loadTsModule("src/lib/agentes/politica.ts");
const { detectarFeedbackAlerta } = loadTsModule("src/lib/agentes/feedback.ts");
const { chaveDedupe, detectarOrcamento, detectarProjecaoNegativa, detectarFechamentoFatura, detectarAnomalias, ordenarCandidatos, proximoFechamento } = alertas;
const { escolherAlerta, decidirEnvio, emHorarioDeSilencio, bloqueioGlobal } = politica;

// 04/10/2026 11:30 UTC = 08:30 em Brasília (horário do cron)
const MANHA = new Date("2026-10-04T11:30:00Z");

const base = (over = {}) => ({ agora: MANHA, aceitaProativas: true, tiposDesligados: [], historico: [], ...over });

// ── detectores ──────────────────────────────────────────────────────────

test("orçamento: só a faixa mais alta atingida vira candidato (80/90/100)", () => {
  const ctx = { periodKey: "2026-10", diasRestantes: 12 };
  assert.equal(detectarOrcamento([{ categoria: "Alimentação", limite: 900, gasto: 700 }], ctx).length, 0);
  const c80 = detectarOrcamento([{ categoria: "Alimentação", limite: 900, gasto: 738 }], ctx);
  assert.equal(c80.length, 1);
  assert.equal(c80[0].qualifier, "80");
  // números vêm do backend: R$ 162 restantes, 12 dias -> R$ 13,50 por dia
  assert.match(c80[0].mensagem, /82%/);
  assert.match(c80[0].mensagem, /R\$\s?162,00/);
  assert.match(c80[0].mensagem, /R\$\s?13,50/);
  assert.equal(detectarOrcamento([{ categoria: "A", limite: 100, gasto: 95 }], ctx)[0].qualifier, "90");
  // pular de 70% a 130% manda UM alerta de estouro, não três
  const estouro = detectarOrcamento([{ categoria: "A", limite: 100, gasto: 130 }], ctx);
  assert.equal(estouro.length, 1);
  assert.equal(estouro[0].qualifier, "100");
  assert.match(estouro[0].mensagem, /R\$\s?30,00 acima/);
});

test("orçamento: limite zero ou ausente nunca gera alerta nem divisão por zero", () => {
  assert.equal(detectarOrcamento([{ categoria: "A", limite: 0, gasto: 50 }], { periodKey: "2026-10", diasRestantes: 5 }).length, 0);
});

test("projeção negativa: faixas de severidade e silêncio sem dados", () => {
  const ctx = { periodKey: "2026-10" };
  assert.equal(detectarProjecaoNegativa({ saldoLivre: 100, semDadosSuficientes: false, diasRestantes: 10 }, ctx).length, 0);
  assert.equal(detectarProjecaoNegativa({ saldoLivre: -300, semDadosSuficientes: true, diasRestantes: 10 }, ctx).length, 0);
  assert.equal(detectarProjecaoNegativa({ saldoLivre: -300, semDadosSuficientes: false, diasRestantes: 10 }, ctx)[0].qualifier, "BELOW_0");
  assert.equal(detectarProjecaoNegativa({ saldoLivre: -700, semDadosSuficientes: false, diasRestantes: 10 }, ctx)[0].qualifier, "BELOW_500");
  assert.equal(detectarProjecaoNegativa({ saldoLivre: -1500, semDadosSuficientes: false, diasRestantes: 10 }, ctx)[0].qualifier, "BELOW_1000");
});

test("fatura: só avisa quando faltam exatamente 2 dias para o fechamento (calendário de Brasília)", () => {
  // hoje 04/10 -> fecha dia 6 = D-2; dia 10 = D-6; dia 3 = próximo mês (fora)
  const cartoes = [
    { id: "a", nome: "Cartão A", diaFechamento: 6, valorFaturaAberta: 350 },
    { id: "b", nome: "Cartão B", diaFechamento: 10 },
    { id: "c", nome: "Cartão C", diaFechamento: 3 },
    { id: "d", nome: "Sem data", diaFechamento: null },
  ];
  const r = detectarFechamentoFatura(cartoes, MANHA);
  assert.equal(r.length, 1);
  assert.equal(r[0].entityId, "a");
  assert.equal(r[0].periodKey, "2026-10-06");
  assert.match(r[0].mensagem, /R\$\s?350,00/);
  assert.equal(proximoFechamento(3, MANHA).iso, "2026-11-03");
});

test("fatura: virada de ano e dia 31 em mês curto", () => {
  const dez = new Date("2026-12-30T12:00:00Z");
  assert.equal(proximoFechamento(1, dez).iso, "2027-01-01");
  assert.equal(proximoFechamento(1, dez).diasAte, 2);
  const fev = new Date("2026-02-26T12:00:00Z");
  assert.equal(proximoFechamento(31, fev).iso, "2026-02-28");
});

test("anomalia: reaproveita o texto já redigido e a identidade do insight", () => {
  const [c] = detectarAnomalias([{ id: "ins1", categoria: "Lazer", mes: "2026-10", totalMesAtual: 470, mediaUltimosMeses: 240, multiplicador: 1.9, textoGerado: "Seu gasto em Lazer está alto." }]);
  assert.equal(c.entityId, "ins1");
  assert.equal(chaveDedupe(c), "SPENDING_ANOMALY|ins1|ANOMALY|2026-10");
});

test("fechamento do mês: só nos dias 1 a 3, com números do backend e sem mês vazio", () => {
  const f = { nomeMes: "setembro de 2026", periodKey: "2026-09", receitas: 4800, saidas: 4210.5, resultado: 589.5, guardadoEmMetas: 300, topCategoria: { categoria: "Mercado", total: 980 }, quantidadeLancamentos: 40 };
  assert.equal(alertas.detectarFechamentoMes(f, 4).length, 0);
  assert.equal(alertas.detectarFechamentoMes(f, 0).length, 0);
  assert.equal(alertas.detectarFechamentoMes(null, 1).length, 0);
  assert.equal(alertas.detectarFechamentoMes({ ...f, quantidadeLancamentos: 0 }, 1).length, 0);
  const [c] = alertas.detectarFechamentoMes(f, 2);
  assert.equal(chaveDedupe(c), "MONTH_CLOSING|GLOBAL|MONTH|2026-09");
  assert.equal(c.prioridade, 70);
  assert.match(c.mensagem, /setembro de 2026/);
  assert.match(c.mensagem, /R\$\s?4\.800,00/);
  assert.match(c.mensagem, /sobrou: R\$\s?589,50/);
  assert.match(c.mensagem, /Mercado \(R\$\s?980,00\)/);
  assert.match(c.mensagem, /Guardado em metas: R\$\s?300,00/);
  assert.match(alertas.detectarFechamentoMes({ ...f, resultado: -120 }, 1)[0].mensagem, /faltou: R\$\s?120,00/);
});

test("ranking: maior prioridade primeiro, desempate estável", () => {
  const ordem = ordenarCandidatos([
    { tipo: "CARD_CLOSING", entityId: "a", qualifier: "D-2", periodKey: "x", prioridade: 55, mensagem: "" },
    { tipo: "NEGATIVE_PROJECTION", entityId: "GLOBAL", qualifier: "BELOW_0", periodKey: "x", prioridade: 85, mensagem: "" },
    { tipo: "CATEGORY_BUDGET", entityId: "A", qualifier: "80", periodKey: "x", prioridade: 55, mensagem: "" },
  ]).map((c) => c.tipo);
  assert.deepEqual(ordem, ["NEGATIVE_PROJECTION", "CATEGORY_BUDGET", "CARD_CLOSING"]);
});

// ── política ────────────────────────────────────────────────────────────

const cand = (over = {}) => ({ tipo: "CATEGORY_BUDGET", entityId: "Alimentação", qualifier: "80", periodKey: "2026-10", prioridade: 50, mensagem: "m", ...over });

test("silêncio: 21h–8h de Brasília bloqueia; 08:30 libera", () => {
  assert.equal(emHorarioDeSilencio(new Date("2026-10-04T11:30:00Z")), false); // 08:30 BRT
  assert.equal(emHorarioDeSilencio(new Date("2026-10-04T10:59:00Z")), true); // 07:59 BRT
  assert.equal(emHorarioDeSilencio(new Date("2026-10-05T00:30:00Z")), true); // 21:30 BRT
  assert.equal(emHorarioDeSilencio(new Date("2026-10-04T23:59:00Z")), false); // 20:59 BRT
});

test("opt-out global (aceitaProativas e 'TODOS') bloqueia tudo; opt-out por tipo só aquele tipo", () => {
  assert.deepEqual(decidirEnvio(cand(), base({ aceitaProativas: false })), { enviar: false, motivo: "PROATIVAS_DESLIGADAS" });
  assert.deepEqual(decidirEnvio(cand(), base({ tiposDesligados: ["TODOS"] })), { enviar: false, motivo: "PROATIVAS_DESLIGADAS" });
  assert.deepEqual(decidirEnvio(cand(), base({ tiposDesligados: ["CATEGORY_BUDGET"] })), { enviar: false, motivo: "TIPO_DESLIGADO" });
  assert.deepEqual(decidirEnvio(cand({ tipo: "CARD_CLOSING" }), base({ tiposDesligados: ["CATEGORY_BUDGET"] })), { enviar: true });
});

test("dedupe: mesma chave não repete; faixa diferente (90) e mês seguinte liberam", () => {
  const enviado = [{ dedupeKey: chaveDedupe(cand()), tipo: "CATEGORY_BUDGET", enviadoEm: new Date("2026-10-01T11:00:00Z") }];
  assert.deepEqual(decidirEnvio(cand(), base({ historico: enviado })), { enviar: false, motivo: "JA_ENVIADO" });
  assert.deepEqual(decidirEnvio(cand({ qualifier: "90" }), base({ historico: enviado })), { enviar: true });
  assert.deepEqual(decidirEnvio(cand({ periodKey: "2026-11" }), base({ historico: enviado })), { enviar: true });
});

test("cotas: 1 por dia (calendário de Brasília) e 4 por semana", () => {
  const hojeMesmoDia = [{ dedupeKey: "x", tipo: "CARD_CLOSING", enviadoEm: new Date("2026-10-04T11:00:00Z") }];
  assert.equal(bloqueioGlobal(base({ historico: hojeMesmoDia })), "LIMITE_DIARIO");
  const ontem = [{ dedupeKey: "x", tipo: "CARD_CLOSING", enviadoEm: new Date("2026-10-03T11:00:00Z") }];
  assert.equal(bloqueioGlobal(base({ historico: ontem })), null);
  const semana = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"].map((d, i) => ({ dedupeKey: `k${i}`, tipo: "CARD_CLOSING", enviadoEm: new Date(`${d}T11:00:00Z`) }));
  assert.equal(bloqueioGlobal(base({ historico: semana })), "LIMITE_SEMANAL");
});

test("prioridade mínima: candidato fraco nunca sai", () => {
  assert.deepEqual(decidirEnvio(cand({ prioridade: 10 }), base()), { enviar: false, motivo: "PRIORIDADE_BAIXA" });
});

test("agente escolhe o melhor que a política libera e pula os já enviados", () => {
  const projecao = cand({ tipo: "NEGATIVE_PROJECTION", entityId: "GLOBAL", qualifier: "BELOW_0", prioridade: 85 });
  const orc = cand({ prioridade: 50 });
  const jaEnviouProjecao = [{ dedupeKey: chaveDedupe(projecao), tipo: "NEGATIVE_PROJECTION", enviadoEm: new Date("2026-10-02T11:00:00Z") }];
  const r = escolherAlerta([orc, projecao], base({ historico: jaEnviouProjecao }));
  assert.equal(r.escolhido.tipo, "CATEGORY_BUDGET");
  assert.deepEqual(r.pulados, [{ chave: chaveDedupe(projecao), motivo: "JA_ENVIADO" }]);
  // com histórico vazio vence a projeção (mais prioritária)
  assert.equal(escolherAlerta([orc, projecao], base()).escolhido.tipo, "NEGATIVE_PROJECTION");
  // bloqueio global encerra sem escolher ninguém
  const noite = escolherAlerta([orc], base({ agora: new Date("2026-10-05T01:00:00Z") }));
  assert.equal(noite.escolhido, null);
  assert.equal(noite.bloqueioGlobal, "HORARIO_SILENCIO");
});

// ── status dos agentes (tela admin) ─────────────────────────────────────

test("status do agente sai das execuções reais, não de rótulo fixo", () => {
  const { AGENTES, calcularStatusAgente } = loadTsModule("src/lib/agentes/status.ts");
  const sentinela = AGENTES.find((a) => a.chave === "sentinela");
  const quita = AGENTES.find((a) => a.chave === "quita");
  const agora = new Date("2026-10-05T12:00:00Z");
  const h = (horas) => new Date(agora.getTime() - horas * 3_600_000);
  assert.equal(calcularStatusAgente(sentinela, null, agora), "SEM_EXECUCAO");
  assert.equal(calcularStatusAgente(sentinela, { terminadoEm: h(4), sucesso: true }, agora), "OPERANDO");
  assert.equal(calcularStatusAgente(sentinela, { terminadoEm: h(40), sucesso: true }, agora), "ATRASADO");
  assert.equal(calcularStatusAgente(sentinela, { terminadoEm: h(4), sucesso: false }, agora), "ERRO");
  // cobertura incompleta do dia nunca aparece como "operando"
  assert.equal(calcularStatusAgente(sentinela, { terminadoEm: h(1), sucesso: true }, agora, true), "PARCIAL");
  // agente sob demanda não fica "atrasado" por não ter sido usado
  assert.equal(calcularStatusAgente(quita, null, agora), "AGUARDANDO_USO");
  assert.equal(calcularStatusAgente(quita, { terminadoEm: h(500), sucesso: true }, agora), "OPERANDO");
});

// ── feedback do cliente ─────────────────────────────────────────────────

test("feedback: frases exatas, sem sequestrar mensagens comuns", () => {
  assert.equal(detectarFeedbackAlerta("útil"), "UTIL");
  assert.equal(detectarFeedbackAlerta("👍"), "UTIL");
  assert.equal(detectarFeedbackAlerta("Errado!"), "ERRADO");
  assert.equal(detectarFeedbackAlerta("está errado"), "ERRADO");
  assert.equal(detectarFeedbackAlerta("parar esse alerta"), "PARAR_TIPO");
  assert.equal(detectarFeedbackAlerta("não quero esse alerta"), "PARAR_TIPO");
  assert.equal(detectarFeedbackAlerta("parar alertas"), "PARAR_TODOS");
  assert.equal(detectarFeedbackAlerta("desativar alertas"), "PARAR_TODOS");
  assert.equal(detectarFeedbackAlerta("ativar alertas"), "RELIGAR");
  for (const f of ["o valor ficou errado, corrige pra 50", "gastei 50 no mercado", "quanto é minha fatura", "isso foi útil pra mim ontem quando comprei", "desfazer", ""]) {
    assert.equal(detectarFeedbackAlerta(f), null, f);
  }
});

// ── lotes, checkpoint e cobertura ───────────────────────────────────────

const lotes = loadTsModule("src/lib/agentes/lotes.ts");

test("500 clientes em vários lotes: cada um avaliado exatamente uma vez, checkpoint conclui no fim", () => {
  const ids = Array.from({ length: 500 }, (_, i) => `c${String(i).padStart(4, "0")}`);
  const vistos = [];
  let cob = null;
  let execucoes = 0;
  while (!(cob && cob.concluido) && execucoes < 20) {
    const lote = lotes.selecionarLote(ids, cob?.cursor ?? null, 100);
    cob = lotes.atualizarCobertura(cob, "2026-10-05", lote, ids);
    vistos.push(...lote);
    execucoes++;
  }
  assert.equal(execucoes, 5);
  assert.equal(vistos.length, 500);
  assert.equal(new Set(vistos).size, 500); // nenhum duplicado, nenhum pulado
  assert.deepEqual(vistos, ids);
  assert.deepEqual(cob, { dia: "2026-10-05", cursor: "c0499", avaliados: 500, total: 500, concluido: true });
  assert.equal(lotes.rotuloCobertura(cob, "2026-10-05"), "CONCLUIDO");
});

test("tempo esgotado no meio do lote: checkpoint para onde parou e o próximo lote retoma dali", () => {
  const ids = Array.from({ length: 250 }, (_, i) => `c${String(i).padStart(4, "0")}`);
  let cob = null;
  const lote1 = lotes.selecionarLote(ids, null, 100);
  const processados1 = lote1.slice(0, 37); // só 37 couberam no tempo
  cob = lotes.atualizarCobertura(cob, "2026-10-05", processados1, ids);
  assert.equal(cob.avaliados, 37);
  assert.equal(cob.concluido, false);
  assert.equal(lotes.rotuloCobertura(cob, "2026-10-05"), "PARCIAL");
  const lote2 = lotes.selecionarLote(ids, cob.cursor, 100);
  assert.equal(lote2[0], "c0037"); // sem pular ninguém
  assert.equal(lote2.length, 100);
});

test("cobertura é por dia: dia novo recomeça do zero", () => {
  const ids = ["a", "b", "c"];
  const ontem = lotes.atualizarCobertura(null, "2026-10-04", ids, ids);
  assert.equal(ontem.concluido, true);
  const hoje = lotes.atualizarCobertura(ontem, "2026-10-05", ["a"], ids);
  assert.equal(hoje.avaliados, 1);
  assert.equal(hoje.concluido, false);
  assert.equal(lotes.rotuloCobertura(ontem, "2026-10-05"), "SEM_DADOS");
  // base vazia: concluído sem avaliar ninguém
  assert.equal(lotes.atualizarCobertura(null, "2026-10-05", [], []).concluido, true);
});

test("sem starvation: 5 candidatos simultâneos saem todos, um por dia, na ordem de prioridade, sem repetir", () => {
  const mk = (tipo, entityId, qualifier, prioridade) => ({ tipo, entityId, qualifier, periodKey: "2026-10", prioridade, mensagem: "m" });
  const candidatos = [
    mk("CATEGORY_BUDGET", "Alimentação", "80", 50),
    mk("CARD_CLOSING", "c1", "D-2", 55),
    mk("NEGATIVE_PROJECTION", "GLOBAL", "BELOW_0", 85),
    mk("MONTH_CLOSING", "GLOBAL", "MONTH", 70),
    mk("SPENDING_ANOMALY", "i1", "ANOMALY", 40),
  ];
  const historico = [];
  const ordemEnvio = [];
  for (let dia = 5; dia <= 10; dia++) {
    const agora = new Date(`2026-10-${String(dia).padStart(2, "0")}T11:30:00Z`);
    const r = escolherAlerta(candidatos, { agora, aceitaProativas: true, tiposDesligados: [], historico });
    if (r.escolhido) {
      ordemEnvio.push(r.escolhido.tipo);
      historico.push({ dedupeKey: chaveDedupe(r.escolhido), tipo: r.escolhido.tipo, enviadoEm: agora });
    }
  }
  // limite semanal (4/7 dias) segura o 5º até a semana andar; os 4 primeiros seguem a prioridade
  assert.deepEqual(ordemEnvio.slice(0, 4), ["NEGATIVE_PROJECTION", "MONTH_CLOSING", "CARD_CLOSING", "CATEGORY_BUDGET"]);
  assert.equal(new Set(ordemEnvio).size, ordemEnvio.length); // nunca repete
});

test("métricas por tipo: enviados, úteis, errados, silenciados e utilidade com n", () => {
  const { agregarMetricasPorTipo } = loadTsModule("src/lib/agentes/status.ts");
  const m = agregarMetricasPorTipo(
    ["CATEGORY_BUDGET", "CATEGORY_BUDGET", "CATEGORY_BUDGET", "CARD_CLOSING"],
    ["CATEGORY_BUDGET|Mercado|80|2026-10#UTIL", "CATEGORY_BUDGET|Mercado|90|2026-10#UTIL", "CATEGORY_BUDGET|Lazer|80|2026-10#ERRADO", "CARD_CLOSING|c1|D-2|2026-10-06#ERRADO"],
    ["CARD_CLOSING", "TODOS"]
  );
  const orc = m.find((x) => x.tipo === "CATEGORY_BUDGET");
  assert.deepEqual([orc.enviados, orc.uteis, orc.errados, orc.silenciados, orc.respostas], [3, 2, 1, 0, 3]);
  assert.ok(Math.abs(orc.utilidade - 2 / 3) < 1e-9);
  const card = m.find((x) => x.tipo === "CARD_CLOSING");
  assert.deepEqual([card.enviados, card.errados, card.silenciados, card.utilidade], [1, 1, 1, 0]);
  const todos = m.find((x) => x.tipo === "TODOS");
  assert.equal(todos.silenciados, 1);
  assert.equal(todos.utilidade, null); // sem feedback: nada a concluir
  assert.equal(m[0].tipo, "CATEGORY_BUDGET"); // ordenado por enviados
});

test("elegibilidade dos agentes: cortesia (gratuito) tem acesso total; teste e assinatura vencida ficam de fora", () => {
  const { whereTemAcesso } = loadTsModule("src/lib/status-assinatura.ts");
  const agora = new Date("2026-10-05T11:30:00Z");
  const w = whereTemAcesso(agora);
  assert.equal(w.isTeste, false); // cadastro de teste nunca recebe alerta real
  const [cortesia, pago] = w.OR;
  assert.deepEqual(cortesia, { gratuito: true }); // cortesia/fundador: tudo liberado, sem relógio de cobrança
  assert.equal(pago.gratuito, false);
  assert.deepEqual(pago.OR, [{ assinaturaVenceEm: null }, { assinaturaVenceEm: { gte: agora } }]); // vencida não entra
});
