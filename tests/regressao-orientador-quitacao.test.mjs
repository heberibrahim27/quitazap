import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

// Permite que um módulo .ts importe outro por caminho relativo sem extensão.
Module._extensions[".ts"] = function carregarTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const ler = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

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

const proativo = loadTsModule("src/lib/orientador-quitacao/proativo.ts");
const respiroMod = loadTsModule("src/lib/orientador-quitacao/respiro.ts");
const { nivelComprometimento, montarFila, montarOrientacao, formatarOrientacao, simularExtraMensal, formatarSimulacaoExtra, calcularRespiro, FRASES_PROIBIDAS } =
  loadTsModule("src/lib/orientador-quitacao/motor.ts");

const divida = (over = {}) => ({
  id: "d" + Math.random().toString(36).slice(2, 7),
  credor: "Credor",
  tipo: "OUTRO",
  saldoDevedor: 1000,
  valorTotal: 1200,
  valorPago: 200,
  emAtraso: false,
  diasAtraso: 0,
  venceEmDias: 20,
  risco: false,
  consignado: false,
  parcelasPendentes: [100, 100, 100],
  ...over,
});

const entrada = (over = {}) => ({
  rendaEfetiva: 3000,
  percentualComprometido: 0.6,
  saldoProjetado: 800,
  custoDeVidaMensal: 1500,
  respiroAtual: 0,
  respiroMetaExiste: false,
  dividas: [divida({ credor: "A", saldoDevedor: 900 }), divida({ credor: "B", saldoDevedor: 400 })],
  quitadas: 0,
  totalContratado: 5000,
  totalPago: 500,
  ...over,
});

test("níveis de comprometimento: até 50% normal, 50-70 alto, 70-100 crítico, acima de 100 insustentável", () => {
  assert.equal(nivelComprometimento(0.4), "NORMAL");
  assert.equal(nivelComprometimento(0.5), "NORMAL");
  assert.equal(nivelComprometimento(0.6), "ALTO");
  assert.equal(nivelComprometimento(0.9), "CRITICO");
  assert.equal(nivelComprometimento(1), "CRITICO");
  assert.equal(nivelComprometimento(1.38), "INSUSTENTAVEL");
  assert.equal(nivelComprometimento(null), null);
});

test("fila: atraso com risco > atraso > vence perto > menor saldo; consignado fica de fora", () => {
  const fila = montarFila([
    divida({ credor: "Maior", saldoDevedor: 5000 }),
    divida({ credor: "Menor", saldoDevedor: 300 }),
    divida({ credor: "VencePerto", saldoDevedor: 2000, venceEmDias: 3 }),
    divida({ credor: "Atrasada", saldoDevedor: 4000, emAtraso: true, diasAtraso: 10 }),
    divida({ credor: "AtrasadaRisco", saldoDevedor: 6000, emAtraso: true, diasAtraso: 2, risco: true }),
    divida({ credor: "Consignado", saldoDevedor: 100, consignado: true }),
    divida({ credor: "Quitada", saldoDevedor: 0 }),
  ]);
  assert.deepEqual(fila.map((f) => f.credor), ["AtrasadaRisco", "Atrasada", "VencePerto", "Menor", "Maior"]);
});

test("com sobra e sem Respiro: primeiro separa o Respiro (7 dias), o resto ataca a menor dívida", () => {
  const o = montarOrientacao(entrada());
  assert.equal(o.nivel, "ALTO");
  assert.equal(o.modoCritico, false);
  // buffer = 5% de 3000 = 150 → sobra alocável 650; respiro alvo = 1500/30*7 = 350
  assert.equal(o.sobraAlocavel, 650);
  assert.equal(o.respiro.alvo, 350);
  const tipos = o.passos.map((p) => p.tipo);
  assert.deepEqual(tipos.slice(0, 2), ["RESPIRO", "ATACAR"]);
  assert.equal(o.passos[0].valor, 350);
  assert.equal(o.passos[1].valor, 300); // resto da sobra (300), limitado ao saldo da menor dívida (400)
  assert.equal(o.alvo.credor, "B");
});

test("Respiro já formado: toda a sobra vai pra dívida-alvo, limitada ao saldo dela", () => {
  const o = montarOrientacao(entrada({ respiroAtual: 400, respiroMetaExiste: true, saldoProjetado: 2000 }));
  const atacar = o.passos.find((p) => p.tipo === "ATACAR" && p.quando === "AGORA");
  assert.ok(atacar);
  assert.equal(atacar.valor, 400); // saldo da menor dívida (B), não a sobra inteira
  assert.equal(o.passos.at(-1).quando, "PROXIMO");
});

test("dívida em atraso vem primeiro (REGULARIZAR) e a sobra continua útil", () => {
  const o = montarOrientacao(
    entrada({ dividas: [divida({ credor: "Atrasada", saldoDevedor: 800, emAtraso: true, diasAtraso: 15, parcelasPendentes: [200] }), divida({ credor: "Outra", saldoDevedor: 300 })] })
  );
  assert.equal(o.passos[0].tipo, "REGULARIZAR");
  assert.equal(o.passos[0].quando, "AGORA");
  assert.equal(o.passos[0].valor, 200);
  assert.equal(o.atrasadas, 1);
});

test("sem sobra: não inventa dinheiro, manda pagar em dia e pedir dica de economia", () => {
  const o = montarOrientacao(entrada({ saldoProjetado: 100 }));
  assert.equal(o.sobraAlocavel, 0);
  assert.ok(o.passos.some((p) => p.tipo === "SEM_SOBRA"));
  assert.ok(!o.passos.some((p) => p.tipo === "ATACAR" && p.quando === "AGORA"));
});

test("insustentável (>100% da renda): modo crítico preserva o essencial e NÃO fala em acelerar quitação", () => {
  const o = montarOrientacao(entrada({ percentualComprometido: 1.38, saldoProjetado: -1500 }));
  assert.equal(o.modoCritico, true);
  assert.deepEqual(o.passos.map((p) => p.tipo), ["PRESERVAR", "MAPEAR", "NEGOCIAR"]);
  const texto = formatarOrientacao(o);
  assert.doesNotMatch(texto, /Dinheiro livre para atacar/);
  assert.doesNotMatch(texto, /ATACAR|a mais em/);
  assert.match(texto, /renegociar/);
});

test("sem dívidas: parabeniza e, se der, sugere o Respiro", () => {
  const o = montarOrientacao(entrada({ dividas: [], quitadas: 2 }));
  assert.equal(o.passos[0].tipo, "SEM_DIVIDAS");
  assert.ok(o.passos.some((p) => p.tipo === "RESPIRO"));
  assert.match(formatarOrientacao(o), /quitou 2 dívidas/);
});

test("sem renda calculável: pede os dados em vez de recomendar", () => {
  const o = montarOrientacao(entrada({ percentualComprometido: null, rendaEfetiva: null }));
  assert.equal(o.passos[0].tipo, "COMPLETAR_DADOS");
});

test("simulador: extra por mês abate as últimas parcelas pelo cronograma (sem prometer desconto de juros)", () => {
  const r = simularExtraMensal(Array(10).fill(100), 100);
  assert.deepEqual(r, { prazoAtualMeses: 10, novoPrazoMeses: 5, mesesAntes: 5 });
  assert.equal(simularExtraMensal([], 100), null);
  assert.equal(simularExtraMensal([100, 100], 0), null);
  const texto = formatarSimulacaoExtra("Banco X", 100, Array(10).fill(100));
  assert.match(texto, /5 meses antes/);
  assert.doesNotMatch(texto, /economiza/i);
  assert.match(texto, /valor de quitação/);
});

test("Respiro: 7 dias do custo de vida do dia a dia", () => {
  const r = calcularRespiro(3000, 100, true);
  assert.equal(r.alvo, 700);
  assert.equal(r.falta, 600);
  assert.equal(r.diasCobertos, 1);
});

test("guardrail: nenhum texto do Orientador sugere dívida nova, investimento ou produto financeiro", () => {
  const cenarios = [
    entrada(),
    entrada({ percentualComprometido: 1.4, saldoProjetado: -900 }),
    entrada({ saldoProjetado: 50 }),
    entrada({ dividas: [] }),
    entrada({ respiroAtual: 900, respiroMetaExiste: true, saldoProjetado: 3000, quitadas: 1, totalPago: 3000 }),
    entrada({ dividas: [divida({ credor: "Luz", tipo: "ENERGIA", emAtraso: true, diasAtraso: 5, risco: true })] }),
  ];
  for (const c of cenarios) {
    const texto = formatarOrientacao(montarOrientacao(c)).toLowerCase();
    for (const proibida of FRASES_PROIBIDAS) assert.ok(!texto.includes(proibida.toLowerCase()), `texto sugeriu "${proibida}": ${texto}`);
  }
  assert.ok(FRASES_PROIBIDAS.includes("cheque especial") && FRASES_PROIBIDAS.includes("investimento"));
});

test("o Quita expõe o Orientador só como LEITURA e o prompt carrega a filosofia e os guardrails", () => {
  const skills = ler("src/lib/agentes/skills/index.ts");
  for (const nome of ["orientar_quitacao", "simular_pagamento_extra"]) {
    assert.ok(skills.includes(`"${nome}"`), `skill ${nome} não registrada`);
  }
  const trecho = skills.slice(skills.indexOf("const orientarQuitacaoSkill"), skills.indexOf("const criarMetaRespiroSkill"));
  assert.doesNotMatch(trecho, /modo: "WRITE"/);
  const ferramentas = ler("src/lib/agentes/quita/ferramentas.ts");
  assert.match(ferramentas, /def\("orientar_quitacao"/);
  assert.doesNotMatch(ferramentas, /prisma\./);
  const prompt = ler("src/lib/agentes/quita/loop.ts");
  assert.match(prompt, /QUITAR DÍVIDAS/);
  assert.match(prompt, /NUNCA sugira novo empréstimo/);
});

// ── Aviso proativo (agente propõe; o portão único decide) ────────────────────

test("plano do mês só nos dias 1 a 3, fora do modo crítico e com dívida na fila", () => {
  const o = montarOrientacao(entrada());
  const dia2 = proativo.detectarPlanoQuitacao(o, { periodKey: "2026-10", diaHoje: 2 });
  assert.equal(dia2.length, 1);
  assert.equal(dia2[0].tipo, "QUIT_PLAN");
  assert.equal(dia2[0].periodKey, "2026-10");
  assert.equal(dia2[0].qualifier, "ALTO");
  assert.equal(dia2[0].prioridade, 58);
  assert.match(dia2[0].mensagem, /AGORA:/);
  assert.equal(proativo.detectarPlanoQuitacao(o, { periodKey: "2026-10", diaHoje: 4 }).length, 0);

  const critico = montarOrientacao(entrada({ percentualComprometido: 1.4, saldoProjetado: -900 }));
  assert.equal(proativo.detectarPlanoQuitacao(critico, { periodKey: "2026-10", diaHoje: 1 }).length, 0, "modo crítico não manda aviso automático");
  const semDivida = montarOrientacao(entrada({ dividas: [] }));
  assert.equal(proativo.detectarPlanoQuitacao(semDivida, { periodKey: "2026-10", diaHoje: 1 }).length, 0);
  const semRenda = montarOrientacao(entrada({ percentualComprometido: null, rendaEfetiva: null }));
  assert.equal(proativo.detectarPlanoQuitacao(semRenda, { periodKey: "2026-10", diaHoje: 1 }).length, 0);
});

test("comemora dívida quitada recente (uma vez na vida) e o marco mais alto de total pago", () => {
  const c = proativo.detectarMarcosQuitacao({
    totalContratado: 10000,
    totalPago: 5200,
    quitadasRecentes: [{ id: "d1", credor: "Banco X" }],
    faltaPagar: 4800,
    proximoAlvo: { credor: "Loja Y", saldoDevedor: 640 },
  });
  const quitada = c.find((x) => x.qualifier === "QUITADA");
  const marco = c.find((x) => x.qualifier === "PAGO_50");
  assert.ok(quitada && marco);
  assert.equal(quitada.entityId, "d1");
  assert.equal(quitada.periodKey, "VIDA");
  assert.match(quitada.mensagem, /quitou Banco X/);
  assert.match(quitada.mensagem, /Próximo alvo: Loja Y/);
  assert.equal(marco.periodKey, "VIDA");
  assert.match(marco.mensagem, /50%/);
  assert.equal(c.filter((x) => x.qualifier.startsWith("PAGO_")).length, 1, "só o marco mais alto");

  assert.equal(proativo.detectarMarcosQuitacao({ totalContratado: 10000, totalPago: 1000, quitadasRecentes: [], faltaPagar: 9000, proximoAlvo: null }).length, 0);
  assert.equal(proativo.detectarMarcosQuitacao({ totalContratado: 0, totalPago: 0, quitadasRecentes: [], faltaPagar: 0, proximoAlvo: null }).length, 0);
});

test("o Orientador entra no ciclo do Sentinela como agente proponente, com coletor isolado e cuidado de consulta", () => {
  const coletores = ler("src/lib/agentes/coletores.ts");
  assert.ok(coletores.includes("  orientador: coletarOrientador"), "agente orientador sem coletor");
  const trecho = coletores.slice(coletores.indexOf("async function coletarOrientador"), coletores.indexOf("// ── Orquestração com isolamento"));
  assert.match(trecho, /status: \{ in: \["ATIVA", "QUITADA"\] \}/, "deve sair logo quando o cliente não tem dívida");
  assert.match(trecho, /c\.diaHoje <= 3/, "consulta pesada só nos dias 1 a 3");
  assert.ok(ler("src/lib/agentes/sentinela-service.ts").includes('"fechamento", "orientador"]'), "orientador fora da lista de proponentes");
  assert.ok(ler("src/lib/agentes/status.ts").includes('chave: "orientador"'), "orientador fora da tela de agentes");
});

test("textos proativos também respeitam os guardrails (nada de dívida nova, investimento ou produto)", () => {
  const textos = [
    proativo.detectarPlanoQuitacao(montarOrientacao(entrada()), { periodKey: "2026-10", diaHoje: 1 })[0].mensagem,
    ...proativo.detectarMarcosQuitacao({ totalContratado: 1000, totalPago: 1000, quitadasRecentes: [{ id: "x", credor: "Banco" }], faltaPagar: 0, proximoAlvo: null }).map((c) => c.mensagem),
  ].join("\n").toLowerCase();
  for (const proibida of FRASES_PROIBIDAS) assert.ok(!textos.includes(proibida.toLowerCase()), `sugeriu "${proibida}"`);
});

// ── Meta Respiro (criada só a pedido do cliente, mesma skill nos dois canais) ─────

test("o comando 'criar respiro' é reconhecido nas formas naturais e não confunde outras frases", () => {
  for (const ok of ["criar respiro", "Criar respiro", "criar meta respiro", "quero criar meu respiro", "sim, criar respiro", "criar o respiro agora", "montar meu colchão", "criar a meta de respiro!"]) {
    assert.ok(respiroMod.detectarCriarRespiro(ok), `deveria reconhecer: ${ok}`);
  }
  for (const nao of ["guardar 100 no respiro", "guardei 100 na meta respiro", "como está meu respiro", "preciso de respiro no mês", "criar meta viagem 3000", "respiro"]) {
    assert.ok(!respiroMod.detectarCriarRespiro(nao), `não deveria reconhecer: ${nao}`);
  }
});

test("alvo do Respiro arredonda pra cima de 10 em 10", () => {
  assert.equal(respiroMod.arredondarAlvoRespiro(350), 350);
  assert.equal(respiroMod.arredondarAlvoRespiro(351.4), 360);
  assert.equal(respiroMod.arredondarAlvoRespiro(0.5), 10);
});

test("o passo RESPIRO ensina o comando quando a meta não existe e o depósito quando existe", () => {
  const semMeta = montarOrientacao(entrada({ respiroMetaExiste: false }));
  const passoSem = semMeta.passos.find((p) => p.tipo === "RESPIRO");
  assert.ok(passoSem);
  assert.match(passoSem.texto, /criar respiro/);
  const comMeta = montarOrientacao(entrada({ respiroMetaExiste: true, respiroAtual: 100 }));
  const passoCom = comMeta.passos.find((p) => p.tipo === "RESPIRO");
  assert.ok(passoCom);
  assert.match(passoCom.texto, /guardei \d+ na meta respiro/);
  assert.doesNotMatch(passoCom.texto, /criar respiro/);
});

test("criar a meta Respiro é escrita determinística: skill WRITE usada pelos dois canais, nunca exposta ao Quita", () => {
  const skills = ler("src/lib/agentes/skills/index.ts");
  const trecho = skills.slice(skills.indexOf("const criarMetaRespiroSkill"), skills.indexOf("export const skillRegistry"));
  assert.match(trecho, /name: "criar_meta_respiro"/);
  assert.match(trecho, /modo: "WRITE"/);
  assert.doesNotMatch(ler("src/lib/agentes/quita/ferramentas.ts"), /criar_meta_respiro/);
  for (const canal of ["src/lib/controle-orquestrador.ts", "src/app/api/webhook/zapi/route.ts"]) {
    const src = ler(canal);
    assert.ok(src.includes("detectarCriarRespiro(mensagem)"), `${canal} não trata o comando`);
    assert.match(src, /skillRegistry\.run[^(]*\(\s*"criar_meta_respiro"/, `${canal} não usa a skill`);
  }
  const servico = ler("src/lib/orientador-quitacao/respiro-service.ts");
  assert.match(servico, /contains: "respiro"/, "tem que checar se a meta já existe (idempotente)");
  assert.doesNotMatch(servico, /lancamento/i, "criar a meta não pode gerar lançamento");
});

// ── Consignado: "quero quitar os empréstimos pra aumentar meu salário" ──
const { montarFilaConsignados } = loadTsModule("src/lib/orientador-quitacao/motor.ts");

const consig = (credor, saldo, parcela, n) =>
  divida({ credor, consignado: true, tipo: "EMPRESTIMO", saldoDevedor: saldo, parcelasPendentes: Array(n).fill(parcela) });

test("consignado: começa pelo que mais libera contracheque por real gasto (parcela ÷ saldo)", () => {
  const fila = montarFilaConsignados([
    consig("Banco Grande", 20000, 400, 50), // 2,0% do saldo por mês
    consig("Banco Pequeno", 3000, 250, 12), // 8,3% do saldo por mês
    consig("Banco Médio", 9000, 450, 20), // 5,0%
  ]);
  assert.deepEqual(fila.map((c) => c.credor), ["Banco Pequeno", "Banco Médio", "Banco Grande"]);
  assert.equal(fila[0].parcelaMensal, 250);
  assert.equal(fila[0].parcelasRestantes, 12);
});

test("só consignados: o plano NOMEIA o consignado-alvo e o salário que ele libera, sem perguntar nada", () => {
  const o = montarOrientacao(
    entrada({
      percentualComprometido: 0,
      saldoProjetado: 2000,
      respiroMetaExiste: true,
      respiroAtual: 99999,
      dividas: [consig("Banco Pequeno", 3000, 250, 12), consig("Banco Grande", 20000, 400, 50)],
    })
  );
  const passo = o.passos.find((p) => p.tipo === "LIBERAR_SALARIO");
  assert.ok(passo, "deve haver passo LIBERAR_SALARIO");
  assert.equal(passo.quando, "AGORA");
  assert.match(passo.texto, /Banco Pequeno/);
  assert.match(passo.texto, /R\$\s*250,00 por mês no seu contracheque/);
  assert.match(passo.texto, /Depois, o próximo é Banco Grande/);
  const texto = formatarOrientacao(o);
  assert.ok(!texto.includes("?"), "o plano não pergunta o que o sistema já sabe");
  for (const f of FRASES_PROIBIDAS) assert.ok(!texto.toLowerCase().includes(f.toLowerCase()), f);
});

test("consignado junto de dívida comum: a fila de atraso continua mandando e o consignado vira PRÓXIMO", () => {
  const o = montarOrientacao(
    entrada({
      dividas: [divida({ credor: "Carnê", emAtraso: true, diasAtraso: 5, saldoDevedor: 300 }), consig("Banco Pequeno", 3000, 250, 12)],
    })
  );
  assert.equal(o.alvo.credor, "Carnê");
  const passo = o.passos.find((p) => p.tipo === "LIBERAR_SALARIO");
  assert.equal(passo.quando, "PROXIMO");
});

test("Quita não pergunta ao cliente o que já está cadastrado e cita a dívida pelo nome", () => {
  const prompt = fs.readFileSync(path.join(root, "src/lib/agentes/quita/loop.ts"), "utf8");
  assert.match(prompt, /NUNCA pergunte ao cliente o que o sistema já sabe/);
  assert.match(prompt, /PELO NOME/);
});
