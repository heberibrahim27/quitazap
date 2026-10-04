// ─────────────────────────────────────────
// Repositório de alertas proativos e execuções de agentes
// ─────────────────────────────────────────
// Sem tabela nova (mudança de schema em produção depende de autorização do
// Ibrahim — ver o relatório de 04/10/2026), então este módulo é a ÚNICA
// porta de acesso e guarda tudo em tabelas que já existem:
//   • alerta enviado     → MensagemChat (direcao BOT, dadosEstruturados.tipo
//                          "alerta_proativo") — aparece no histórico do chat
//   • feedback / mute    → EventoAnalytics (tipos "alerta_feedback" e
//                          "alerta_silenciado"; /acessos só lê pageview/click)
//   • "errado"           → MensagemPendenteRevisao (fila de QA do admin)
//   • execução de agente → AuditoriaAssistente (ferramenta "agente:<nome>")
// Trocar por tabelas dedicadas depois = mexer só aqui.

import { prisma } from "@/lib/prisma";
import type { CandidatoAlerta, TipoAlerta } from "./alertas";
import { chaveDedupe } from "./alertas";
import type { HistoricoAlerta } from "./politica";
import type { FeedbackAlerta } from "./feedback";
import type { Cobertura } from "./lotes";

const TIPO_MENSAGEM = "alerta_proativo";
const EVENTO_FEEDBACK = "alerta_feedback";
const EVENTO_MUTE = "alerta_silenciado";
/** Memória de dedupe: períodos de alerta são no máximo mensais. */
const JANELA_HISTORICO_DIAS = 40;
/** Quanto tempo depois do alerta um "útil"/"errado" ainda se refere a ele. */
const JANELA_FEEDBACK_HORAS = 48;

export interface AlertaRegistrado {
  dedupeKey: string;
  tipo: TipoAlerta;
  agente: string;
  texto: string;
  enviadoEm: Date;
}

function lerDados(dados: unknown): { agente: string; alerta: { tipo: TipoAlerta; dedupeKey: string } } | null {
  if (!dados || typeof dados !== "object") return null;
  const d = dados as { tipo?: string; agente?: string; alerta?: { tipo?: string; dedupeKey?: string } };
  if (d.tipo !== TIPO_MENSAGEM || !d.alerta?.dedupeKey || !d.alerta.tipo) return null;
  return { agente: d.agente ?? "sentinela", alerta: { tipo: d.alerta.tipo as TipoAlerta, dedupeKey: d.alerta.dedupeKey } };
}

export async function carregarHistoricoAlertas(clienteId: string, agora: Date): Promise<HistoricoAlerta[]> {
  const desde = new Date(agora.getTime() - JANELA_HISTORICO_DIAS * 86_400_000);
  const linhas = await prisma.mensagemChat.findMany({
    where: { clienteId, direcao: "BOT", criadoEm: { gte: desde }, dadosEstruturados: { path: ["tipo"], equals: TIPO_MENSAGEM } },
    select: { dadosEstruturados: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
  });
  const historico: HistoricoAlerta[] = [];
  for (const l of linhas) {
    const d = lerDados(l.dadosEstruturados);
    if (d) historico.push({ dedupeKey: d.alerta.dedupeKey, tipo: d.alerta.tipo, enviadoEm: l.criadoEm });
  }
  return historico;
}

export async function carregarTiposDesligados(clienteId: string): Promise<string[]> {
  const eventos = await prisma.eventoAnalytics.findMany({
    where: { clienteId, tipo: EVENTO_MUTE },
    select: { caminho: true },
  });
  return [...new Set(eventos.map((e) => e.caminho))];
}

export async function registrarAlertaEnviado(
  clienteId: string,
  candidato: CandidatoAlerta,
  texto: string,
  opcoes: { agente: string; canal: "WHATSAPP" | "APP"; enviadoEm?: Date }
): Promise<void> {
  await prisma.mensagemChat.create({
    data: {
      clienteId,
      canal: opcoes.canal,
      direcao: "BOT",
      texto,
      ...(opcoes.enviadoEm ? { criadoEm: opcoes.enviadoEm } : {}),
      dadosEstruturados: {
        tipo: TIPO_MENSAGEM,
        agente: opcoes.agente,
        alerta: {
          tipo: candidato.tipo,
          entityId: candidato.entityId,
          qualifier: candidato.qualifier,
          periodKey: candidato.periodKey,
          prioridade: candidato.prioridade,
          dedupeKey: chaveDedupe(candidato),
        },
      },
    },
  });
}

export async function ultimoAlertaRecente(clienteId: string, agora: Date): Promise<AlertaRegistrado | null> {
  const desde = new Date(agora.getTime() - JANELA_FEEDBACK_HORAS * 3_600_000);
  const l = await prisma.mensagemChat.findFirst({
    where: { clienteId, direcao: "BOT", criadoEm: { gte: desde }, dadosEstruturados: { path: ["tipo"], equals: TIPO_MENSAGEM } },
    orderBy: { criadoEm: "desc" },
  });
  if (!l) return null;
  const d = lerDados(l.dadosEstruturados);
  if (!d) return null;
  return { dedupeKey: d.alerta.dedupeKey, tipo: d.alerta.tipo, agente: d.agente, texto: l.texto, enviadoEm: l.criadoEm };
}

/**
 * Aplica o feedback do cliente e devolve a resposta a enviar, ou null quando
 * a mensagem NÃO é sobre um alerta (ex.: "errado" sem alerta recente) — aí o
 * pipeline normal segue como se este passo não existisse.
 */
export async function aplicarFeedbackAlerta(
  clienteId: string,
  feedback: FeedbackAlerta,
  agora: Date = new Date()
): Promise<string | null> {
  if (feedback === "PARAR_TODOS") {
    await silenciar(clienteId, "TODOS");
    return "Pronto, parei os alertas automáticos. Seus lembretes e vencimentos continuam como sempre. Pra voltar a receber, é só dizer *ativar alertas*. 👌";
  }
  if (feedback === "RELIGAR") {
    await prisma.eventoAnalytics.deleteMany({ where: { clienteId, tipo: EVENTO_MUTE } });
    return "Alertas automáticos ligados de novo. Eu só aviso quando realmente vale a pena. 👌";
  }

  const alerta = await ultimoAlertaRecente(clienteId, agora);
  if (!alerta) return null;

  if (feedback === "UTIL") {
    await prisma.eventoAnalytics.create({ data: { clienteId, tipo: EVENTO_FEEDBACK, caminho: `${alerta.dedupeKey}#UTIL` } });
    return "Que bom que ajudou! 👍 Vou continuar te avisando desse tipo de coisa quando fizer diferença.";
  }
  if (feedback === "ERRADO") {
    await prisma.eventoAnalytics.create({ data: { clienteId, tipo: EVENTO_FEEDBACK, caminho: `${alerta.dedupeKey}#ERRADO` } });
    // Vira item da fila de QA do admin: o erro pode estar no cálculo, no
    // parsing ou na regra — o texto do alerta fica junto pra investigar.
    await prisma.mensagemPendenteRevisao
      .create({
        data: {
          clienteId,
          mensagem: alerta.texto.slice(0, 500),
          motivo: `ALERTA_ERRADO:${alerta.tipo}`,
          criticidade: "MONITORAMENTO",
          categoria: "alerta_proativo",
        },
      })
      .catch((err) => console.error("[SENTINELA] Não consegui abrir item de QA:", err));
    return "Obrigado por avisar — anotei pra revisarmos esse cálculo. Se puder, me diga o que estava errado. 🙏";
  }
  // PARAR_TIPO
  await silenciar(clienteId, alerta.tipo);
  return "Certo, não te aviso mais sobre esse tipo de alerta. Os outros continuam. Pra religar tudo, diga *ativar alertas*. 👌";
}

/** Liga/desliga um tipo de alerta (ou "TODOS") — mesma preferência dos comandos "parar esse alerta"/"ativar alertas". */
export async function definirAlertaLigado(clienteId: string, tipo: string, ligado: boolean): Promise<void> {
  if (ligado) {
    await prisma.eventoAnalytics.deleteMany({ where: { clienteId, tipo: EVENTO_MUTE, caminho: tipo } });
  } else {
    await silenciar(clienteId, tipo);
  }
}

async function silenciar(clienteId: string, tipo: string): Promise<void> {
  const ja = await prisma.eventoAnalytics.findFirst({ where: { clienteId, tipo: EVENTO_MUTE, caminho: tipo }, select: { id: true } });
  if (!ja) await prisma.eventoAnalytics.create({ data: { clienteId, tipo: EVENTO_MUTE, caminho: tipo } });
}

/** Cobertura (checkpoint) do dia gravada na última execução do agente, se houver. */
export async function carregarCoberturaDoDia(agente: string, dia: string): Promise<Cobertura | null> {
  const linha = await prisma.auditoriaAssistente.findFirst({
    where: { ferramenta: `agente:${agente}`, depois: { path: ["cobertura", "dia"], equals: dia } },
    orderBy: { criadoEm: "desc" },
    select: { depois: true },
  });
  const c = (linha?.depois as { cobertura?: Cobertura } | null)?.cobertura;
  return c && c.dia === dia ? c : null;
}

/** Saúde dos alertas nos últimos 7 dias, pro disjuntor global do Sentinela. */
export async function carregarSaudeAlertas(agora: Date): Promise<{ enviados: number; errados: number; silenciados: number }> {
  const desde = new Date(agora.getTime() - 7 * 86_400_000);
  const [enviados, errados, silenciados] = await Promise.all([
    prisma.mensagemChat.count({ where: { direcao: "BOT", criadoEm: { gte: desde }, dadosEstruturados: { path: ["tipo"], equals: TIPO_MENSAGEM } } }),
    prisma.eventoAnalytics.count({ where: { tipo: EVENTO_FEEDBACK, caminho: { endsWith: "#ERRADO" }, criadoEm: { gte: desde } } }),
    prisma.eventoAnalytics.count({ where: { tipo: EVENTO_MUTE, criadoEm: { gte: desde } } }),
  ]);
  return { enviados, errados, silenciados };
}

// ── Execuções de agentes (alimenta a tela admin "Agentes") ───────────────

export interface ExecucaoAgente {
  agente: string;
  iniciadoEm: Date;
  terminadoEm: Date;
  clientesAvaliados: number;
  acoes: number;
  puladas?: number;
  erros: string[];
  detalhes?: Record<string, unknown>;
}

export async function registrarExecucaoAgente(e: ExecucaoAgente): Promise<void> {
  const duracaoMs = e.terminadoEm.getTime() - e.iniciadoEm.getTime();
  await prisma.auditoriaAssistente
    .create({
      data: {
        ferramenta: `agente:${e.agente}`,
        argumentos: { iniciadoEm: e.iniciadoEm.toISOString(), terminadoEm: e.terminadoEm.toISOString(), duracaoMs },
        resumo: `avaliados=${e.clientesAvaliados} acoes=${e.acoes} puladas=${e.puladas ?? 0} erros=${e.erros.length}`,
        depois: { clientesAvaliados: e.clientesAvaliados, acoes: e.acoes, puladas: e.puladas ?? 0, erros: e.erros.slice(0, 20), ...(e.detalhes ?? {}) },
        sucesso: e.erros.length === 0,
        erro: e.erros.length > 0 ? e.erros.slice(0, 3).join(" | ").slice(0, 500) : null,
      },
    })
    .catch((err) => console.error("[AGENTE] Falha ao registrar execução:", err));
}
