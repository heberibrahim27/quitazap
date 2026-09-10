import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// resetarDadosFinanceiros (reset-actions.ts) é uma server action acoplada a
// getClienteAtual()/redirect() do Next.js — não dá pra transpilar e chamar
// direto como os resolvedores puros (mesmo padrão já usado em
// regressao-chat-viewport.test.mjs pra CSS/JSX: lê o código-fonte como texto
// e garante, por conteúdo, que as chamadas certas existem). A verificação
// funcional de verdade (dados somem, cadastro fica) foi feita ao vivo contra
// um cliente de teste em produção antes do deploy.

const root = path.resolve(import.meta.dirname, "..");
const resetActions = fs.readFileSync(
  path.join(root, "src/app/minha-conta/(protegido)/perfil/reset-actions.ts"),
  "utf8"
);
const resetForm = fs.readFileSync(
  path.join(root, "src/app/minha-conta/(protegido)/perfil/ResetTotalForm.tsx"),
  "utf8"
);

// Decisão do Ibrahim (10/09/2026): "se é um reset tem que ser total, até o
// chat" / "só fica a foto, os dados cadastrais" — o reset total agora
// também apaga Empréstimos/Dívidas e o histórico do chat, além de zerar
// estado diário/insights/saúde financeira e a pendência de conversa
// (BotSessao), pra não sobrar nada apontando pra dados que já não existem.
test("reset total agora apaga dívidas, chat e estados derivados, todos filtrados pelo cliente", () => {
  const bloco = resetActions.slice(
    resetActions.indexOf("export async function executarResetTotalCliente"),
    resetActions.indexOf("export async function resetarDadosFinanceiros")
  );

  for (const chamada of [
    "prisma.divida.deleteMany({ where: { clienteId } })",
    "prisma.mensagemChat.deleteMany({ where: { clienteId } })",
    "prisma.estadoDiarioCliente.deleteMany({ where: { clienteId } })",
    "prisma.insightDetectado.deleteMany({ where: { clienteId } })",
    "prisma.saudeFinanceiraLog.deleteMany({ where: { clienteId } })",
    "prisma.botSessao.deleteMany({ where: { clienteId } })",
  ]) {
    assert.ok(bloco.includes(chamada), `chamada ausente: ${chamada}`);
  }

  // Parcela/Pagamento não têm deleteMany próprio aqui de propósito — caem
  // via onDelete: Cascade do schema quando a Divida é apagada.
  assert.doesNotMatch(bloco, /prisma\.parcela\.deleteMany/);
  assert.doesNotMatch(bloco, /prisma\.pagamento\.deleteMany/);
});

test("reset total nunca mexe em identidade/cadastro/assinatura nem em histórico de cobrança/uso/admin", () => {
  const blocoUpdateCliente = resetActions.slice(
    resetActions.indexOf("prisma.cliente.update("),
    resetActions.indexOf("]);", resetActions.indexOf("prisma.cliente.update("))
  );

  for (const campo of [
    "nome:",
    "telefone:",
    "cpf:",
    "email:",
    "senhaHash:",
    "fotoUrl:",
    "statusAtendimento:",
    "gratuito:",
    "assinaturaVenceEm:",
    "isTeste:",
    "aceitaProativas:",
    "modoLembrete:",
  ]) {
    assert.ok(!blocoUpdateCliente.includes(campo), `campo de identidade/cadastro tocado: ${campo}`);
  }

  for (const model of [
    "eventoCakto",
    "logIA",
    "eventoAnalytics",
    "mensagemPendenteRevisao",
    "auditoriaAssistente",
  ]) {
    assert.doesNotMatch(
      resetActions,
      new RegExp(`prisma\\.${model}\\.(deleteMany|delete|update)`, "i"),
      `modelo fora de escopo foi tocado: ${model}`
    );
  }
});

test("texto da tela não promete mais que empréstimos/dívidas ficam de fora (promessa falsa numa ação irreversível)", () => {
  assert.doesNotMatch(resetForm, /não mexe em Empréstimos/i);
  assert.match(resetForm, /Empréstimos\/Dívidas/);
  assert.match(resetForm, /histórico do chat/i);
  assert.match(resetForm, /foto e os dados cadastrais/i);
});
