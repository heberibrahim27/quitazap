// ─────────────────────────────────────────
// Agente Sentinela — ciclo observar → decidir → agir (cron diário)
// ─────────────────────────────────────────
// Objetivo: proteger o cliente de situações financeiras relevantes sem virar
// spam. Percepção: detectores determinísticos (alertas.ts). Decisão: junta
// os candidatos de todos os detectores e escolhe UM (o mais prioritário que
// a política libera). Ação: manda por WhatsApp (+ push) e registra. Limites
// de autonomia: politica.ts (cota diária/semanal, silêncio, opt-out por tipo,
// dedupe). Nenhum LLM decide nada aqui — texto é template; só a anomalia
// reaproveita o texto que o cron insights-sombra já redigiu.

import { prisma } from "@/lib/prisma";
import { anoMesAtualBrasil, calcularResumoFinanceiro, limitesDoMes } from "@/lib/financeiro/motor";
import { calcularLimiteSeguro } from "@/lib/financeiro/limite-seguro";
import { resumirFaturasDoCartao, deslocarMes } from "@/lib/financeiro/fatura-cartao";
import { deliverReminder } from "@/lib/reminder-delivery";
import { enviarPush } from "@/lib/push-service";
import { whereStatusAssinatura } from "@/lib/status-assinatura";
import {
  detectarAnomalias,
  detectarFechamentoFatura,
  detectarFechamentoMes,
  detectarOrcamento,
  detectarProjecaoNegativa,
  proximoFechamento,
  type CandidatoAlerta,
} from "./alertas";
import { atualizarCobertura, selecionarLote, TAMANHO_LOTE_PADRAO } from "./lotes";
import { disjuntorAberto, escolherAlerta, type MotivoBloqueio } from "./politica";
import {
  carregarCoberturaDoDia,
  carregarHistoricoAlertas,
  carregarSaudeAlertas,
  carregarTiposDesligados,
  registrarAlertaEnviado,
  registrarExecucaoAgente,
} from "./alertas-store";

const TIPOS_GASTO = ["DESPESA_FIXA", "DESPESA_VARIAVEL", "COMPRA_CARTAO"];
const AGENTE = "sentinela";
const RODAPE_FEEDBACK = "\n\n_Foi útil? Responda *útil*, *errado* ou *parar esse alerta*._";
/** Tempo da função serverless: ao estourar, o lote para e o checkpoint segue dali. */
const ORCAMENTO_DE_TEMPO_MS = 50_000;

export interface OpcoesSentinela {
  agora?: Date;
  clienteId?: string;
  /** Só avalia e devolve a decisão; não envia nem registra nada. */
  dryRun?: boolean;
  incluirTestes?: boolean;
  /** Injeção pra teste/ensaio; padrão envia por WhatsApp de verdade. */
  enviar?: (telefone: string, texto: string, modo?: string | null) => Promise<void>;
}

export interface DecisaoCliente {
  clienteId: string;
  candidatos: number;
  escolhido: string | null;
  bloqueioGlobal: MotivoBloqueio | null;
  pulados: Array<{ chave: string; motivo: MotivoBloqueio }>;
  enviado: boolean;
}

export interface ResultadoSentinela {
  clientesAvaliados: number;
  enviados: number;
  decisoes: DecisaoCliente[];
  erros: string[];
}

export async function coletarCandidatos(clienteId: string, agora: Date): Promise<CandidatoAlerta[]> {
  const { ano, mes } = anoMesAtualBrasil(agora);
  const periodKey = `${ano}-${String(mes).padStart(2, "0")}`;
  const periodo = limitesDoMes(ano, mes);
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaHoje = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(agora));
  const diasRestantes = Math.max(diasNoMes - diaHoje, 0);

  const [orcamentos, gastosPorCategoria, limiteSeguro, cartoes, insights] = await Promise.all([
    prisma.orcamentoCategoria.findMany({ where: { clienteId } }),
    prisma.lancamento.groupBy({
      by: ["categoria"],
      where: { clienteId, tipo: { in: TIPOS_GASTO }, data: { gte: periodo.inicio, lt: periodo.fim } },
      _sum: { valor: true },
    }),
    calcularLimiteSeguro(clienteId, agora).catch(() => null),
    prisma.cartao.findMany({ where: { clienteId } }),
    prisma.insightDetectado.findMany({ where: { clienteId, mes: periodKey, status: "SOMBRA" } }),
  ]);

  const gastoDe = new Map(gastosPorCategoria.map((g) => [g.categoria ?? "", g._sum.valor ?? 0]));
  const candidatos: CandidatoAlerta[] = [];

  candidatos.push(
    ...detectarOrcamento(
      orcamentos.map((o) => ({ categoria: o.categoria, limite: o.limiteMensal, gasto: gastoDe.get(o.categoria) ?? 0 })),
      { periodKey, diasRestantes }
    )
  );

  if (limiteSeguro) {
    candidatos.push(
      ...detectarProjecaoNegativa(
        { saldoLivre: limiteSeguro.saldoLivre, semDadosSuficientes: limiteSeguro.semDadosSuficientes, diasRestantes },
        { periodKey }
      )
    );
  }

  // Fatura aberta só é calculada pros cartões que fecham em 2 dias.
  const fechando = cartoes.filter((c) => c.diaFechamento != null && proximoFechamento(c.diaFechamento, agora).diasAte === 2);
  const valores = new Map<string, number>();
  if (fechando.length > 0) {
    const ini = deslocarMes(ano, mes, -3);
    const fim = deslocarMes(ano, mes, 3);
    const compras = await prisma.lancamento.findMany({
      where: {
        clienteId,
        tipo: "COMPRA_CARTAO",
        cartaoId: { in: fechando.map((c) => c.id) },
        data: { gte: limitesDoMes(ini.ano, ini.mes).inicio, lt: limitesDoMes(fim.ano, fim.mes).fim },
      },
      select: { cartaoId: true, valor: true, data: true },
    });
    for (const c of fechando) {
      const resumo = resumirFaturasDoCartao(
        { nome: c.nome, diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento },
        compras.filter((l) => l.cartaoId === c.id),
        agora
      );
      valores.set(c.id, resumo.atual.valor);
    }
  }
  candidatos.push(
    ...detectarFechamentoFatura(
      cartoes.map((c) => ({ id: c.id, nome: c.nome, diaFechamento: c.diaFechamento, valorFaturaAberta: valores.get(c.id) })),
      agora
    )
  );

  // Fechamento do mês anterior: só nos 3 primeiros dias do mês.
  if (diaHoje <= 3) {
    const anterior = deslocarMes(ano, mes, -1);
    const periodoAnterior = limitesDoMes(anterior.ano, anterior.mes);
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { rendaMensal: true } });
    const resumo = await calcularResumoFinanceiro({ clienteId, periodo: periodoAnterior, rendaMensalDeclarada: cliente?.rendaMensal ?? null }).catch(() => null);
    if (resumo) {
      const top = [...resumo.porCategoria].sort((a, b) => b.total - a.total)[0] ?? null;
      const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(periodoAnterior.inicio);
      candidatos.push(
        ...detectarFechamentoMes(
          {
            nomeMes,
            periodKey: `${anterior.ano}-${String(anterior.mes).padStart(2, "0")}`,
            receitas: resumo.totais.receitas,
            saidas: resumo.totais.totalSaidasOperacionais,
            resultado: resumo.totais.resultadoAntesInvestimentos,
            guardadoEmMetas: resumo.totais.investimentos,
            topCategoria: top,
            quantidadeLancamentos: resumo.quantidadeLancamentos,
          },
          diaHoje
        )
      );
    }
  }

  // Anomalia: o InsightDetectado nasce em modo SOMBRA de propósito — o texto
  // é redigido por IA e o fundador revisa em /insights-sombra antes de liberar
  // o envio. Por isso só vira alerta com SENTINELA_ANOMALIA_ATIVA=true.
  const anomaliaLiberada = process.env.SENTINELA_ANOMALIA_ATIVA === "true";
  candidatos.push(
    ...detectarAnomalias(
      (anomaliaLiberada ? insights : []).map((i) => ({
        id: i.id,
        categoria: i.categoria,
        mes: i.mes,
        totalMesAtual: i.totalMesAtual,
        mediaUltimosMeses: i.mediaUltimosMeses,
        multiplicador: i.multiplicador,
        textoGerado: i.textoGerado,
      }))
    )
  );

  return candidatos;
}

/**
 * Envio IMEDIATO de um alerta que o próprio sistema detectou no meio de uma
 * ação do cliente (ex.: ficou no vermelho ao lançar um gasto). Passa pela
 * mesma política do ciclo diário — cota, silêncio, opt-out, dedupe — e, se
 * bloqueado, simplesmente não envia: o ciclo das 08:30 reavalia depois.
 */
export async function enviarAlertaAgora(
  clienteId: string,
  candidato: CandidatoAlerta,
  opcoes: { agora?: Date; enviar?: OpcoesSentinela["enviar"] } = {}
): Promise<{ enviado: boolean; motivo?: MotivoBloqueio | "SEM_CLIENTE" }> {
  const agora = opcoes.agora ?? new Date();
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { telefone: true, aceitaProativas: true },
  });
  if (!cliente) return { enviado: false, motivo: "SEM_CLIENTE" };

  const [historico, tiposDesligados] = await Promise.all([carregarHistoricoAlertas(clienteId, agora), carregarTiposDesligados(clienteId)]);
  const escolha = escolherAlerta([candidato], { agora, aceitaProativas: cliente.aceitaProativas, tiposDesligados, historico });
  if (!escolha.escolhido) {
    return { enviado: false, motivo: escolha.bloqueioGlobal ?? escolha.pulados[0]?.motivo };
  }

  const texto = candidato.mensagem + RODAPE_FEEDBACK;
  await registrarAlertaEnviado(clienteId, candidato, texto, { agente: AGENTE, canal: "WHATSAPP", enviadoEm: agora });
  const enviar = opcoes.enviar ?? (async (tel: string, t: string, modo?: string | null) => deliverReminder({ phone: tel, mensagem: t, modo }));
  await enviar(cliente.telefone, texto, null);
  return { enviado: true };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function agenteDesligadoPorConfig(): boolean {
  const lista = (process.env.AGENTES_DESLIGADOS ?? "").split(",").map((s) => s.trim().toLowerCase());
  return lista.includes(AGENTE);
}

function motivosAgregados(decisoes: DecisaoCliente[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of decisoes) {
    if (d.enviado) continue;
    const motivo = d.bloqueioGlobal ?? d.pulados[0]?.motivo ?? "SEM_CANDIDATO";
    out[motivo] = (out[motivo] ?? 0) + 1;
  }
  return out;
}

export async function executarSentinela(opcoes: OpcoesSentinela = {}): Promise<ResultadoSentinela> {
  const agora = opcoes.agora ?? new Date();
  const iniciadoEm = new Date();
  const resultado: ResultadoSentinela = { clientesAvaliados: 0, enviados: 0, decisoes: [], erros: [] };

  // Interruptores: configuração (AGENTES_DESLIGADOS=sentinela) e disjuntor
  // global (muito alerta errado/silenciado nos últimos 7 dias). Os dois
  // ficam registrados na execução, pra aparecer na tela de Agentes.
  if (agenteDesligadoPorConfig()) {
    if (!opcoes.dryRun) {
      await registrarExecucaoAgente({ agente: AGENTE, iniciadoEm, terminadoEm: new Date(), clientesAvaliados: 0, acoes: 0, erros: [], detalhes: { pausado: "DESLIGADO_POR_CONFIG" } });
    }
    return resultado;
  }
  const saude = await carregarSaudeAlertas(agora);
  if (disjuntorAberto(saude)) {
    if (!opcoes.dryRun) {
      await registrarExecucaoAgente({ agente: AGENTE, iniciadoEm, terminadoEm: new Date(), clientesAvaliados: 0, acoes: 0, erros: [], detalhes: { pausado: "DISJUNTOR", saude } });
    }
    resultado.erros.push("disjuntor aberto — muitos alertas errados/silenciados nos últimos 7 dias");
    return resultado;
  }

  const filtro = {
    aceitaProativas: true,
    ...(opcoes.clienteId ? { id: opcoes.clienteId } : opcoes.incluirTestes ? { gratuito: false } : whereStatusAssinatura("PAGO")),
  };
  const todosIds = (await prisma.cliente.findMany({ where: filtro, select: { id: true }, orderBy: { id: "asc" } })).map((c) => c.id);

  // Lotes com checkpoint: cada execução continua de onde a anterior DO MESMO
  // DIA parou. Execução de um cliente só (ensaio/QA) ou dryRun não usa nem
  // grava checkpoint.
  const usaCheckpoint = !opcoes.clienteId && !opcoes.dryRun;
  const diaHoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const coberturaAnterior = usaCheckpoint ? await carregarCoberturaDoDia(AGENTE, diaHoje) : null;
  if (usaCheckpoint && coberturaAnterior?.concluido) return resultado; // dia já coberto: nada a fazer, nada a registrar

  const idsDoLote = opcoes.clienteId ? todosIds : selecionarLote(todosIds, coberturaAnterior?.cursor ?? null, TAMANHO_LOTE_PADRAO);
  const encontrados = await prisma.cliente.findMany({
    where: { id: { in: idsDoLote } },
    select: { id: true, telefone: true, nome: true, modoLembrete: true, aceitaProativas: true },
  });
  const porId = new Map(encontrados.map((c) => [c.id, c]));
  const clientes = idsDoLote.map((id) => porId.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const processados: string[] = [];

  const enviar = opcoes.enviar ?? (async (tel: string, texto: string, modo?: string | null) => deliverReminder({ phone: tel, mensagem: texto, modo }));

  for (const cliente of clientes) {
    // Tempo esgotado: para aqui; o checkpoint continua deste ponto (não é erro).
    if (Date.now() - iniciadoEm.getTime() > ORCAMENTO_DE_TEMPO_MS) break;
    resultado.clientesAvaliados++;
    processados.push(cliente.id);
    try {
      const [candidatos, historico, tiposDesligados] = await Promise.all([
        coletarCandidatos(cliente.id, agora),
        carregarHistoricoAlertas(cliente.id, agora),
        carregarTiposDesligados(cliente.id),
      ]);

      const escolha = escolherAlerta(candidatos, { agora, aceitaProativas: cliente.aceitaProativas, tiposDesligados, historico });
      const decisao: DecisaoCliente = {
        clienteId: cliente.id,
        candidatos: candidatos.length,
        escolhido: escolha.escolhido ? `${escolha.escolhido.tipo}|${escolha.escolhido.entityId}|${escolha.escolhido.qualifier}` : null,
        bloqueioGlobal: escolha.bloqueioGlobal,
        pulados: escolha.pulados,
        enviado: false,
      };

      if (escolha.escolhido && !opcoes.dryRun) {
        const texto = escolha.escolhido.mensagem + RODAPE_FEEDBACK;
        // Registra ANTES de enviar: se o processo cair no meio, o pior caso é
        // um alerta marcado como enviado que não saiu (cliente não é
        // incomodado); o inverso — enviar e repetir amanhã — é o que irrita.
        await registrarAlertaEnviado(cliente.id, escolha.escolhido, texto, { agente: AGENTE, canal: "WHATSAPP", enviadoEm: agora });
        try {
          await enviar(cliente.telefone, texto, null);
          await enviarPush(cliente.id, { titulo: "QuitaZAP", corpo: escolha.escolhido.mensagem.replace(/[*_]/g, "").slice(0, 180), url: "/minha-conta/chat" }).catch(() => 0);
          if (escolha.escolhido.tipo === "SPENDING_ANOMALY") {
            await prisma.insightDetectado.update({ where: { id: escolha.escolhido.entityId }, data: { status: "ENVIADO" } }).catch(() => undefined);
          }
          decisao.enviado = true;
          resultado.enviados++;
          // Dispersão: nunca vários clientes no mesmo instante (padrão de envio
          // em rajada é o que o WhatsApp penaliza).
          if (!opcoes.enviar) await dormir(250 + Math.floor(Math.random() * 750));
        } catch (err) {
          resultado.erros.push(`${cliente.id}: envio falhou (${err instanceof Error ? err.message : String(err)})`);
        }
      }
      resultado.decisoes.push(decisao);
    } catch (err) {
      resultado.erros.push(`${cliente.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!opcoes.dryRun) {
    await registrarExecucaoAgente({
      agente: AGENTE,
      iniciadoEm,
      terminadoEm: new Date(),
      clientesAvaliados: resultado.clientesAvaliados,
      acoes: resultado.enviados,
      puladas: resultado.decisoes.filter((d) => !d.enviado).length,
      erros: resultado.erros,
      detalhes: {
        motivosSupressao: motivosAgregados(resultado.decisoes),
        versao: "1.0",
        ...(usaCheckpoint ? { cobertura: atualizarCobertura(coberturaAnterior, diaHoje, processados, todosIds) } : {}),
      },
    });
  }
  return resultado;
}
