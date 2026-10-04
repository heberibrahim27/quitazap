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
    descricao: "Observa orçamento por categoria, mês no vermelho e gastos fora do padrão. Propõe alertas ao árbitro, que escolhe no máximo 1 por dia por cliente entre todos os agentes.",
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
    chave: "cartoes",
    nome: "Cartões",
    descricao: "Acompanha fechamento da fatura, limite comprometido e o peso das parcelas já agendadas na próxima fatura.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30 (Brasília)",
    versao: "1.1",
  },
  {
    chave: "compromissos",
    nome: "Compromissos",
    descricao: "Lembra vencimentos de dívidas e tarefas (D-3/D-1/D0) e manda o resumo semanal da segunda-feira.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:00–08:30 (Brasília); resumo semanal na segunda",
    versao: "1.1",
  },
  {
    chave: "metas",
    nome: "Metas",
    descricao: "Comemora marcos de 25/50/75/100% e avisa quando uma meta fica parada por 30 dias.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30 (Brasília)",
    versao: "1.1",
  },
  {
    chave: "dividas",
    nome: "Dívidas",
    descricao: "Avisa parcelas em atraso (fora as descontadas em folha), no máximo uma vez por semana por conjunto.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30 (Brasília)",
    versao: "1.1",
  },
  {
    chave: "lancamentos",
    nome: "Lançamentos",
    descricao: "Percebe quem tinha o hábito de registrar e parou, e quando \"Outros\" pesa demais nos gastos.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30 (Brasília)",
    versao: "1.1",
  },
  {
    chave: "fechamento",
    nome: "Fechamento do mês",
    descricao: "Nos primeiros dias do mês manda o resumo do mês anterior (entrou, saiu, resultado, maior categoria).",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "dias 1 a 3, às 08:30 (Brasília)",
    versao: "1.1",
  },
  {
    chave: "orientador",
    nome: "Orientador de Quitação",
    descricao: "Ajuda a quitar dívidas e ter respiro: plano do mês (AGORA / DEPOIS / PRÓXIMO ALVO) nos dias 1 a 3 e comemoração de dívida quitada e marcos de 25/50/75/100% pagos. No modo crítico não manda aviso automático.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30 (Brasília); plano do mês nos dias 1 a 3",
    versao: "1.0",
  },
  {
    chave: "documentos",
    nome: "Documentos",
    descricao: "Interpreta comprovantes (foto) e contracheques enviados pelo cliente; cada execução registra sucesso ou erro.",
    modo: "sob_demanda",
    versao: "1.0",
  },
  {
    chave: "coach",
    nome: "Coach",
    descricao: "Dá uma dica de economia calculada pelo sistema — anexada ao fechamento do mês ou quando o cliente pede.",
    modo: "sob_demanda",
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
  QUIT_PLAN: "Plano de quitação",
  DEBT_MILESTONE: "Comemoração de dívida paga",
  TODOS: "Todos (desligou geral)",
};
