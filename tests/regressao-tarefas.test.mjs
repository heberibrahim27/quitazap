import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

Module._extensions[".ts"] = function carregarTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

const {
  detectarComandoTarefa,
  extrairTarefa,
  calcularProximaOcorrencia,
  proximaDataDoMes,
  proximaDataDaSemana,
  proximaDataAnual,
  encontrarDividaCorrespondente,
  encontrarTarefaPorTermo,
  formatarConfirmacaoTarefa,
  formatarListaTarefas,
  formatarMensagemErroExtracao,
} = loadTsModule("src/lib/tarefa-flow.ts");

// ── detectarComandoTarefa ────────────────────────────────────────────────

test("detecta comando de criar lembrete pelo prefixo", () => {
  const comando = detectarComandoTarefa("lembrete: pagar a luz dia 10, R$150");
  assert.equal(comando.comando, "CRIAR");
  assert.equal(comando.resultado.ok, true);
  assert.equal(comando.resultado.tarefa.tipo, "LEMBRETE");
});

test("detecta comando de criar tarefa com prefixo 'tarefa:'", () => {
  const comando = detectarComandoTarefa("tarefa: renovar o seguro dia 15");
  assert.equal(comando.comando, "CRIAR");
  assert.equal(comando.resultado.tarefa.tipo, "LEMBRETE");
});

test("detecta comando de registrar pagamento pelo prefixo", () => {
  const comando = detectarComandoTarefa("pagamento: paguei a luz, R$150");
  assert.equal(comando.comando, "CRIAR");
  assert.equal(comando.resultado.tarefa.tipo, "PAGAMENTO");
});

test("detecta comando de listar tarefas", () => {
  assert.equal(detectarComandoTarefa("minhas tarefas").comando, "LISTAR");
  assert.equal(detectarComandoTarefa("Tarefas Pendentes").comando, "LISTAR");
  assert.equal(detectarComandoTarefa("ver tarefas").comando, "LISTAR");
});

test("detecta comando de concluir tarefa e extrai o termo de busca", () => {
  const comando = detectarComandoTarefa("concluí pagar a luz");
  assert.equal(comando.comando, "CONCLUIR");
  assert.equal(comando.termo, "pagar a luz");
});

test("detecta comando de cancelar tarefa e extrai o termo de busca", () => {
  const comando = detectarComandoTarefa("cancelar pagar a luz");
  assert.equal(comando.comando, "CANCELAR");
  assert.equal(comando.termo, "pagar a luz");
});

test("mensagem sem prefixo/comando de tarefa não é capturada", () => {
  assert.equal(detectarComandoTarefa("mercado 100"), null);
  assert.equal(detectarComandoTarefa("resumo do mês"), null);
  assert.equal(detectarComandoTarefa(""), null);
});

test("mensagem em linguagem natural, prefixada como o fallback de IA do webhook faz, extrai normalmente", () => {
  // route.ts's classificarLembreteLivreIA fallback re-injeta a mensagem original
  // com "lembrete: "/"pagamento: " na frente antes de chamar detectarComandoTarefa
  // de novo — confirma que esse re-encaixe funciona igual pro parser determinístico.
  const lembrete = detectarComandoTarefa("lembrete: me lembra de pagar a luz dia 10");
  assert.equal(lembrete.comando, "CRIAR");
  assert.equal(lembrete.resultado.ok, true);
  assert.equal(lembrete.resultado.tarefa.tipo, "LEMBRETE");
  assert.ok(lembrete.resultado.tarefa.vencimento);
  assert.equal(new Date(lembrete.resultado.tarefa.vencimento).getUTCDate(), 10);

  const pagamento = detectarComandoTarefa("pagamento: não esquece que preciso pagar o boleto do carro amanhã");
  assert.equal(pagamento.comando, "CRIAR");
  assert.equal(pagamento.resultado.tarefa.tipo, "PAGAMENTO");
});

test("'terminei de pagar ...' nao e capturado (e' o comando PAGUEI legado, nao tarefa)", () => {
  // Regressão: "terminei" já é gatilho do fluxo PAGUEI (route.ts) pra confirmar
  // pagamento de dívida. Não pode ser reaproveitado como sinônimo de "concluir
  // tarefa" — isso sequestraria aquele fluxo.
  assert.equal(detectarComandoTarefa("terminei de pagar a fatura do nubank"), null);
  assert.equal(detectarComandoTarefa("finalizei o pagamento da luz"), null);
});

// ── extrairTarefa — LEMBRETE pontual ─────────────────────────────────────

test("lembrete pontual extrai descricao, valor e dia do vencimento", () => {
  const resultado = extrairTarefa("pagar a luz dia 10, R$150", "LEMBRETE");
  assert.equal(resultado.ok, true);
  const t = resultado.tarefa;
  assert.equal(t.tipo, "LEMBRETE");
  assert.match(t.descricao, /luz/i);
  assert.equal(t.valor, 150);
  assert.equal(t.recorrente, false);
  assert.ok(t.vencimento instanceof Date);
  assert.equal(t.vencimento.getDate(), 10);
  assert.equal(t.horarioEnvio, "08:00");
});

test("lembrete aceita horario customizado", () => {
  const resultado = extrairTarefa("pagar a luz dia 10 as 20h", "LEMBRETE");
  assert.equal(resultado.ok, true);
  assert.equal(resultado.tarefa.horarioEnvio, "20:00");
});

test("lembrete sem nenhuma descricao aproveitavel retorna erro SEM_DESCRICAO", () => {
  const resultado = extrairTarefa("dia 10", "LEMBRETE");
  // "dia 10" sozinho não sobra descrição depois de extrair o dia
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "SEM_DESCRICAO");
});

// ── extrairTarefa — LEMBRETE recorrente ──────────────────────────────────

test("lembrete recorrente mensal via 'todo dia N'", () => {
  const resultado = extrairTarefa("pagar a luz todo dia 10, R$150", "LEMBRETE");
  assert.equal(resultado.ok, true);
  const t = resultado.tarefa;
  assert.equal(t.recorrente, true);
  assert.equal(t.frequencia, "MENSAL");
  assert.equal(t.diaMes, 10);
  assert.equal(t.vencimento.getDate(), 10);
});

test("lembrete recorrente mensal via 'mensal' + 'dia N'", () => {
  const resultado = extrairTarefa("assinatura do netflix mensal dia 5, R$39,90", "LEMBRETE");
  assert.equal(resultado.ok, true);
  const t = resultado.tarefa;
  assert.equal(t.recorrente, true);
  assert.equal(t.frequencia, "MENSAL");
  assert.equal(t.diaMes, 5);
  assert.equal(t.valor, 39.9);
});

test("lembrete recorrente semanal via 'toda segunda'", () => {
  const resultado = extrairTarefa("revisar gastos toda segunda", "LEMBRETE");
  assert.equal(resultado.ok, true);
  const t = resultado.tarefa;
  assert.equal(t.recorrente, true);
  assert.equal(t.frequencia, "SEMANAL");
  assert.equal(t.diaSemana, 1);
  assert.equal(t.vencimento.getDay(), 1);
});

test("lembrete recorrente anual via 'todo ano' + DD/MM", () => {
  const resultado = extrairTarefa("renovar o seguro do carro todo ano dia 10/03", "LEMBRETE");
  assert.equal(resultado.ok, true);
  const t = resultado.tarefa;
  assert.equal(t.recorrente, true);
  assert.equal(t.frequencia, "ANUAL");
  assert.equal(t.vencimento.getDate(), 10);
  assert.equal(t.vencimento.getMonth(), 2); // março = índice 2
});

test("data pontual DD/MM sem palavra de recorrência não fica recorrente", () => {
  const resultado = extrairTarefa("renovar o seguro do carro dia 10/03", "LEMBRETE");
  assert.equal(resultado.ok, true);
  const t = resultado.tarefa;
  assert.equal(t.recorrente, false);
  assert.equal(t.frequencia, null);
  assert.equal(t.vencimento.getDate(), 10);
  assert.equal(t.vencimento.getMonth(), 2);
});

test("recorrencia mencionada sem nenhum dia/data retorna erro RECORRENCIA_SEM_DATA", () => {
  const resultado = extrairTarefa("pagar a mensalidade da academia mensalmente", "LEMBRETE");
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "RECORRENCIA_SEM_DATA");
});

// ── extrairTarefa — PAGAMENTO ────────────────────────────────────────────

test("pagamento extrai descricao e valor, sempre pontual (nao recorrente)", () => {
  const resultado = extrairTarefa("paguei a luz, R$150", "PAGAMENTO");
  assert.equal(resultado.ok, true);
  const t = resultado.tarefa;
  assert.equal(t.tipo, "PAGAMENTO");
  assert.equal(t.valor, 150);
  assert.equal(t.recorrente, false);
  assert.ok(t.vencimento instanceof Date);
});

test("pagamento sem valor ainda registra a descricao (valor fica nulo)", () => {
  const resultado = extrairTarefa("paguei a luz", "PAGAMENTO");
  assert.equal(resultado.ok, true);
  assert.equal(resultado.tarefa.valor, null);
  assert.match(resultado.tarefa.descricao, /luz/i);
});

// ── Cálculo de datas ──────────────────────────────────────────────────────
//
// As datas de referência usadas aqui são construídas com Date.UTC(..., 12, ...)
// (meio-dia UTC) em vez de `new Date(ano, mes, dia)`. Isso é proposital: meio-dia
// UTC cai sempre no mesmo dia civil em Brasília (UTC-3), evitando ambiguidade de
// fuso na própria referência do teste — o comportamento real que importa testar
// é o de proximaData*/calcularProximaOcorrencia, não o de construção do fixture.

function referenciaBrasil(ano, mesIndice, dia) {
  return new Date(Date.UTC(ano, mesIndice, dia, 12, 0, 0));
}

test("proximaDataDoMes usa o mes atual quando o dia ainda nao passou", () => {
  const referencia = referenciaBrasil(2026, 7, 5); // 5 de agosto de 2026
  const data = proximaDataDoMes(10, referencia);
  assert.equal(data.getUTCMonth(), 7);
  assert.equal(data.getUTCDate(), 10);
});

test("proximaDataDoMes pula pro mes seguinte quando o dia ja passou", () => {
  const referencia = referenciaBrasil(2026, 7, 20); // 20 de agosto de 2026
  const data = proximaDataDoMes(10, referencia);
  assert.equal(data.getUTCMonth(), 8); // setembro
  assert.equal(data.getUTCDate(), 10);
});

test("proximaDataDaSemana avanca para a proxima ocorrencia do dia da semana", () => {
  const segunda = referenciaBrasil(2026, 7, 3); // 3 ago 2026 é uma segunda-feira
  const proximaSegunda = proximaDataDaSemana(1, segunda);
  // Não devolve "hoje" mesmo se hoje já for o dia da semana pedido — sempre a próxima ocorrência futura.
  assert.equal(proximaSegunda.getUTCDay(), 1);
  assert.equal(proximaSegunda.getUTCFullYear(), 2026);
  assert.equal(proximaSegunda.getUTCMonth(), 7);
  assert.equal(proximaSegunda.getUTCDate(), 10);
});

test("proximaDataDoMes limita dia 31 ao ultimo dia real do mes (fevereiro)", () => {
  const referencia = referenciaBrasil(2027, 1, 5); // 5 de fevereiro de 2027 (não bissexto)
  const data = proximaDataDoMes(31, referencia);
  assert.equal(data.getUTCMonth(), 1); // continua em fevereiro, não estoura pra março
  assert.equal(data.getUTCDate(), 28);
});

test("proximaDataAnual limita 29/02 ao ultimo dia de fevereiro em ano nao bissexto", () => {
  const referencia = referenciaBrasil(2026, 0, 1); // 1 jan 2026 (não bissexto)
  const data = proximaDataAnual(29, 1, referencia); // 29 de fevereiro
  assert.equal(data.getUTCFullYear(), 2026);
  assert.equal(data.getUTCMonth(), 1);
  assert.equal(data.getUTCDate(), 28);
});

test("proximaDataAnual pula pro ano seguinte quando a data ja passou", () => {
  const referencia = referenciaBrasil(2026, 7, 20); // 20 ago 2026
  const data = proximaDataAnual(10, 2, referencia); // 10 de março
  assert.equal(data.getUTCFullYear(), 2027);
  assert.equal(data.getUTCMonth(), 2);
  assert.equal(data.getUTCDate(), 10);
});

test("data retornada corresponde ao dia certo quando formatada em America/Sao_Paulo", () => {
  // Trava a regressão do bug real encontrado em revisão: construir a data com
  // `new Date(ano, mes, dia)` fazia "dia 10" aparecer/disparar como dia 9 quando
  // formatado/comparado em horário de Brasília.
  const referencia = referenciaBrasil(2026, 7, 5);
  const data = proximaDataDoMes(10, referencia);
  const dataEmBrasilia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data);
  assert.equal(dataEmBrasilia, "2026-08-10");
});

test("calcularProximaOcorrencia roteia por frequencia (mensal/semanal/anual)", () => {
  const referencia = referenciaBrasil(2026, 7, 20);

  const mensal = calcularProximaOcorrencia(
    { frequencia: "MENSAL", diaMes: 10, diaSemana: null, mesAnual: null, vencimento: null },
    referencia
  );
  assert.equal(mensal.getUTCDate(), 10);
  assert.equal(mensal.getUTCMonth(), 8);

  const semanal = calcularProximaOcorrencia(
    { frequencia: "SEMANAL", diaMes: null, diaSemana: 1, mesAnual: null, vencimento: null },
    referencia
  );
  assert.equal(semanal.getUTCDay(), 1);

  const anual = calcularProximaOcorrencia(
    { frequencia: "ANUAL", diaMes: 10, diaSemana: null, mesAnual: 3, vencimento: null },
    referencia
  );
  assert.equal(anual.getUTCFullYear(), 2027);
  assert.equal(anual.getUTCMonth(), 2); // março

  const semFrequencia = calcularProximaOcorrencia(
    { frequencia: null, diaMes: null, diaSemana: null, mesAnual: null, vencimento: null },
    referencia
  );
  assert.equal(semFrequencia, null);
});

test("calcularProximaOcorrencia ANUAL usa diaMes/mesAnual, nao o vencimento ja clampado", () => {
  // "todo ano dia 29/02" criado em 2026 (não bissexto) grava diaMes=29, mesAnual=2,
  // mas o vencimento inicial fica clampado pra 28/02/2026. Ano seguinte (2027,
  // também não bissexto) deve continuar em 28/02 — e em 2028 (bissexto) deve
  // voltar a cair em 29/02, o que só é possível porque a recorrência é recalculada
  // a partir de diaMes/mesAnual, e não relendo o vencimento (que ficou em 28).
  const tarefa = {
    frequencia: "ANUAL",
    diaMes: 29,
    diaSemana: null,
    mesAnual: 2,
    vencimento: referenciaBrasil(2026, 1, 28), // já clampado, como ficaria salvo no banco
  };

  const proxima2027 = calcularProximaOcorrencia(tarefa, referenciaBrasil(2026, 2, 1));
  assert.equal(proxima2027.getUTCFullYear(), 2027);
  assert.equal(proxima2027.getUTCMonth(), 1);
  assert.equal(proxima2027.getUTCDate(), 28); // 2027 também não é bissexto

  const proxima2028 = calcularProximaOcorrencia(tarefa, referenciaBrasil(2027, 2, 1));
  assert.equal(proxima2028.getUTCFullYear(), 2028);
  assert.equal(proxima2028.getUTCMonth(), 1);
  assert.equal(proxima2028.getUTCDate(), 29); // 2028 é bissexto — volta pro dia 29
});

// ── Match com Divida existente ────────────────────────────────────────────

test("encontrarDividaCorrespondente acha match direto por nome do credor", () => {
  const dividas = [
    { id: "1", credor: "Nubank" },
    { id: "2", credor: "Banco do Brasil" },
  ];
  const match = encontrarDividaCorrespondente("pagar a fatura do nubank", dividas);
  assert.equal(match.id, "1");
});

test("encontrarDividaCorrespondente retorna null quando nao ha nenhum credor parecido", () => {
  const dividas = [{ id: "1", credor: "Nubank" }];
  const match = encontrarDividaCorrespondente("pagar a luz", dividas);
  assert.equal(match, null);
});

test("encontrarDividaCorrespondente nao quebra com lista vazia", () => {
  assert.equal(encontrarDividaCorrespondente("pagar a luz", []), null);
});

// ── Match de Tarefa por termo livre ───────────────────────────────────────

test("encontrarTarefaPorTermo acha por substring", () => {
  const tarefas = [
    { id: "1", descricao: "Pagar a luz" },
    { id: "2", descricao: "Renovar o seguro" },
  ];
  const encontrada = encontrarTarefaPorTermo("luz", tarefas);
  assert.equal(encontrada.id, "1");
});

test("encontrarTarefaPorTermo retorna null quando nao ha nenhuma parecida", () => {
  const tarefas = [{ id: "1", descricao: "Pagar a luz" }];
  assert.equal(encontrarTarefaPorTermo("academia", tarefas), null);
});

test("encontrarTarefaPorTermo retorna null quando o termo bate em mais de uma tarefa (ambiguo)", () => {
  const tarefas = [
    { id: "1", descricao: "Pagar a luz" },
    { id: "2", descricao: "Pagar a água" },
  ];
  // "pagar a" é substring das duas descrições — não dá pra saber qual o usuário quis dizer
  assert.equal(encontrarTarefaPorTermo("pagar a", tarefas), null);
});

test("encontrarTarefaPorTermo nao intercepta com apenas 1 palavra generica em comum", () => {
  const tarefas = [{ id: "1", descricao: "Pagar a fatura do cartão" }];
  // "pagar" sozinho é uma palavra genérica demais pra confirmar que é a mesma tarefa
  assert.equal(encontrarTarefaPorTermo("pagar o boleto do mercado", tarefas), null);
});

test("encontrarTarefaPorTermo retorna null pra termo curto demais (sem nenhuma palavra >= 3 letras)", () => {
  const tarefas = [{ id: "1", descricao: "Pagar a luz" }];
  assert.equal(encontrarTarefaPorTermo("a", tarefas), null);
  assert.equal(encontrarTarefaPorTermo("de", tarefas), null);
});

test("encontrarTarefaPorTermo intercepta quando ha 2+ palavras significativas em comum", () => {
  const tarefas = [
    { id: "1", descricao: "Pagar a fatura do nubank" },
    { id: "2", descricao: "Renovar o seguro do carro" },
  ];
  const encontrada = encontrarTarefaPorTermo("terminei de pagar a fatura do nubank", tarefas);
  assert.equal(encontrada.id, "1");
});

// ── Formatação de mensagens ────────────────────────────────────────────────

test("formatarConfirmacaoTarefa monta mensagem de lembrete recorrente", () => {
  const msg = formatarConfirmacaoTarefa({
    tipo: "LEMBRETE",
    descricao: "Pagar a luz",
    valor: 150,
    vencimento: new Date(2026, 7, 10),
    recorrente: true,
    frequencia: "MENSAL",
    diaMes: 10,
    diaSemana: null,
    horarioEnvio: "08:00",
  });
  assert.match(msg, /Lembrete criado/);
  assert.match(msg, /Pagar a luz/);
  assert.match(msg, /R\$\s*150,00/);
  assert.match(msg, /todo mês/);
});

test("formatarConfirmacaoTarefa monta mensagem de pagamento", () => {
  const msg = formatarConfirmacaoTarefa({
    tipo: "PAGAMENTO",
    descricao: "Paguei a luz",
    valor: 150,
    vencimento: new Date(),
    recorrente: false,
    frequencia: null,
    diaMes: null,
    diaSemana: null,
    horarioEnvio: "08:00",
  });
  assert.match(msg, /Pagamento registrado/);
  assert.match(msg, /R\$\s*150,00/);
});

test("formatarListaTarefas lida com lista vazia", () => {
  const msg = formatarListaTarefas([]);
  assert.match(msg, /não tem tarefas pendentes/i);
});

test("formatarListaTarefas lista as tarefas pendentes", () => {
  const msg = formatarListaTarefas([
    { descricao: "Pagar a luz", valor: 150, vencimento: new Date(2026, 7, 10), recorrente: true, frequencia: "MENSAL" },
  ]);
  assert.match(msg, /Pagar a luz/);
  assert.match(msg, /R\$\s*150,00/);
});

test("formatarMensagemErroExtracao cobre os dois motivos possiveis", () => {
  assert.match(formatarMensagemErroExtracao("SEM_DESCRICAO"), /Não entendi/);
  assert.match(formatarMensagemErroExtracao("RECORRENCIA_SEM_DATA"), /não achei o dia/);
});
