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
const det = loadTsModule("src/lib/agentes/detectores-agentes.ts");
const politica = loadTsModule("src/lib/agentes/politica.ts");
const { chaveDedupe, AGENTE_DO_TIPO, TOPICO_DO_TIPO, dicaDoCoach } = alertas;
const { escolherAlerta, agentesPausadosPorDisjuntor, decidirEnvio } = politica;

// segunda-feira 05/10/2026, 08:30 em Brasília (11:30 UTC)
const SEGUNDA = new Date("2026-10-05T11:30:00Z");
// terça-feira
const TERCA = new Date("2026-10-06T11:30:00Z");
const base = (over = {}) => ({ agora: TERCA, aceitaProativas: true, tiposDesligados: [], historico: [], ...over });
const dia = (iso) => new Date(`${iso}T15:00:00Z`);

// ── tabela de prioridades por evento ────────────────────────────────────

test("prioridades seguem a tabela acordada (dívida 100 > cartão 100% 98 > projeção severa 96 > orçamento 100% 94 ...)", () => {
  const orc = (gasto) => alertas.detectarOrcamento([{ categoria: "A", limite: 100, gasto }], { periodKey: "2026-10", diasRestantes: 20 })[0].prioridade;
  assert.deepEqual([orc(100), orc(90), orc(80)], [94, 88, 78]);
  const proj = (v) => alertas.detectarProjecaoNegativa({ saldoLivre: v, semDadosSuficientes: false, diasRestantes: 5 }, { periodKey: "x" })[0].prioridade;
  assert.deepEqual([proj(-1500), proj(-300)], [96, 90]);
  const lim = (comp) => det.detectarLimiteCartao([{ id: "c", nome: "N", limite: 1000, comprometido: comp }], "2026-10")[0].prioridade;
  assert.deepEqual([lim(1000), lim(900), lim(800)], [98, 92, 84]);
  assert.equal(alertas.detectarFechamentoFatura([{ id: "c", nome: "N", diaFechamento: 7 }], SEGUNDA)[0].prioridade, 82);
  assert.equal(det.detectarDividasAtrasadas([{ credor: "X", numero: 1, valor: 100, vencimento: dia("2026-10-01") }], SEGUNDA)[0].prioridade, 100);
});

// ── agente CARTÕES ──────────────────────────────────────────────────────

test("cartões: limite comprometido 80/90/100 (só a faixa mais alta) e sem limite não alerta", () => {
  const r = det.detectarLimiteCartao(
    [
      { id: "a", nome: "A", limite: 1000, comprometido: 850 },
      { id: "b", nome: "B", limite: null, comprometido: 5000 },
      { id: "c", nome: "C", limite: 1000, comprometido: 500 },
    ],
    "2026-10"
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].qualifier, "80");
  assert.match(r[0].mensagem, /85%/);
  assert.match(r[0].mensagem, /R\$\s?150,00/);
});

test("cartões: próxima fatura pesada exige 30% da renda E piso de R$ 300", () => {
  const f = (valor) => ({ cartaoId: "c", cartaoNome: "Nubank", rotulo: "Nov/2026", periodoFatura: "Nov/2026", valor });
  assert.equal(det.detectarFaturaFuturaPesada([f(970)], 3000).length, 1); // 32%
  assert.equal(det.detectarFaturaFuturaPesada([f(800)], 3000).length, 0); // 26%
  assert.equal(det.detectarFaturaFuturaPesada([f(250)], 700).length, 0); // 35% mas abaixo do piso
  assert.equal(det.detectarFaturaFuturaPesada([f(970)], null).length, 0); // renda desconhecida
});

// ── agente COMPROMISSOS ─────────────────────────────────────────────────

test("compromissos: resumo semanal só na segunda-feira, com total e no máximo 5 linhas", () => {
  const itens = [
    { descricao: "Pagar luz", data: dia("2026-10-07"), valor: 150 },
    { descricao: "Parcela 2 de Carlos", data: dia("2026-10-05"), valor: 500 },
    { descricao: "Ligar pro banco", data: dia("2026-10-09"), valor: null },
    { descricao: "Longe demais", data: dia("2026-10-20"), valor: 999 },
  ];
  assert.equal(det.detectarCompromissosDaSemana(itens, TERCA).length, 0);
  const [c] = det.detectarCompromissosDaSemana(itens, SEGUNDA);
  assert.equal(c.periodKey, "2026-10-05");
  assert.match(c.mensagem, /3 compromissos/);
  assert.match(c.mensagem, /R\$\s?650,00/); // 150 + 500; o de 20/10 fica de fora
  assert.doesNotMatch(c.mensagem, /Longe demais/);
  assert.equal(det.detectarCompromissosDaSemana([], SEGUNDA).length, 0);
  const muitos = Array.from({ length: 8 }, (_, i) => ({ descricao: `c${i}`, data: dia("2026-10-06"), valor: 10 }));
  assert.match(det.detectarCompromissosDaSemana(muitos, SEGUNDA)[0].mensagem, /e mais 3/);
});

// ── agente METAS ────────────────────────────────────────────────────────

test("metas: marco mais alto atingido (uma vez na vida) e meta parada há 30 dias", () => {
  const m = (guardado, ultima) => ({ id: "m1", nome: "Viagem", alvo: 2000, guardado, ultimaAtividade: dia(ultima) });
  const marco = det.detectarMetas([m(1100, "2026-10-01")], SEGUNDA);
  assert.equal(marco.length, 1);
  assert.equal(marco[0].qualifier, "50");
  assert.equal(marco[0].periodKey, "VIDA");
  assert.equal(det.detectarMetas([m(300, "2026-10-01")], SEGUNDA).length, 0); // 15%: sem marco, nem parada
  const parada = det.detectarMetas([m(300, "2026-08-20")], SEGUNDA);
  assert.equal(parada.length, 1);
  assert.equal(parada[0].tipo, "GOAL_STALLED");
  // meta concluída comemora, não vira "parada"
  const concluida = det.detectarMetas([m(2000, "2026-06-01")], SEGUNDA);
  assert.deepEqual(concluida.map((c) => c.tipo), ["GOAL_MILESTONE"]);
  assert.match(concluida[0].mensagem, /concluída/);
});

// ── agente DÍVIDAS ──────────────────────────────────────────────────────

test("dívidas: parcelas vencidas viram um alerta por semana; em dia não alerta", () => {
  const p = (v, iso) => ({ credor: "Carlos", numero: 1, valor: v, vencimento: dia(iso) });
  assert.equal(det.detectarDividasAtrasadas([p(500, "2026-10-05"), p(500, "2026-10-20")], SEGUNDA).length, 0); // vence hoje / futuro
  const [c] = det.detectarDividasAtrasadas([p(500, "2026-09-20"), p(300, "2026-10-01")], SEGUNDA);
  assert.equal(c.qualifier, "2P");
  assert.equal(c.periodKey, "2026-10-05");
  assert.match(c.mensagem, /2 parcelas vencidas/);
  assert.match(c.mensagem, /R\$\s?800,00/);
  // mesma semana, mesma quantidade: mesma chave (não repete); semana seguinte: nova chave
  const outraSemana = det.detectarDividasAtrasadas([p(500, "2026-09-20"), p(300, "2026-10-01")], new Date("2026-10-12T11:30:00Z"))[0];
  assert.notEqual(chaveDedupe(c), chaveDedupe(outraSemana));
});

// ── agente LANÇAMENTOS ──────────────────────────────────────────────────

test("lançamentos: só cobra quem tinha hábito; 'Outros' exige 30% E piso de R$ 150", () => {
  const a = (over = {}) => ({ ultimoLancamento: dia("2026-09-28"), diasComRegistroAntesDaPausa: 10, gastoMes: 1000, gastoOutrosMes: 0, ...over });
  const gap = det.detectarLancamentos(a(), SEGUNDA);
  assert.equal(gap.length, 1);
  assert.equal(gap[0].tipo, "LOGGING_GAP");
  assert.equal(gap[0].qualifier, "5D");
  assert.equal(det.detectarLancamentos(a({ diasComRegistroAntesDaPausa: 3 }), SEGUNDA).length, 0); // sem hábito
  assert.equal(det.detectarLancamentos(a({ ultimoLancamento: dia("2026-10-03") }), SEGUNDA).length, 0); // só 2 dias
  assert.equal(det.detectarLancamentos(a({ ultimoLancamento: dia("2026-09-15") }), SEGUNDA)[0].qualifier, "14D");
  const outros = (valor, total) => det.detectarLancamentos(a({ ultimoLancamento: dia("2026-10-05"), gastoMes: total, gastoOutrosMes: valor }), SEGUNDA);
  assert.equal(outros(400, 1000).length, 1); // 40% e R$ 400
  assert.equal(outros(40, 100).length, 0); // 40% mas só R$ 40
  assert.equal(outros(200, 1000).length, 0); // R$ 200 mas só 20%
  assert.equal(outros(400, 1000)[0].prioridade, 28);
});

// ── COACH ───────────────────────────────────────────────────────────────

test("coach: dica determinística só quando a maior categoria pesa 20% ou mais", () => {
  const dica = dicaDoCoach({ categoria: "Mercado", total: 980 }, 4000);
  assert.match(dica, /Mercado/);
  assert.match(dica, /R\$\s?980,00/);
  assert.match(dica, /R\$\s?98,00/); // 10% de 980, calculado no backend
  assert.equal(dicaDoCoach({ categoria: "Mercado", total: 300 }, 4000), null); // 7,5%
  assert.equal(dicaDoCoach(null, 4000), null);
});

test("fechamento do mês anexa a dica do Coach e marca no payload (pra log do agente Coach)", () => {
  const f = { nomeMes: "setembro de 2026", periodKey: "2026-09", receitas: 4800, saidas: 4000, resultado: 800, guardadoEmMetas: 0, topCategoria: { categoria: "Mercado", total: 980 }, quantidadeLancamentos: 30 };
  const [c] = alertas.detectarFechamentoMes(f, 2);
  assert.match(c.mensagem, /Dica do Coach/);
  assert.equal(c.payload.coach, true);
  const [semDica] = alertas.detectarFechamentoMes({ ...f, topCategoria: { categoria: "Mercado", total: 100 } }, 2);
  assert.doesNotMatch(semDica.mensagem, /Dica do Coach/);
  assert.equal(semDica.payload.coach, false);
});

// ── arbitragem multiagente ──────────────────────────────────────────────

const mk = (tipo, entityId, qualifier, prioridade, periodKey = "2026-10") => ({ tipo, entityId, qualifier, periodKey, prioridade, mensagem: "m" });

test("cada agente propõe no máximo 1 candidato; o árbitro escolhe o de maior prioridade entre eles", () => {
  const candidatos = [
    mk("CATEGORY_BUDGET", "A", "80", 78),
    mk("CATEGORY_BUDGET", "B", "100", 94), // mesmo agente (sentinela): só o melhor entra no pool
    mk("NEGATIVE_PROJECTION", "GLOBAL", "BELOW_0", 90), // também sentinela
    mk("CARD_LIMIT_HIGH", "c1", "90", 92),
    mk("GOAL_MILESTONE", "m1", "50", 48, "VIDA"),
    mk("LOGGING_GAP", "GLOBAL", "5D", 22),
  ];
  const r = escolherAlerta(candidatos, base());
  const agentes = r.propostos.map((c) => AGENTE_DO_TIPO[c.tipo]);
  assert.deepEqual([...new Set(agentes)].sort(), agentes.slice().sort()); // nenhum agente repetido
  assert.deepEqual(agentes.sort(), ["cartoes", "lancamentos", "metas", "sentinela"]);
  assert.equal(r.escolhido.tipo, "CATEGORY_BUDGET");
  assert.equal(r.escolhido.entityId, "B"); // 94 vence
  assert.equal(r.porAgente.sentinela.brutos, 3);
});

test("se o melhor do agente já foi enviado, o agente propõe o próximo que a política libera", () => {
  const melhor = mk("CATEGORY_BUDGET", "B", "100", 94);
  const segundo = mk("CATEGORY_BUDGET", "A", "80", 78);
  const hist = [{ dedupeKey: chaveDedupe(melhor), tipo: "CATEGORY_BUDGET", enviadoEm: dia("2026-09-30") }];
  const r = escolherAlerta([melhor, segundo], base({ historico: hist }));
  assert.equal(r.escolhido.entityId, "A");
  assert.deepEqual(r.pulados.map((p) => p.motivo), ["JA_ENVIADO"]);
});

test("mesmo ASSUNTO em dias seguidos é barrado, exceto se for crítico (>= 90)", () => {
  assert.equal(TOPICO_DO_TIPO.NEGATIVE_PROJECTION, TOPICO_DO_TIPO.CARD_NEXT_INVOICE_HEAVY);
  const ontem = [{ dedupeKey: "NEGATIVE_PROJECTION|GLOBAL|BELOW_0|2026-10", tipo: "NEGATIVE_PROJECTION", enviadoEm: new Date("2026-10-05T11:30:00Z") }];
  // hoje seria fatura pesada (80): mesmo assunto (fluxo de caixa) ontem -> barra
  const pesada = mk("CARD_NEXT_INVOICE_HEAVY", "c", "30", 80, "Nov/2026");
  assert.deepEqual(decidirEnvio(pesada, base({ agora: new Date("2026-10-06T11:30:00Z"), historico: ontem })), { enviar: false, motivo: "TOPICO_RECENTE" });
  // crítico passa (projeção severa 96 em nova faixa)
  const severa = mk("NEGATIVE_PROJECTION", "GLOBAL", "BELOW_1000", 96);
  // atenção: o limite diário também vale; aqui o envio de ontem não bloqueia hoje
  assert.deepEqual(decidirEnvio(severa, base({ agora: new Date("2026-10-06T11:30:00Z"), historico: ontem })), { enviar: true });
  // 3 dias depois, assunto liberado
  assert.deepEqual(decidirEnvio(pesada, base({ agora: new Date("2026-10-08T11:30:00Z"), historico: ontem })), { enviar: true });
});

test("starvation: dez tipos competindo saem um por dia por prioridade, sem repetir e sem prender os baixos pra sempre", () => {
  const candidatos = [
    mk("DEBT_OVERDUE", "GLOBAL", "1P", 100, "2026-10-05"),
    mk("CARD_LIMIT_HIGH", "c1", "100", 98),
    mk("CATEGORY_BUDGET", "A", "100", 94),
    mk("CARD_CLOSING", "c1", "D-2", 82, "2026-10-08"),
    mk("MONTH_CLOSING", "GLOBAL", "MONTH", 70, "2026-09"),
    mk("COMMITMENTS_WEEK", "GLOBAL", "WEEK", 65, "2026-10-05"),
    mk("GOAL_MILESTONE", "m1", "50", 48, "VIDA"),
    mk("LOGGING_GAP", "GLOBAL", "5D", 22),
  ];
  const historico = [];
  const ordem = [];
  // 20 dias de ciclo, mantendo as 4/semana e o assunto recente funcionando
  for (let d = 0; d < 20; d++) {
    const agora = new Date(Date.UTC(2026, 9, 5 + d, 11, 30));
    const r = escolherAlerta(candidatos, { agora, aceitaProativas: true, tiposDesligados: [], historico });
    if (r.escolhido) {
      ordem.push(r.escolhido.tipo);
      historico.push({ dedupeKey: chaveDedupe(r.escolhido), tipo: r.escolhido.tipo, enviadoEm: agora });
    }
  }
  assert.equal(ordem[0], "DEBT_OVERDUE");
  assert.equal(ordem[1], "CARD_LIMIT_HIGH");
  assert.equal(new Set(ordem).size, ordem.length); // nunca repete
  assert.ok(ordem.includes("LOGGING_GAP"), `o de menor prioridade também chega ao cliente: ${ordem.join(",")}`);
  assert.equal(ordem.length, candidatos.length); // todos os 8 saem dentro de 20 dias
});

test("disjuntor por agente: pausa só o agente com taxa alta de errado/silenciado", () => {
  const pausados = agentesPausadosPorDisjuntor([
    { tipo: "CATEGORY_BUDGET", enviados: 12, errados: 5, silenciados: 0 }, // sentinela 41%
    { tipo: "CARD_CLOSING", enviados: 12, errados: 0, silenciados: 1 }, // cartões 8%
    { tipo: "GOAL_STALLED", enviados: 3, errados: 3, silenciados: 0 }, // amostra pequena
    { tipo: "TODOS", enviados: 0, errados: 0, silenciados: 4 }, // não pertence a agente
  ]);
  assert.deepEqual(pausados, ["sentinela"]);
});

test("todo tipo de alerta tem agente e assunto definidos", () => {
  const tipos = Object.keys(AGENTE_DO_TIPO);
  assert.equal(tipos.length, 15);
  for (const t of tipos) assert.ok(TOPICO_DO_TIPO[t], `tipo ${t} sem tópico`);
  assert.deepEqual([...new Set(Object.values(AGENTE_DO_TIPO))].sort(), ["cartoes", "compromissos", "dividas", "fechamento", "lancamentos", "metas", "orientador", "sentinela"]);
});

test("semana começa na segunda-feira (identidade semanal dos alertas)", () => {
  assert.equal(det.inicioDaSemana(new Date("2026-10-05T11:30:00Z")), "2026-10-05"); // segunda
  assert.equal(det.inicioDaSemana(new Date("2026-10-11T20:00:00Z")), "2026-10-05"); // domingo
  assert.equal(det.inicioDaSemana(new Date("2026-10-12T11:30:00Z")), "2026-10-12");
});
