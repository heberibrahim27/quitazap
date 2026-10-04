// ─────────────────────────────────────────
// Status dos agentes (tela admin "Agentes") — regra pura
// ─────────────────────────────────────────
// Ideia do ChatGPT (04/10/2026): nada de "agente de PowerPoint" — o status
// sai das execuções REAIS registradas, nunca de um rótulo fixo.

export type StatusAgente = "OPERANDO" | "ATRASADO" | "ERRO" | "SEM_EXECUCAO" | "AGUARDANDO_USO";

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

export function calcularStatusAgente(def: DefinicaoAgente, ultima: ExecucaoResumo | null, agora: Date = new Date()): StatusAgente {
  if (!ultima) return def.modo === "sob_demanda" ? "AGUARDANDO_USO" : "SEM_EXECUCAO";
  if (!ultima.sucesso) return "ERRO";
  if (def.modo === "periodico") {
    const horas = (agora.getTime() - ultima.terminadoEm.getTime()) / 3_600_000;
    return horas > (def.intervaloEsperadoHoras ?? 36) ? "ATRASADO" : "OPERANDO";
  }
  return "OPERANDO";
}

export const ROTULO_STATUS: Record<StatusAgente, string> = {
  OPERANDO: "Operando",
  ATRASADO: "Atrasado",
  ERRO: "Erro na última execução",
  SEM_EXECUCAO: "Nunca executou",
  AGUARDANDO_USO: "Aguardando uso",
};
