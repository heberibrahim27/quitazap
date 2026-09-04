// ─────────────────────────────────────────
// QuitaZAP Controle — Saúde Financeira (contrato)
// ─────────────────────────────────────────
// Score 0-100 determinístico, calculado só a partir do que o motor
// financeiro (src/lib/financeiro/motor.ts) já devolve — nenhuma IA decide
// o número, nenhuma soma nova é feita aqui além da matemática do próprio
// score. Nome deliberadamente diferente de "QuitaScore" (que já existe em
// duas outras áreas do produto, sem relação com o Controle — ver
// src/lib/plano.ts e src/lib/quita-score.ts): este é um conceito novo e
// específico do Controle, não reaproveita lógica nem nome de nenhum dos
// dois.

export type ClassificacaoSaude = "Excelente" | "Boa" | "Atenção" | "Crítica";

export interface RazaoSaude {
  tipo: "positiva" | "atencao" | "negativa";
  texto: string;
}

/** Cada componente listado com seus pontos — é isto que torna o score
 * auditável: dado o mesmo ResumoFinanceiro, os mesmos componentes sempre
 * saem, na mesma ordem, com a mesma pontuação. */
export interface ComponenteSaude {
  nome: string;
  pontos: number;
  pontosMaximos: number;
}

export interface SaudeFinanceira {
  score: number; // 0-100, soma dos componentes
  classificacao: ClassificacaoSaude;
  componentes: ComponenteSaude[];
  /** 2-3 razões concretas, as mais relevantes (negativas/atenção primeiro
   * quando existirem) — nunca texto genérico tipo "evite gastos". */
  razoes: RazaoSaude[];
}

export interface EntradaSaudeFinanceira {
  /** Resumo do mês corrente (calcularResumoFinanceiro, sem precisar de
   * comHistorico — o ritmo usa mediaDespesasVariaveis abaixo). */
  totais: {
    despesasVariaveis: number;
    receitas: number;
    resultadoSemPlano: number;
  };
  comprometimento: {
    calculavel: boolean;
    percentualComprometido: number | null;
    saldoProjetado: number;
    rendaEfetiva: number | null;
  };
  /** Média de despesas variáveis dos últimos N meses — vem de
   * calcularMediaMensal(clienteId, período, 3). 0 quando não há histórico
   * suficiente ainda (cliente novo). */
  mediaDespesasVariaveis: number;
  /** Existe pelo menos uma Divida ATIVA com emAtraso=true — dado que a
   * própria Home já busca pra sua lista de dívidas, não é query nova. */
  temDividaEmAtraso: boolean;
}
