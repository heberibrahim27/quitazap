// ─────────────────────────────────────────
// Skill Registry v0 — skills compartilhadas pelos dois canais
// ─────────────────────────────────────────
// consultar_fatura (READ), desfazer_ultimo_lancamento (WRITE),
// criar_lembrete (WRITE), depositar_meta (WRITE). Cada uma só embrulha o
// serviço de domínio que já existia — o registro não duplica regra.

import { responderConsultaFatura } from "@/lib/financeiro/fatura-cartao-consulta";
import { desfazerUltimoLancamentoDetalhado } from "@/lib/desfazer-lancamento";
import { detectarComandoTarefa } from "@/lib/tarefa-flow";
import { processarComandoTarefa } from "@/lib/tarefa-service";
import { criarDepositoTyped, encontrarMetaPorNome } from "@/lib/meta-service";
import { RegistroDeSkills, type Skill } from "./contrato";
import { compromissosProximos, metasDoCliente, orcamentoPorCategoria, resumoDoMes } from "./leituras";

export * from "./contrato";

function texto(entrada: unknown, campo: string, max = 500): string {
  const v = (entrada as Record<string, unknown> | null)?.[campo];
  if (typeof v !== "string" || !v.trim()) throw new Error(`Campo "${campo}" obrigatório.`);
  return v.trim().slice(0, max);
}

const consultarFatura: Skill<{ mensagem: string }, { texto: string }> = {
  name: "consultar_fatura",
  description: "Faturas dos cartões pelo ciclo de fechamento (aberta, anterior, próxima).",
  modo: "READ",
  validate: (i) => ({ mensagem: texto(i, "mensagem") }),
  async execute(ctx, { mensagem }) {
    return { ok: true, data: { texto: await responderConsultaFatura(ctx.userId, mensagem) } };
  },
};

const desfazerUltimoLancamento: Skill<Record<string, never>, { removido: boolean; texto: string; lancamentoId?: string }> = {
  name: "desfazer_ultimo_lancamento",
  description: "Apaga o último lançamento (gasto, receita, despesa fixa ou compra no cartão).",
  modo: "WRITE",
  validate: () => ({}),
  async execute(ctx) {
    const r = await desfazerUltimoLancamentoDetalhado(ctx.userId);
    if (!r.removido) return { ok: false, code: "SEM_LANCAMENTO", userMessage: r.resposta };
    return { ok: true, data: { removido: true, texto: r.resposta, lancamentoId: r.lancamentoId } };
  },
};

const criarLembrete: Skill<{ texto: string; origem: "TEXTO" | "AUDIO" }, { texto: string }> = {
  name: "criar_lembrete",
  description: "Cria um lembrete/tarefa a partir de uma frase (data, valor e recorrência são lidos do texto).",
  modo: "WRITE",
  validate: (i) => ({ texto: texto(i, "texto"), origem: (i as { origem?: string })?.origem === "AUDIO" ? "AUDIO" : "TEXTO" }),
  async execute(ctx, { texto: frase, origem }) {
    const comando = detectarComandoTarefa(`lembrete: ${frase}`);
    if (!comando) return { ok: false, code: "NAO_ENTENDI" };
    const resposta = await processarComandoTarefa(ctx.userId, comando, origem);
    if (!resposta) return { ok: false, code: "NAO_ENTENDI" };
    return { ok: true, data: { texto: resposta } };
  },
};

const depositarMeta: Skill<{ meta: string; valor: number; origem: "TEXTO" | "AUDIO" }, { texto: string }> = {
  name: "depositar_meta",
  description: "Deposita um valor numa meta (cofrinho) encontrada pelo nome; o valor sai do disponível do mês.",
  modo: "WRITE",
  validate: (i) => {
    const valor = Number((i as { valor?: unknown })?.valor);
    if (!Number.isFinite(valor) || valor <= 0) throw new Error("Valor inválido.");
    return { meta: texto(i, "meta", 80), valor, origem: (i as { origem?: string })?.origem === "AUDIO" ? "AUDIO" : "TEXTO" };
  },
  async execute(ctx, { meta, valor, origem }) {
    const encontrada = await encontrarMetaPorNome(ctx.userId, meta);
    if (!encontrada) return { ok: false, code: "META_NAO_ENCONTRADA", userMessage: `Não achei uma meta chamada "${meta}". Veja o nome certo em Minha Conta > Metas.` };
    const r = await criarDepositoTyped(ctx.userId, encontrada.id, valor, origem);
    if (!r.ok) return { ok: false, code: "DEPOSITO_FALHOU", userMessage: r.erro };
    const v = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
    return { ok: true, data: { texto: `🎯 Guardei ${v} na meta *${encontrada.nome}*.` } };
  },
};

/** Leitura sem parâmetros do cliente; "agora" opcional só pra ensaio/teste. */
function leitura(
  name: string,
  description: string,
  executar: (clienteId: string, agora: Date) => Promise<string>
): Skill<{ agora: Date }, { texto: string }> {
  return {
    name,
    description,
    modo: "READ",
    validate: (i) => {
      const v = (i as { agora?: unknown } | null)?.agora;
      const d = typeof v === "string" || v instanceof Date ? new Date(v) : new Date();
      return { agora: Number.isNaN(d.getTime()) ? new Date() : d };
    },
    async execute(ctx, { agora }) {
      return { ok: true, data: { texto: await executar(ctx.userId, agora) } };
    },
  };
}

const consultarResumoMes = leitura("consultar_resumo_mes", "Entradas, despesas, resultado e guardado em metas do mês atual.", resumoDoMes);
const consultarOrcamento = leitura("consultar_orcamento", "Quanto já gastou do limite de cada categoria no mês.", orcamentoPorCategoria);
const consultarCompromissos = leitura("consultar_compromissos", "Contas, lembretes e parcelas que vencem nos próximos 30 dias.", compromissosProximos);
const consultarMetas = leitura("consultar_metas", "Metas (cofrinhos) e quanto já foi guardado em cada.", (id) => metasDoCliente(id));

export const skillRegistry = new RegistroDeSkills();
skillRegistry.register(consultarResumoMes);
skillRegistry.register(consultarOrcamento);
skillRegistry.register(consultarCompromissos);
skillRegistry.register(consultarMetas);
skillRegistry.register(consultarFatura);
skillRegistry.register(desfazerUltimoLancamento);
skillRegistry.register(criarLembrete);
skillRegistry.register(depositarMeta);
