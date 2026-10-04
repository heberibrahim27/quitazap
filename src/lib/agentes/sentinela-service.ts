// ─────────────────────────────────────────
// Ciclo dos agentes proativos — observar → propor → arbitrar → agir
// ─────────────────────────────────────────
// Arquitetura multiagente com arbitragem centralizada (desenho acordado com o
// ChatGPT, 04/10/2026):
//   • cada AGENTE (Sentinela, Cartões, Compromissos, Metas, Dívidas,
//     Lançamentos, Fechamento) lê os dados que lhe interessam (coletores.ts) e
//     entrega no MÁXIMO 1 candidato por cliente por ciclo — o melhor dele que a
//     política libera;
//   • o árbitro (politica.ts) escolhe, entre esses, o de maior prioridade:
//     1 mensagem por cliente por dia, 4 por semana, silêncio 21h–8h, opt-out
//     por tipo e geral, dedupe por chave e por assunto, disjuntor global e por
//     agente;
//   • quem age é este ciclo: manda por WhatsApp (+ push) e registra.
// Nenhum LLM decide nada aqui — texto é template com números do backend. Só a
// anomalia reaproveita o texto já redigido pelo cron insights-sombra (e fica
// desligada por padrão).
// O nome do arquivo ficou "sentinela" por histórico; o Sentinela agora é um
// dos agentes do ciclo.

import { prisma } from "@/lib/prisma";
import { deliverReminder } from "@/lib/reminder-delivery";
import { enviarPush } from "@/lib/push-service";
import { whereTemAcesso } from "@/lib/status-assinatura";
import { AGENTE_DO_TIPO, type AgenteId, type CandidatoAlerta } from "./alertas";
import { coletarPorAgente } from "./coletores";
import { atualizarCobertura, selecionarLote, TAMANHO_LOTE_PADRAO } from "./lotes";
import { agentesPausadosPorDisjuntor, disjuntorAberto, escolherAlerta, type MotivoBloqueio } from "./politica";
import {
  carregarCoberturaDoDia,
  carregarHistoricoAlertas,
  carregarSaudeAlertas,
  carregarSaudePorTipo,
  carregarTiposDesligados,
  registrarAlertaEnviado,
  registrarExecucaoAgente,
} from "./alertas-store";

const AGENTE_CICLO = "sentinela"; // dono da cobertura/checkpoint do ciclo
const AGENTES_PROPONENTES: AgenteId[] = ["sentinela", "cartoes", "compromissos", "metas", "dividas", "lancamentos", "fechamento", "orientador"];
const RODAPE_FEEDBACK = "\n\n_Foi útil? Responda *útil*, *errado* ou *parar esse alerta*._";
/** Tempo da função serverless: ao estourar, o lote para e o checkpoint segue dali. */
const ORCAMENTO_DE_TEMPO_MS = 50_000;
const VERSAO = "1.1";

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
  /** Um candidato por agente (o pool do árbitro). */
  propostos: string[];
  escolhido: string | null;
  agenteEscolhido: AgenteId | null;
  bloqueioGlobal: MotivoBloqueio | null;
  pulados: Array<{ chave: string; motivo: MotivoBloqueio }>;
  errosPorAgente: Partial<Record<AgenteId, string>>;
  enviado: boolean;
}

export interface ResultadoSentinela {
  clientesAvaliados: number;
  enviados: number;
  decisoes: DecisaoCliente[];
  erros: string[];
}

function agentesDesligadosPorConfig(): AgenteId[] {
  const lista = (process.env.AGENTES_DESLIGADOS ?? "").split(",").map((s) => s.trim().toLowerCase());
  return AGENTES_PROPONENTES.filter((a) => lista.includes(a));
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
  await registrarAlertaEnviado(clienteId, candidato, texto, { agente: AGENTE_DO_TIPO[candidato.tipo], canal: "WHATSAPP", enviadoEm: agora });
  const enviar = opcoes.enviar ?? (async (tel: string, t: string, modo?: string | null) => deliverReminder({ phone: tel, mensagem: t, modo }));
  await enviar(cliente.telefone, texto, null);
  return { enviado: true };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Acumulador {
  brutos: number;
  propostos: number;
  selecionados: number;
  bloqueadosPolitica: number;
  enviados: number;
  erros: string[];
  pausado?: string;
}

function novoAcumulador(): Acumulador {
  return { brutos: 0, propostos: 0, selecionados: 0, bloqueadosPolitica: 0, enviados: 0, erros: [] };
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

  // Interruptores: configuração (AGENTES_DESLIGADOS=sentinela desliga o ciclo
  // inteiro; outro nome desliga só aquele agente) e disjuntores (global e por
  // agente: muito alerta errado/silenciado nos últimos 7 dias). Tudo fica
  // registrado na execução, pra aparecer na tela de Agentes.
  const desligados = agentesDesligadosPorConfig();
  if (desligados.includes("sentinela")) {
    if (!opcoes.dryRun) {
      await registrarExecucaoAgente({ agente: AGENTE_CICLO, iniciadoEm, terminadoEm: new Date(), clientesAvaliados: 0, acoes: 0, erros: [], detalhes: { pausado: "DESLIGADO_POR_CONFIG" } });
    }
    return resultado;
  }
  const saude = await carregarSaudeAlertas(agora);
  if (disjuntorAberto(saude)) {
    if (!opcoes.dryRun) {
      await registrarExecucaoAgente({ agente: AGENTE_CICLO, iniciadoEm, terminadoEm: new Date(), clientesAvaliados: 0, acoes: 0, erros: [], detalhes: { pausado: "DISJUNTOR", saude } });
    }
    resultado.erros.push("disjuntor aberto — muitos alertas errados/silenciados nos últimos 7 dias");
    return resultado;
  }
  const pausadosDisjuntor = agentesPausadosPorDisjuntor(await carregarSaudePorTipo(agora));
  const agentesPausados = [...new Set<AgenteId>([...desligados, ...pausadosDisjuntor])];

  const filtro = {
    aceitaProativas: true,
    ...(opcoes.clienteId ? { id: opcoes.clienteId } : opcoes.incluirTestes ? { gratuito: false } : whereTemAcesso(agora)),
  };
  const todosIds = (await prisma.cliente.findMany({ where: filtro, select: { id: true }, orderBy: { id: "asc" } })).map((c) => c.id);

  // Lotes com checkpoint: cada execução continua de onde a anterior DO MESMO
  // DIA parou. Execução de um cliente só (ensaio/QA) ou dryRun não usa nem
  // grava checkpoint.
  const usaCheckpoint = !opcoes.clienteId && !opcoes.dryRun;
  const diaHoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const coberturaAnterior = usaCheckpoint ? await carregarCoberturaDoDia(AGENTE_CICLO, diaHoje) : null;
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
  const acum: Record<AgenteId, Acumulador> = Object.fromEntries(AGENTES_PROPONENTES.map((a) => [a, novoAcumulador()])) as Record<AgenteId, Acumulador>;
  for (const a of agentesPausados) acum[a].pausado = desligados.includes(a) ? "DESLIGADO_POR_CONFIG" : "DISJUNTOR_DO_AGENTE";
  let dicasDoCoachEnviadas = 0;

  for (const cliente of clientes) {
    // Tempo esgotado: para aqui; o checkpoint continua deste ponto (não é erro).
    if (Date.now() - iniciadoEm.getTime() > ORCAMENTO_DE_TEMPO_MS) break;
    resultado.clientesAvaliados++;
    processados.push(cliente.id);
    try {
      const [coleta, historico, tiposDesligados] = await Promise.all([
        coletarPorAgente(cliente.id, agora, agentesPausados),
        carregarHistoricoAlertas(cliente.id, agora),
        carregarTiposDesligados(cliente.id),
      ]);
      const candidatos = coleta.candidatos;
      for (const c of candidatos) acum[AGENTE_DO_TIPO[c.tipo]].brutos++;
      for (const [agente, erro] of Object.entries(coleta.erros) as Array<[AgenteId, string]>) {
        if (acum[agente].erros.length < 5) acum[agente].erros.push(`${cliente.id}: ${erro}`);
      }

      const escolha = escolherAlerta(candidatos, { agora, aceitaProativas: cliente.aceitaProativas, tiposDesligados, historico });
      for (const [agente, s] of Object.entries(escolha.porAgente) as Array<[AgenteId, { bloqueados: number; proposto: string | null }]>) {
        acum[agente].bloqueadosPolitica += s.bloqueados;
        if (s.proposto) acum[agente].propostos++;
      }
      const agenteEscolhido = escolha.escolhido ? AGENTE_DO_TIPO[escolha.escolhido.tipo] : null;
      if (agenteEscolhido) acum[agenteEscolhido].selecionados++;

      const decisao: DecisaoCliente = {
        clienteId: cliente.id,
        candidatos: candidatos.length,
        propostos: escolha.propostos.map((c) => `${c.tipo}|${c.entityId}|${c.qualifier}`),
        escolhido: escolha.escolhido ? `${escolha.escolhido.tipo}|${escolha.escolhido.entityId}|${escolha.escolhido.qualifier}` : null,
        agenteEscolhido,
        bloqueioGlobal: escolha.bloqueioGlobal,
        pulados: escolha.pulados,
        errosPorAgente: coleta.erros,
        enviado: false,
      };

      if (escolha.escolhido && !opcoes.dryRun) {
        const vencedor = escolha.escolhido;
        // Conferência final contra corrida: outro processo pode ter enviado algo
        // a este cliente entre a leitura do histórico e agora. Cliente + dia =
        // um vencedor no máximo.
        const historicoFresco = await carregarHistoricoAlertas(cliente.id, agora);
        const recheck = escolherAlerta([vencedor], { agora, aceitaProativas: cliente.aceitaProativas, tiposDesligados, historico: historicoFresco });
        if (!recheck.escolhido) {
          decisao.bloqueioGlobal = recheck.bloqueioGlobal ?? recheck.pulados[0]?.motivo ?? null;
          decisao.escolhido = null;
          resultado.decisoes.push(decisao);
          continue;
        }

        const texto = vencedor.mensagem + RODAPE_FEEDBACK;
        // Registra ANTES de enviar: se o processo cair no meio, o pior caso é
        // um alerta marcado como enviado que não saiu (cliente não é
        // incomodado); o inverso — enviar e repetir amanhã — é o que irrita.
        await registrarAlertaEnviado(cliente.id, vencedor, texto, { agente: AGENTE_DO_TIPO[vencedor.tipo], canal: "WHATSAPP", enviadoEm: agora });
        try {
          await enviar(cliente.telefone, texto, null);
          await enviarPush(cliente.id, { titulo: "QuitaZAP", corpo: vencedor.mensagem.replace(/[*_]/g, "").slice(0, 180), url: "/minha-conta/chat" }).catch(() => 0);
          if (vencedor.tipo === "SPENDING_ANOMALY") {
            await prisma.insightDetectado.update({ where: { id: vencedor.entityId }, data: { status: "ENVIADO" } }).catch(() => undefined);
          }
          if (vencedor.tipo === "MONTH_CLOSING" && vencedor.payload?.coach === true) dicasDoCoachEnviadas++;
          decisao.enviado = true;
          resultado.enviados++;
          acum[AGENTE_DO_TIPO[vencedor.tipo]].enviados++;
          // Dispersão: nunca vários clientes no mesmo instante (padrão de envio
          // em rajada é o que o WhatsApp penaliza).
          if (!opcoes.enviar) await dormir(250 + Math.floor(Math.random() * 750));
        } catch (err) {
          const msg = `${cliente.id}: envio falhou (${err instanceof Error ? err.message : String(err)})`;
          resultado.erros.push(msg);
          const ag = AGENTE_DO_TIPO[vencedor.tipo];
          if (acum[ag].erros.length < 5) acum[ag].erros.push(msg);
        }
      }
      resultado.decisoes.push(decisao);
    } catch (err) {
      resultado.erros.push(`${cliente.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!opcoes.dryRun) {
    const terminadoEm = new Date();
    const cobertura = usaCheckpoint ? atualizarCobertura(coberturaAnterior, diaHoje, processados, todosIds) : undefined;
    // Uma linha de execução POR AGENTE: propostos ≠ selecionados ≠ enviados (um
    // agente nunca "age" só porque propôs).
    for (const agente of AGENTES_PROPONENTES) {
      const a = acum[agente];
      const suprimidosPorPrioridade = Math.max(a.propostos - a.selecionados, 0);
      await registrarExecucaoAgente({
        agente,
        iniciadoEm,
        terminadoEm,
        clientesAvaliados: resultado.clientesAvaliados,
        acoes: a.enviados,
        puladas: a.propostos - a.enviados,
        erros: agente === "sentinela" ? [...resultado.erros, ...a.erros] : a.erros,
        detalhes: {
          versao: VERSAO,
          brutos: a.brutos,
          propostos: a.propostos,
          selecionados: a.selecionados,
          enviados: a.enviados,
          suprimidosPolitica: a.bloqueadosPolitica,
          suprimidosPrioridade: suprimidosPorPrioridade,
          ...(a.pausado ? { pausado: a.pausado } : {}),
          ...(agente === "sentinela" ? { motivosSupressao: motivosAgregados(resultado.decisoes), ...(cobertura ? { cobertura } : {}) } : {}),
        },
      });
    }
    if (dicasDoCoachEnviadas > 0) {
      await registrarExecucaoAgente({
        agente: "coach",
        iniciadoEm,
        terminadoEm,
        clientesAvaliados: resultado.clientesAvaliados,
        acoes: dicasDoCoachEnviadas,
        erros: [],
        detalhes: { versao: VERSAO, origem: "fechamento do mês" },
      });
    }
  }
  return resultado;
}
