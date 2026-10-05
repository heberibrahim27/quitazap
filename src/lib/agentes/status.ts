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
  /** Texto da agenda do cron, pra tela mostrar a próxima execução. */
  agenda?: string;
  versao: string;
}

export const AGENTES: DefinicaoAgente[] = [
  {
    chave: "sentinela",
    nome: "Sentinela",
    descricao: "Vigia o orçamento de cada categoria, o mês no vermelho e os gastos fora do comum, e avisa o cliente. Cada cliente recebe no máximo 1 aviso por dia, de qualquer agente.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30",
    versao: "1.0",
  },
  {
    chave: "recorrencias",
    nome: "Recorrências",
    descricao: "Lança sozinho o que se repete todo mês (salário, aluguel, assinaturas) quando o dia chega.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 07:00",
    versao: "1.0",
  },
  {
    chave: "cartoes",
    nome: "Cartões",
    descricao: "Avisa quando a fatura do cartão vai fechar, quando o limite está acabando e quando as parcelas já pesam na próxima fatura.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30",
    versao: "1.1",
  },
  {
    chave: "compromissos",
    nome: "Compromissos",
    descricao: "Lembra das dívidas e tarefas que vencem em breve (3 dias antes, 1 dia antes e no dia) e manda o resumo da semana toda segunda-feira.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia pela manhã; resumo semanal na segunda",
    versao: "1.1",
  },
  {
    chave: "metas",
    nome: "Metas",
    descricao: "Comemora quando o cliente chega a 25%, 50%, 75% e 100% de uma meta e avisa quando ela fica parada por 30 dias.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30",
    versao: "1.1",
  },
  {
    chave: "dividas",
    nome: "Dívidas",
    descricao: "Avisa sobre parcelas atrasadas (menos as descontadas em folha), no máximo uma vez por semana.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30",
    versao: "1.1",
  },
  {
    chave: "lancamentos",
    nome: "Lançamentos",
    descricao: "Percebe quando o cliente que tinha o hábito de anotar os gastos parou e quando a categoria \"Outros\" está pesando demais.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30",
    versao: "1.1",
  },
  {
    chave: "fechamento",
    nome: "Fechamento do mês",
    descricao: "Nos primeiros dias do mês manda o resumo do mês anterior: quanto entrou, quanto saiu, o resultado e a categoria que mais pesou.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "dias 1 a 3, às 08:30",
    versao: "1.1",
  },
  {
    chave: "orientador",
    nome: "Orientador de Quitação",
    descricao: "Ajuda o cliente a quitar as dívidas e ter respiro: manda o plano do mês nos dias 1 a 3 e comemora cada dívida quitada. Se a situação do cliente estiver crítica, não manda aviso automático.",
    modo: "periodico",
    intervaloEsperadoHoras: 36,
    agenda: "todo dia às 08:30; plano do mês nos dias 1 a 3",
    versao: "1.0",
  },
  {
    chave: "documentos",
    nome: "Documentos",
    descricao: "Lê as fotos de comprovantes e contracheques que o cliente envia e registra os valores.",
    modo: "sob_demanda",
    versao: "1.0",
  },
  {
    chave: "coach",
    nome: "Coach",
    descricao: "Dá uma dica de economia baseada nos gastos do cliente — junto do fechamento do mês ou quando ele pede.",
    modo: "sob_demanda",
    versao: "1.0",
  },
  {
    chave: "quita",
    nome: "Quita",
    descricao: "Responde as perguntas livres do cliente no chat. Só consulta os dados, nunca altera nada, e os números vêm sempre do sistema.",
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
  OPERANDO: "Funcionando",
  PARCIAL: "Rodando hoje (em andamento)",
  ATRASADO: "Atrasado",
  ERRO: "Teve um problema",
  SEM_EXECUCAO: "Ainda não rodou",
  AGUARDANDO_USO: "Aguardando o primeiro uso",
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
