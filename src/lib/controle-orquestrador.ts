// ─────────────────────────────────────────
// QuitaZAP — Orquestrador canal-agnóstico do Controle
// Núcleo compartilhado entre WhatsApp e chat nativo — ver
// docs/chat-nativo-arquitetura.md pro plano completo.
//
// Fase 2 (este arquivo): porta os fluxos determinísticos de maior valor
// do webhook (src/app/api/webhook/zapi/route.ts) pra cá, na MESMA ordem
// em que aparecem lá (a ordem é load-bearing — ver comentários de cada
// bloco). webhook/zapi/route.ts NÃO foi tocado nem importa nada daqui —
// zero risco ao bot do WhatsApp em produção. Isso tem um custo consciente:
// os 8 helpers pequenos e não-exportados que o webhook usa (detectarComando,
// podeAutoRegistrarIntentFinanceiro, etc.) estão duplicados aqui, não
// reimportados — ver docs/chat-nativo-arquitetura.md pra unificação futura.
//
// Cobertura desta fase (não é 100% dos ~40 ramos do webhook — decisão de
// escopo, ver commit): correção de renda, consulta de cartões/saldo,
// consultas "Skill Analista" (posso gastar, simulação de parcela, limite
// seguro, rota de dívidas, meta/prazo, plano de pagamento, vazamentos,
// horas de trabalho, consulta livre), gerenciamento de despesas fixas e
// fatura de cartão, resolução de pendências (valor de gasto/pagamento em
// aberto), correção de origem do último gasto, configuração de cartão,
// interpretação geral de intenção financeira (IA) e o "gasto rápido"
// determinístico. Fora do escopo por ora (fica no rescue ladder do
// ai-bot.ts, mais genérico): RESETAR, comandos de Tarefa, fluxo de
// perfil de trabalho servidor público, DESFAZER_LANCAMENTO via comando de
// texto, COBRAR/VER_COBRANCAS/MEU_PAINEL/DIAGNOSTICO/QUITASCORE/AJUDA
// (admin/secundário), lote de gastos no cartão em uma única mensagem.
//
// Diferença deliberada do webhook: lá, a persistência roda via after()
// (depois da resposta já enviada, porque é webhook/fire-and-forget). Aqui
// é await direto — o chat nativo é request/response de verdade, e o
// cliente pode querer ver saldo/gráfico atualizado assim que a resposta
// chega, não alguns milissegundos depois.
// ─────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { processarMensagemIA, type Mensagem } from "@/lib/ai-bot";
import type { BotSessao, Cliente } from "@prisma/client";

import {
  carregarEstadoControle,
  criarMensagemEstadoControle,
  corrigirRendaControle,
  consultarCartoesControle,
  consultarSaldoControle,
  gerenciarDespesasFixasControle,
  gerenciarFaturaCartaoControle,
  resolverValorGastoPendente,
  resolverValorPagamentoDividaPendente,
  corrigirOrigemUltimoGastoControle,
  configurarCartaoControle,
  registrarGastoControle,
  criarEstadoComPendenciaPagamentoDivida,
  respostaAguardarValorPagamentoDivida,
  criarEstadoComConfirmacaoInterpretacaoFinanceira,
  salvarItensConfirmadosIA,
  type EstadoControleFinanceiro,
  type ResultadoGastoControle,
} from "@/lib/controle-financeiro-flow";
import { sincronizarEstadoComMotorCentral } from "@/lib/controle-financeiro-sync";
import { detectarComandoTarefa, pedidoExplicitoDeLembrete } from "@/lib/tarefa-flow";
import { detectarCriarRespiro } from "@/lib/orientador-quitacao/respiro";
import { detectarFeedbackAlerta } from "@/lib/agentes/feedback";
import { aplicarFeedbackAlerta, registrarUsoCoach } from "@/lib/agentes/alertas-store";
import { processarComandoTarefa } from "@/lib/tarefa-service";
import { classificarLembreteLivreIA, devePularFallbackLembreteIA } from "@/lib/ia/tarefa-resolver";
import { pedidoDesfazerLancamento } from "@/lib/comandos-texto";
import { skillRegistry, type SkillContext } from "@/lib/agentes/skills";
import { detectarConsultaFatura } from "@/lib/financeiro/fatura-cartao";
import {
  persistirLancamentosControle,
  persistirCartaoControle,
  corrigirOrigemLancamentoControle,
  type OrigemLancamentoControle,
} from "@/lib/controle-financeiro-service";
import {
  persistirDividaConfirmadaIA,
  persistirPagamentoDividaConfirmadoIA,
  persistirMetaConfirmadaIA,
} from "@/lib/rescue-financeiro-service";
import { classificarConfirmacaoIA } from "@/lib/ia/confirmacao-resolver";
import { detectarConsultaFinanceira, responderConsultaFinanceira } from "@/lib/ia/consulta-financeira-resolver";
import { detectarSimulacaoParcela, responderSimulacaoParcela } from "@/lib/ia/simulador-parcela-resolver";
import { detectarLimiteSeguro, responderLimiteSeguro } from "@/lib/ia/limite-seguro-resolver";
import { detectarRotaDividas, responderRotaDividas } from "@/lib/ia/rota-dividas-resolver";
import {
  detectarMetaPrazo,
  responderMetaPrazo,
  detectarPlanoPagamento,
  responderPlanoPagamento,
} from "@/lib/ia/plano-pagamento-resolver";
import { detectarConsultaVazamentos, responderConsultaVazamentos } from "@/lib/ia/vazamentos-resolver";
import { detectarHorasTrabalho, responderHorasTrabalho } from "@/lib/ia/horas-trabalho-resolver";
import { tentarResponderConsultaLivre, podeConversarLivre } from "@/lib/ia/classificador-consulta-livre";
import { responderConversaLivre } from "@/lib/agentes/quita/agente";
import {
  resolverIntencaoFinanceiraIA,
  intentFinanceiroConfirmavel,
  formatarPreviaIntentFinanceiro,
} from "@/lib/ia/financeiro-intent-resolver";
import type { TipoItemFinanceiro } from "@/lib/ia/financeiro-intent-schema";
import { parseMoneyBR } from "@/lib/money";
import { calcularGraficoCategoria, type GraficoCategoriaDado } from "@/lib/grafico-categoria-service";

type LancamentoCriado = Awaited<ReturnType<typeof persistirLancamentosControle>>[number];

export type ResultadoOrquestrador = {
  resposta: string;
  /** Presente quando a mensagem criou lançamento(s) — dado estruturado pro
   *  card do chat renderizar (editar/dividir/desfazer) sem parsear texto. */
  lancamentosCriados?: LancamentoCriado[];
  /** Presente quando a mensagem foi uma consulta "onde gasto mais" — dado
   *  estruturado pro card de gráfico de categoria renderizar. */
  graficoCategoria?: GraficoCategoriaDado;
};

// ── Helpers locais duplicados do webhook (não exportados de lá — ver
// cabeçalho do arquivo) ───────────────────────────────────────────────

function inicioDoDiaBrasil(agora: Date): Date {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(agora)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, 3, 0, 0)); // 00h Brasília = 03h UTC
}

const LIMIAR_CONFIANCA_AUTO_REGISTRO = 0.75;
const LIMIAR_CONFIANCA_AUTO_REGISTRO_ALTO_RISCO = 0.85;
const TIPOS_ALTO_RISCO_AUTO_REGISTRO = new Set<TipoItemFinanceiro>(["divida", "pagamento_divida", "meta"]);

function podeAutoRegistrarIntentFinanceiro(intent: { confianca: number; itens: { tipo: TipoItemFinanceiro }[] }): boolean {
  const limiar = intent.itens.some((item) => TIPOS_ALTO_RISCO_AUTO_REGISTRO.has(item.tipo))
    ? LIMIAR_CONFIANCA_AUTO_REGISTRO_ALTO_RISCO
    : LIMIAR_CONFIANCA_AUTO_REGISTRO;
  return intent.confianca >= limiar;
}

async function gerenciarDespesasFixasComFallbackIA(
  mensagem: string,
  estado: EstadoControleFinanceiro
): Promise<ResultadoGastoControle | null> {
  const resultado = gerenciarDespesasFixasControle(mensagem, estado);
  const pendenteResolvivelAqui =
    estado.confirmacaoPendente && estado.confirmacaoPendente.tipo !== "substituir_fatura_fechada";
  if (resultado || !pendenteResolvivelAqui) return resultado;

  const classificacao = await classificarConfirmacaoIA(mensagem);
  if (!classificacao) return null;

  return gerenciarDespesasFixasControle(classificacao === "confirmar" ? "sim" : "não", estado);
}

async function gerenciarFaturaCartaoComFallbackIA(
  mensagem: string,
  estado: EstadoControleFinanceiro
): Promise<ResultadoGastoControle | null> {
  const resultado = gerenciarFaturaCartaoControle(mensagem, estado);
  if (resultado || estado.confirmacaoPendente?.tipo !== "substituir_fatura_fechada") return resultado;

  const classificacao = await classificarConfirmacaoIA(mensagem);
  if (!classificacao) return null;

  return gerenciarFaturaCartaoControle(classificacao === "confirmar" ? "sim" : "não", estado);
}

// ── Sessão compartilhada entre canais ─────────────────────────────────

type ClienteParaSessao = Pick<Cliente, "id" | "telefone" | "nome">;

/**
 * Resolve a sessão do Controle pro cliente já autenticado (clienteId
 * conhecido com certeza, sem precisar de lookup por telefone). Reaproveita
 * a mesma tabela BotSessao do WhatsApp — sem migration nova — pra manter
 * memória financeira contínua entre canais: um cliente que já conversou
 * no WhatsApp encontra o mesmo contexto (renda cadastrada, confirmação
 * pendente) ao abrir o chat nativo, e vice-versa.
 */
export async function obterOuCriarSessaoControle(cliente: ClienteParaSessao): Promise<BotSessao> {
  const porClienteId = await prisma.botSessao.findFirst({ where: { clienteId: cliente.id } });
  if (porClienteId) return porClienteId;

  const porTelefone = await prisma.botSessao.findFirst({ where: { telefone: cliente.telefone } });
  if (porTelefone) {
    if (!porTelefone.clienteId) {
      return prisma.botSessao.update({ where: { id: porTelefone.id }, data: { clienteId: cliente.id } });
    }
    return porTelefone;
  }

  return prisma.botSessao.create({
    data: { telefone: cliente.telefone, clienteId: cliente.id, nome: cliente.nome },
  });
}

// ── Núcleo canal-agnóstico ────────────────────────────────────────────

/**
 * Processa uma mensagem do cliente e devolve a resposta — sem enviar nada
 * (quem chama decide como entregar: WhatsApp via sendWhatsApp, chat nativo
 * via JSON de resposta). O núcleo recebe só identidade já autenticada
 * (clienteId) + texto normalizado — nenhuma regra financeira aqui depende
 * de campo específico de nenhum canal de transporte.
 */
export async function processarMensagemControle(input: {
  cliente: Pick<Cliente, "id" | "telefone" | "nome" | "gratuito">;
  sessao: BotSessao;
  mensagem: string;
  // Usado pelo fluxo de "Comprovante Inteligente" do chat nativo (ver
  // route.ts de /api/minha-conta/comprovante/confirmar): quando o cliente
  // confirma um gasto extraído de foto, o texto normalizado ("Comprei em
  // X, R$ Y") é reinjetado aqui como se tivesse sido digitado — mesmo
  // padrão do webhook — mas com origem/comprovanteUrl corretos pra não
  // perder a rastreabilidade da foto original. Sem isso (chamada normal de
  // texto), cai no default "TEXTO" de sempre — nenhum comportamento
  // existente muda.
  origem?: OrigemLancamentoControle;
  comprovanteUrl?: string;
}): Promise<ResultadoOrquestrador> {
  const { cliente, sessao, mensagem } = input;
  const clienteId = cliente.id;
  const isGratuito = cliente.gratuito;
  const origemLancamentoControle: OrigemLancamentoControle = input.origem ?? "TEXTO";
  const comprovanteUrlControle = input.comprovanteUrl;

  const historico: Mensagem[] = JSON.parse(sessao.dividasTemp || "[]");

  const finalizar = async (
    resposta: string,
    opts?: {
      estadoNovo?: EstadoControleFinanceiro;
      atualizouEstado?: boolean;
      lancamentosCriados?: LancamentoCriado[];
      graficoCategoria?: GraficoCategoriaDado;
    }
  ): Promise<ResultadoOrquestrador> => {
    const historicoAtualizado: Mensagem[] = [
      ...historico,
      { role: "user", content: mensagem },
      { role: "assistant", content: resposta },
      ...(opts?.atualizouEstado && opts.estadoNovo ? [criarMensagemEstadoControle(opts.estadoNovo)] : []),
    ];
    await prisma.botSessao.updateMany({
      where: { id: sessao.id },
      data: { dividasTemp: JSON.stringify(historicoAtualizado) },
    });
    return { resposta, lancamentosCriados: opts?.lancamentosCriados, graficoCategoria: opts?.graficoCategoria };
  };

  // Sincroniza com o motor central (mesmo que o Dashboard usa) antes de
  // qualquer fluxo usar o estado — mesmo motivo do webhook: saldo não pode
  // divergir entre WhatsApp, chat nativo e o Dashboard.
  const estadoAntesFluxosControle = await sincronizarEstadoComMotorCentral(
    clienteId,
    carregarEstadoControle(historico, sessao.renda),
    sessao.renda
  );

  // 1) Correção de renda — grava em Cliente.rendaMensal (fonte real lida
  // por limite-seguro/simulador-parcela/horas-trabalho/plano-pagamento),
  // não só em BotSessao.renda.
  const correcaoRenda = corrigirRendaControle(mensagem, estadoAntesFluxosControle);
  if (correcaoRenda) {
    await prisma.cliente.updateMany({
      where: { id: clienteId },
      data: { rendaMensal: correcaoRenda.estado.rendaMensal },
    });
    const resultado = await finalizar(correcaoRenda.resposta, {
      estadoNovo: correcaoRenda.estado,
      atualizouEstado: correcaoRenda.atualizouEstado,
    });
    await prisma.botSessao.updateMany({ where: { id: sessao.id }, data: { renda: correcaoRenda.estado.rendaMensal } });
    return resultado;
  }

  // 1b) Comandos que o WhatsApp já tinha e o chat nativo não (achado em QA,
  // 04/10/2026: "desfazer" e "lembrete: ..." caíam em "Eu sou o assistente
  // financeiro..."). Desfazer só vale sem pendência de confirmação — um
  // "desfazer" no meio de uma prévia 1/2 é cancelar a prévia, não apagar o
  // último lançamento.
  // Skills compartilhadas com o WhatsApp (agentes/skills): mesma capacidade
  // nos dois canais, o canal só muda a entrada e a forma de responder.
  const ctxSkill: SkillContext = { userId: clienteId, timezone: "America/Sao_Paulo", channel: "app", gratuito: isGratuito };
  if (!estadoAntesFluxosControle.confirmacaoPendente && pedidoDesfazerLancamento(mensagem)) {
    const r = await skillRegistry.run<{ texto: string }>("desfazer_ultimo_lancamento", ctxSkill, {});
    return finalizar(r.ok ? r.data.texto : (r.userMessage ?? "Não consegui desfazer agora."));
  }

  const comandoTarefa = detectarComandoTarefa(mensagem);
  if (comandoTarefa) {
    const respostaTarefa = await processarComandoTarefa(clienteId, comandoTarefa, "TEXTO");
    // null = "concluir"/"cancelar" sem tarefa parecida: não intercepta, a
    // cascata normal continua (mesma regra do webhook).
    if (respostaTarefa) return finalizar(respostaTarefa);
  }

  // Feedback sobre alerta proativo do Sentinela ("útil", "errado", "parar esse
  // alerta", "parar alertas", "ativar alertas") — antes de qualquer IA, senão
  // "errado" cairia na interpretação de intenção. Sem alerta recente, devolve
  // null e a mensagem segue o pipeline normal.
  const feedbackAlerta = detectarFeedbackAlerta(mensagem);
  if (feedbackAlerta) {
    const respostaFeedback = await aplicarFeedbackAlerta(clienteId, feedbackAlerta);
    if (respostaFeedback) return finalizar(respostaFeedback);
  }

  // Pedido explícito em linguagem natural ("me lembra de pagar o IPVA dia 28")
  // — ver pedidoExplicitoDeLembrete. Sempre cria como "lembrete:", que lê a
  // data e o valor da própria frase.
  if (!comandoTarefa && pedidoExplicitoDeLembrete(mensagem)) {
    const r = await skillRegistry.run<{ texto: string }>("criar_lembrete", ctxSkill, { texto: mensagem, origem: "TEXTO" });
    if (r.ok) return finalizar(r.data.texto);
  }

  // "criar respiro": o Orientador de Quitação ensina esse comando — é a confirmação do cliente
  // pra criar a meta Respiro (colchão de 7 dias). Mesma skill do WhatsApp.
  if (detectarCriarRespiro(mensagem)) {
    const r = await skillRegistry.run<{ texto: string }>("criar_meta_respiro", ctxSkill, {});
    return finalizar(r.ok ? r.data.texto : r.userMessage ?? "Não consegui criar o Respiro agora. Tenta de novo em instantes.");
  }

  // 2) Consulta de cartões / faturas / saldo — leitura pura.
  // "Como está minha fatura?" e "meus cartões" respondem direto do banco
  // (cartões reais + ciclo de fechamento de cada um), nunca do estado antigo
  // da conversa — que só conhecia cartões configurados pelo chat e sempre
  // mostrava fatura R$ 0,00. Achado em QA do Ibrahim (04/10/2026).
  const resultadoConsultaCartoes = consultarCartoesControle(mensagem, estadoAntesFluxosControle);
  if (resultadoConsultaCartoes || detectarConsultaFatura(mensagem)) {
    const r = await skillRegistry.run<{ texto: string }>("consultar_fatura", ctxSkill, { mensagem });
    return finalizar(r.ok ? r.data.texto : "Não consegui consultar suas faturas agora. Tenta de novo em instantes.");
  }

  const resultadoConsultaSaldo = consultarSaldoControle(mensagem, estadoAntesFluxosControle);
  if (resultadoConsultaSaldo) return finalizar(resultadoConsultaSaldo.resposta);

  // 3) "Skill Analista" — oito consultas em linguagem natural, todas
  // leitura pura, ordem load-bearing (ver docs/chat-nativo-arquitetura.md).
  const tipoConsulta = detectarConsultaFinanceira(mensagem);
  if (tipoConsulta) {
    const perguntaSemValorEspecifico = tipoConsulta === "posso_gastar" && parseMoneyBR(mensagem) == null;
    const respostaConsulta = perguntaSemValorEspecifico
      ? await responderLimiteSeguro(clienteId, isGratuito)
      : await responderConsultaFinanceira(tipoConsulta, clienteId, mensagem, isGratuito);
    if (tipoConsulta === "como_economizar") registrarUsoCoach("pedido do cliente no chat");
    // "onde_gasto_mais" ganha também o card de gráfico estruturado — mesma
    // fonte (calcularResumoFinanceiro) que o texto acima já usa por baixo,
    // nunca um cálculo paralelo.
    const graficoCategoria =
      tipoConsulta === "onde_gasto_mais" ? (await calcularGraficoCategoria(clienteId)) ?? undefined : undefined;
    return finalizar(respostaConsulta, { graficoCategoria });
  }

  const deteccaoSimulacao = detectarSimulacaoParcela(mensagem);
  if (deteccaoSimulacao) {
    return finalizar(await responderSimulacaoParcela(clienteId, mensagem, isGratuito, deteccaoSimulacao));
  }

  if (detectarLimiteSeguro(mensagem)) {
    return finalizar(await responderLimiteSeguro(clienteId, isGratuito));
  }

  if (detectarRotaDividas(mensagem)) {
    return finalizar(await responderRotaDividas(clienteId, isGratuito));
  }

  const deteccaoMeta = detectarMetaPrazo(mensagem);
  if (deteccaoMeta) {
    return finalizar(await responderMetaPrazo(clienteId, isGratuito, deteccaoMeta));
  }

  if (detectarPlanoPagamento(mensagem)) {
    return finalizar(await responderPlanoPagamento(clienteId, isGratuito));
  }

  if (detectarConsultaVazamentos(mensagem)) {
    return finalizar(await responderConsultaVazamentos(clienteId, isGratuito));
  }

  if (detectarHorasTrabalho(mensagem)) {
    return finalizar(await responderHorasTrabalho(clienteId, mensagem, isGratuito));
  }

  const respostaConsultaLivre = await tentarResponderConsultaLivre(mensagem, clienteId, isGratuito);
  if (respostaConsultaLivre) return finalizar(respostaConsultaLivre);

  // 4) Gerenciamento de despesas fixas / fatura de cartão (com fallback de
  // classificação por IA quando há confirmação pendente).
  const gerenciamentoDespesasFixas = await gerenciarDespesasFixasComFallbackIA(mensagem, estadoAntesFluxosControle);
  if (gerenciamentoDespesasFixas) {
    const criados = await persistirLancamentosControle(
      clienteId,
      gerenciamentoDespesasFixas.itensParaPersistir,
      origemLancamentoControle,
      comprovanteUrlControle
    );
    await persistirCartaoControle(clienteId, gerenciamentoDespesasFixas.cartaoParaPersistir);
    await persistirDividaConfirmadaIA(clienteId, cliente.telefone, gerenciamentoDespesasFixas.dividaParaPersistir);
    await persistirPagamentoDividaConfirmadoIA(clienteId, cliente.telefone, gerenciamentoDespesasFixas.pagamentoDividaParaPersistir);
    await persistirMetaConfirmadaIA(clienteId, cliente.telefone, gerenciamentoDespesasFixas.metaParaPersistir);
    return finalizar(gerenciamentoDespesasFixas.resposta, {
      estadoNovo: gerenciamentoDespesasFixas.estado,
      atualizouEstado: gerenciamentoDespesasFixas.atualizouEstado,
      lancamentosCriados: criados,
    });
  }

  // 5) Detector de lançamento duplicado — mesmo dado que registrarGastoControle
  // e resolverValorGastoPendente usam pra comparar valor+estabelecimento
  // contra o que já foi lançado hoje.
  const lancamentosRecentesControle = await prisma.lancamento.findMany({
    where: { clienteId, data: { gte: inicioDoDiaBrasil(new Date()) } },
    select: { descricao: true, valor: true },
  });

  // 6) Resolve pendência "qual foi o valor desse gasto?" — precisa rodar
  // antes de qualquer outra coisa (inclusive antes do interpretador de IA).
  if (estadoAntesFluxosControle.confirmacaoPendente?.tipo === "aguardar_valor_gasto") {
    const resolvidoPendente = resolverValorGastoPendente(mensagem, estadoAntesFluxosControle, lancamentosRecentesControle);
    if (resolvidoPendente) {
      const criados = await persistirLancamentosControle(clienteId, resolvidoPendente.itensParaPersistir, origemLancamentoControle, comprovanteUrlControle);
      return finalizar(resolvidoPendente.resposta, {
        estadoNovo: resolvidoPendente.estado,
        atualizouEstado: resolvidoPendente.atualizouEstado,
        lancamentosCriados: criados,
      });
    }
  }

  // 7) Resolve pendência "qual foi o valor desse pagamento?" (dívida).
  if (estadoAntesFluxosControle.confirmacaoPendente?.tipo === "aguardar_valor_pagamento_divida") {
    const resolvidoPagamento = resolverValorPagamentoDividaPendente(mensagem, estadoAntesFluxosControle);
    if (resolvidoPagamento) {
      await persistirPagamentoDividaConfirmadoIA(clienteId, cliente.telefone, resolvidoPagamento.pagamentoDividaParaPersistir);
      return finalizar(resolvidoPagamento.resposta, {
        estadoNovo: resolvidoPagamento.estado,
        atualizouEstado: resolvidoPagamento.atualizouEstado,
      });
    }
  }

  // 8) Correção de origem do último gasto ("na verdade foi no Nubank").
  const correcaoOrigem = corrigirOrigemUltimoGastoControle(mensagem, estadoAntesFluxosControle);
  if (correcaoOrigem) {
    await corrigirOrigemLancamentoControle(clienteId, estadoAntesFluxosControle.ultimoGasto, correcaoOrigem.estado.ultimoGasto?.cartao);
    return finalizar(correcaoOrigem.resposta, {
      estadoNovo: correcaoOrigem.estado,
      atualizouEstado: correcaoOrigem.atualizouEstado,
    });
  }

  // 9) Fatura de cartão (com fallback de IA quando há confirmação pendente
  // de "substituir fatura fechada").
  const gerenciamentoFaturaCartao = await gerenciarFaturaCartaoComFallbackIA(mensagem, estadoAntesFluxosControle);
  if (gerenciamentoFaturaCartao) {
    const criados = await persistirLancamentosControle(clienteId, gerenciamentoFaturaCartao.itensParaPersistir, origemLancamentoControle, comprovanteUrlControle);
    return finalizar(gerenciamentoFaturaCartao.resposta, {
      estadoNovo: gerenciamentoFaturaCartao.estado,
      atualizouEstado: gerenciamentoFaturaCartao.atualizouEstado,
      lancamentosCriados: criados,
    });
  }

  // 10) Configuração de cartão (fechamento/vencimento).
  const configuracaoCartao = configurarCartaoControle(mensagem, estadoAntesFluxosControle);
  if (configuracaoCartao) {
    await persistirCartaoControle(clienteId, configuracaoCartao.cartaoParaPersistir);
    return finalizar(configuracaoCartao.resposta, {
      estadoNovo: configuracaoCartao.estado,
      atualizouEstado: configuracaoCartao.atualizouEstado,
    });
  }

  // 11) Interpretação geral de intenção financeira (IA) — precisa rodar
  // DEPOIS das 8 consultas "Skill Analista" e da consulta livre (item 3):
  // o caminho "fora de escopo" deste resolver é terminal, então um
  // classificador de consulta colocado depois dele nunca seria alcançado.
  // Pendência "qual foi o valor?" NÃO bloqueia o interpretador: se a
  // mensagem fosse só o valor, o passo 6/7 já teria resolvido; qualquer
  // outra coisa é assunto novo (achado em QA, 04/10/2026: "quero criar uma
  // meta..." caía no menu de resgate porque uma pergunta de valor antiga
  // continuava pendente). Já 1/2 de uma prévia continua sendo bloqueado.
  const tipoPendencia = estadoAntesFluxosControle.confirmacaoPendente?.tipo;
  const pendenciaDeValor = tipoPendencia === "aguardar_valor_gasto" || tipoPendencia === "aguardar_valor_pagamento_divida";
  const intentFinanceiro = await resolverIntencaoFinanceiraIA(mensagem, {
    temConfirmacaoPendente: Boolean(estadoAntesFluxosControle.confirmacaoPendente) && !pendenciaDeValor,
  });
  if (intentFinanceiro) {
    const intentConfirmavel = intentFinanceiroConfirmavel(intentFinanceiro);

    if (intentConfirmavel && podeAutoRegistrarIntentFinanceiro(intentFinanceiro)) {
      const resultado = salvarItensConfirmadosIA(estadoAntesFluxosControle, intentFinanceiro);
      const criados = await persistirLancamentosControle(clienteId, resultado.itensParaPersistir, origemLancamentoControle, comprovanteUrlControle);
      await persistirCartaoControle(clienteId, resultado.cartaoParaPersistir);
      await persistirDividaConfirmadaIA(clienteId, cliente.telefone, resultado.dividaParaPersistir);
      await persistirPagamentoDividaConfirmadoIA(clienteId, cliente.telefone, resultado.pagamentoDividaParaPersistir);
      await persistirMetaConfirmadaIA(clienteId, cliente.telefone, resultado.metaParaPersistir);
      return finalizar(resultado.resposta, {
        estadoNovo: resultado.estado,
        atualizouEstado: resultado.atualizouEstado,
        lancamentosCriados: criados,
      });
    }

    // Pagamento de dívida reconhecido (com credor) mas sem valor.
    if (
      !intentConfirmavel &&
      intentFinanceiro.emEscopo &&
      intentFinanceiro.itens.length === 1 &&
      intentFinanceiro.itens[0].tipo === "pagamento_divida"
    ) {
      const credorAproximado = intentFinanceiro.itens[0].descricaoNormalizada || "Dívida";
      const respostaPendencia = respostaAguardarValorPagamentoDivida(credorAproximado);
      const estadoComPendencia = criarEstadoComPendenciaPagamentoDivida(estadoAntesFluxosControle, credorAproximado);
      return finalizar(respostaPendencia, { estadoNovo: estadoComPendencia, atualizouEstado: true });
    }

    // Mensagem que nenhuma regra reconheceu como registro: conversa livre do Quita antes da resposta fixa.
    const conversaLivre = !intentFinanceiro.emEscopo && podeConversarLivre(mensagem) ? await responderConversaLivre(mensagem, clienteId, isGratuito) : null;
    const respostaIntent = conversaLivre ?? formatarPreviaIntentFinanceiro(intentFinanceiro);
    const estadoComIntent = intentConfirmavel
      ? criarEstadoComConfirmacaoInterpretacaoFinanceira(estadoAntesFluxosControle, intentFinanceiro)
      : estadoAntesFluxosControle;
    return finalizar(respostaIntent, { estadoNovo: estadoComIntent, atualizouEstado: intentConfirmavel });
  }

  // 12) "Gasto rápido" — catch-all determinístico pra despesas do dia a
  // dia ("gastei 45 no mercado"). Maior volume de uso do bot inteiro.
  const gastoRapido = registrarGastoControle(mensagem, estadoAntesFluxosControle, new Date(), lancamentosRecentesControle);
  if (gastoRapido) {
    const criados = await persistirLancamentosControle(clienteId, gastoRapido.itensParaPersistir, origemLancamentoControle, comprovanteUrlControle);
    return finalizar(gastoRapido.resposta, {
      estadoNovo: gastoRapido.estado,
      atualizouEstado: gastoRapido.atualizouEstado,
      lancamentosCriados: criados,
    });
  }

  // 12b) Pedido de lembrete em linguagem natural ("me lembra de pagar o
  // condomínio dia 25") — último recurso antes do rescue, igual ao webhook:
  // só chega aqui se nada acima reconheceu a mensagem.
  const tipoLembreteIA = devePularFallbackLembreteIA(comandoTarefa, null)
    ? null
    : await classificarLembreteLivreIA(mensagem);
  if (tipoLembreteIA) {
    // Sempre "lembrete:" — "pagamento:" ignora a data pedida (vencimento
    // vira hoje) e é pra registrar um pagamento, não pra agendar um aviso.
    const comandoTarefaIA = detectarComandoTarefa(`lembrete: ${mensagem}`);
    if (comandoTarefaIA) {
      const respostaTarefaIA = await processarComandoTarefa(clienteId, comandoTarefaIA, "TEXTO");
      if (respostaTarefaIA) return finalizar(respostaTarefaIA);
    }
  }

  // 13) Nada determinístico reconheceu a mensagem — cai no mesmo rescue
  // ladder que o WhatsApp usa (ai-bot.ts), canal-agnóstico por design.
  const resultado = await processarMensagemIA(historico, mensagem, cliente.nome ?? "cliente", clienteId, isGratuito, cliente.telefone);
  return finalizar(resultado.resposta);
}
