// ─────────────────────────────────────────
// Status dos agentes (tela admin "Agentes") — regra pura
// ─────────────────────────────────────────
// Ideia do ChatGPT (04/10/2026): nada de "agente de PowerPoint" — o status
// sai das execuções REAIS registradas, nunca de um rótulo fixo.

export type StatusAgente = "OPERANDO" | "PARCIAL" | "ATRASADO" | "ERRO" | "SEM_EXECUCAO" | "AGUARDANDO_USO";

export interface ExecucaoResumo {
  terminadoEm: Date;
  sucesso: boolean;
}

export interface DefinicaoAgente {
  chave: string;
  nome: string;
  descricao: string;
  /** "periodico": roda sozinho a cada N horas; "sob_demanda": roda quando o cliente usa. */
  modo: "periodico" | "sob_demanda";
  /** Só pra "periodico": de quantas em quantas horas deveria rodar (com folga). */
  intervaloEsperadoHoras?: number;
  /** Texto da agenda do cron (Brasília), pra tela mostrar a próxima execução. */
  agenda?: string;
  versao: string;
}

export const AGENTES: DefinicaoAgente[] = [
  {
    chave: "sentinela",
    nome: "Sentinela",
    descricao: "Observa orçamento, projeção do mês, fechamento de fatura, anomalias e o fechamento do mês; escolhe no máximo 1 alerta por dia por cliente, sob política de envio.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30 (Brasília)",
    versao: "1.0",
  },
  {
    chave: "recorrencias",
    nome: "Recorrências",
    descricao: "Cria os lançamentos que se repetem todo mês (salário, aluguel, assinaturas) quando o dia chega.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 07:00 (Brasília)",
    versao: "1.0",
  },
  {
    chave: "quita",
    nome: "Quita",
    descricao: "Responde perguntas abertas escolhendo, entre skills de leitura, as que precisa — os números vêm sempre do backend.",
    modo: "sob_demanda",
    versao: "1.0",
  },
];

export function calcularStatusAgente(
  def: DefinicaoAgente,
  ultima: ExecucaoResumo | null,
  agora: Date = new Date(),
  coberturaParcial = false
): StatusAgente {
  if (!ultima) return def.modo === "sob_demanda" ? "AGUARDANDO_USO" : "SEM_EXECUCAO";
  if (!ultima.sucesso) return "ERRO";
  // Nunca "operando" com parte da base do dia sem avaliar.
  if (coberturaParcial) return "PARCIAL";
  if (def.modo === "periodico") {
    const horas = (agora.getTime() - ultima.terminadoEm.getTime()) / 3_600_000;
    return horas > (def.intervaloEsperadoHoras ?? 36) ? "ATRASADO" : "OPERANDO";
  }
  return "OPERANDO";
}

export const ROTULO_STATUS: Record<StatusAgente, string> = {
  OPERANDO: "Operando",
  PARCIAL: "Cobertura parcial hoje",
  ATRASADO: "Atrasado",
  ERRO: "Erro na última execução",
  SEM_EXECUCAO: "Nunca executou",
  AGUARDANDO_USO: "Aguardando uso",
};

// ── Métricas de utilidade por tipo de alerta (tela admin) ────────────────

export interface MetricaTipo {
  tipo: string;
  enviados: number;
  uteis: number;
  errados: number;
  silenciados: number;
  /** úteis / (úteis + errados); null quando ainda não há feedback. Sempre ler junto de `respostas`. */
  utilidade: number | null;
  respostas: number;
}

/**
 * `tiposEnviados`: um item por alerta enviado; `feedbacks`: caminho dos eventos
 * ("TIPO|entidade|faixa|período#UTIL|ERRADO"); `silenciados`: caminho dos
 * eventos de silenciar ("TIPO" ou "TODOS").
 */
export function agregarMetricasPorTipo(tiposEnviados: string[], feedbacks: string[], silenciados: string[]): MetricaTipo[] {
  const mapa = new Map<string, MetricaTipo>();
  const obter = (tipo: string): MetricaTipo => {
    let m = mapa.get(tipo);
    if (!m) {
      m = { tipo, enviados: 0, uteis: 0, errados: 0, silenciados: 0, utilidade: null, respostas: 0 };
      mapa.set(tipo, m);
    }
    return m;
  };
  for (const t of tiposEnviados) obter(t).enviados++;
  for (const caminho of feedbacks) {
    const [chave, veredito] = caminho.split("#");
    const tipo = chave.split("|")[0];
    if (veredito === "UTIL") obter(tipo).uteis++;
    else if (veredito === "ERRADO") obter(tipo).errados++;
  }
  for (const tipo of silenciados) obter(tipo).silenciados++;
  for (const m of mapa.values()) {
    m.respostas = m.uteis + m.errados;
    m.utilidade = m.respostas > 0 ? m.uteis / m.respostas : null;
  }
  return [...mapa.values()].sort((a, b) => b.enviados - a.enviados || a.tipo.localeCompare(b.tipo));
}

export const ROTULO_TIPO_ALERTA: Record<string, string> = {
  CATEGORY_BUDGET: "Orçamento por categoria",
  CARD_CLOSING: "Fechamento de fatura",
  NEGATIVE_PROJECTION: "Mês no vermelho",
  MONTH_CLOSING: "Fechamento do mês",
  SPENDING_ANOMALY: "Gasto fora do padrão",
  TODOS: "Todos (desligou geral)",
};
