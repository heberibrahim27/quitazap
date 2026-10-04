import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
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

const CHAT = "src/lib/controle-orquestrador.ts";
const WHATSAPP = "src/app/api/webhook/zapi/route.ts";

// ── Paridade chat × WhatsApp ───────────────────────────────────────────
// O chat nativo e o webhook são duas cascatas separadas. Pra que um bug não
// volte a existir "só num canal" (foi o padrão de quase todo achado do QA de
// 04/10/2026), as capacidades compartilhadas passam OBRIGATORIAMENTE pelo
// registro de skills nos dois — este teste falha se alguém reintroduzir uma
// cópia direta num canal.

const CAPACIDADES_COMPARTILHADAS = ["desfazer_ultimo_lancamento", "consultar_fatura", "criar_lembrete"];

test("os dois canais chamam as mesmas skills do registro", () => {
  for (const arquivo of [CHAT, WHATSAPP]) {
    const src = ler(arquivo);
    for (const skill of CAPACIDADES_COMPARTILHADAS) {
      assert.match(src, new RegExp(`skillRegistry\\.run[^(]*\\(\\s*"${skill}"`), `${arquivo} não chama a skill ${skill}`);
    }
  }
});

test("nenhum canal reimplementa a capacidade compartilhada por fora do registro", () => {
  for (const arquivo of [CHAT, WHATSAPP]) {
    const src = ler(arquivo);
    assert.doesNotMatch(src, /prisma\.lancamento\.delete\(/, `${arquivo}: apagar lançamento direto (use a skill desfazer_ultimo_lancamento)`);
    assert.doesNotMatch(src, /\bdesfazerUltimoLancamento(Detalhado)?\(/, `${arquivo}: chamada direta a desfazerUltimoLancamento`);
    assert.doesNotMatch(src, /\bresponderConsultaFatura\(/, `${arquivo}: chamada direta a responderConsultaFatura`);
  }
});

test("os dois canais interceptam o feedback de alerta antes da IA e tratam lembrete natural antes das consultas", () => {
  for (const arquivo of [CHAT, WHATSAPP]) {
    const src = ler(arquivo);
    const iFeedback = src.indexOf("detectarFeedbackAlerta(mensagem)");
    const iLembrete = src.indexOf("pedidoExplicitoDeLembrete(mensagem)");
    const iFatura = src.indexOf('"consultar_fatura"');
    assert.ok(iFeedback > 0 && iLembrete > 0 && iFatura > 0, `${arquivo}: falta algum dos passos`);
    assert.ok(iFeedback < iFatura, `${arquivo}: feedback de alerta precisa vir antes da consulta de fatura`);
    assert.ok(iLembrete < iFatura, `${arquivo}: lembrete natural precisa vir antes da consulta de fatura`);
  }
});

// ── Contrato do registro de skills ─────────────────────────────────────

const { RegistroDeSkills } = loadTsModule("src/lib/agentes/skills/contrato.ts");
const ctx = { userId: "u1", timezone: "America/Sao_Paulo", channel: "app" };

function skillFake(over = {}) {
  return {
    name: "fake",
    description: "fake",
    modo: "READ",
    validate: (i) => {
      if (typeof i?.x !== "number") throw new Error("x obrigatório");
      return { x: i.x };
    },
    execute: async (_c, { x }) => ({ ok: true, data: { dobro: x * 2 } }),
    ...over,
  };
}

test("registro: executa skill válida e devolve SkillResult", async () => {
  const r = new RegistroDeSkills();
  r.register(skillFake());
  assert.deepEqual(await r.run("fake", ctx, { x: 4 }), { ok: true, data: { dobro: 8 } });
});

test("registro: skill desconhecida, entrada inválida e exceção viram resultado, nunca estouram", async () => {
  const r = new RegistroDeSkills();
  r.register(skillFake());
  r.register(skillFake({ name: "quebra", execute: async () => { throw new Error("boom"); } }));
  assert.deepEqual(await r.run("nao-existe", ctx, {}), { ok: false, code: "SKILL_DESCONHECIDA" });
  const invalida = await r.run("fake", ctx, { x: "a" });
  assert.equal(invalida.ok, false);
  assert.equal(invalida.code, "ENTRADA_INVALIDA");
  assert.equal(invalida.userMessage, "x obrigatório");
  const erro = await r.run("quebra", ctx, { x: 1 });
  assert.deepEqual(erro, { ok: false, code: "ERRO_INTERNO" });
});

test("registro: nome duplicado é recusado e list() separa READ de WRITE", () => {
  const r = new RegistroDeSkills();
  r.register(skillFake({ name: "a", modo: "READ" }));
  r.register(skillFake({ name: "b", modo: "WRITE" }));
  assert.throws(() => r.register(skillFake({ name: "a" })), /duplicada/);
  assert.deepEqual(r.list("READ").map((s) => s.name), ["a"]);
  assert.deepEqual(r.list("WRITE").map((s) => s.name), ["b"]);
  assert.equal(r.list().length, 2);
});

test("skills de escrita nunca estão na allowlist de ferramentas do agente Quita", () => {
  const src = ler("src/lib/agentes/quita/ferramentas.ts");
  for (const escrita of ["desfazer_ultimo_lancamento", "criar_lembrete", "depositar_meta", "registrar"]) {
    assert.doesNotMatch(src, new RegExp(`def\\(\\s*"${escrita}`), `Quita não pode expor a skill de escrita ${escrita}`);
  }
  // e o executor do Quita só usa resolvers de leitura / prisma.find*/groupBy
  assert.doesNotMatch(src, /prisma\.\w+\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\(/);
});

test("as leituras do Quita passam pelo registro de skills (fonte única) e todas as skills esperadas estão registradas", () => {
  const registro = ler("src/lib/agentes/skills/index.ts");
  for (const nome of ["consultar_fatura", "desfazer_ultimo_lancamento", "criar_lembrete", "depositar_meta", "consultar_resumo_mes", "consultar_orcamento", "consultar_compromissos", "consultar_metas"]) {
    assert.match(registro, new RegExp(`"${nome}"`), `skill ${nome} não registrada`);
  }
  const ferramentas = ler("src/lib/agentes/quita/ferramentas.ts");
  for (const skill of ["consultar_resumo_mes", "consultar_orcamento", "consultar_compromissos", "consultar_metas"]) {
    assert.ok(ferramentas.includes(`viaRegistro("${skill}")`), `Quita não usa a skill ${skill} via registro`);
  }
  // nenhuma query direta de leitura duplicada dentro das ferramentas do Quita
  assert.doesNotMatch(ferramentas, /prisma\./);
});
