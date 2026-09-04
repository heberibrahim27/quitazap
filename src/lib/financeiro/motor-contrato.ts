// ─────────────────────────────────────────
// QuitaZAP Controle — Motor Financeiro (contrato)
// ─────────────────────────────────────────
// Contrato do único lugar autorizado a calcular os números financeiros do
// Controle. Dashboard, WhatsApp, Skill Analista, Plano de Pagamento e
// futuro PDF devem ler estes campos daqui — nunca resomar Lancamento por
// conta própria (ver decisão de arquitetura de 2026-09-04).
//
// Núcleo estável: os campos abaixo já existem hoje espalhados dentro do
// Dashboard (page.tsx) — foram só extraídos, com os mesmos nomes/fórmulas,
// pra essa primeira extração não mudar nenhum valor exibido. Depois que
// isto tiver consumidor fora do Dashboard, campo do núcleo não é
// renomeado/removido — só cresce por campo novo opcional (historico,
// previsao, ou futuros blocos como `proximoRecebimento`).
//
// O motor devolve só números e fatos. Nunca texto, nunca recomendação —
// isso é trabalho da Skill Analista, que consome este contrato.

import type { ResumoPlanoParaDashboard } from "@/lib/plano-pagamento-contrato";

export interface PeriodoFinanceiro {
  inicio: Date;
  fim: Date; // exclusivo, mesma convenção usada no resto do Controle
}

export interface EntradaMotorFinanceiro {
  clienteId: string;
  periodo: PeriodoFinanceiro;
  /** Renda mensal declarada no Perfil — usada só como fallback quando
   * nenhuma Receita foi lançada no período (mesma regra de hoje). */
  rendaMensalDeclarada?: number | null;
}

export interface TotaisFinanceiros {
  receitas: number;
  despesasFixas: number;
  despesasVariaveis: number;
  cartoes: number;
  emprestimos: number;
  outrasDividas: number;
  /** Líquido de depósitos − saques em Metas no período. Pode ser negativo
   * (mês em que se sacou mais do que se guardou). */
  investimentos: number;
  /** fixas + variaveis + cartoes + investimentos (SEM parcela de dívida) —
   * é o `totalDespesasMes` que alimenta `resumoPlanoSimplificado`. */
  totalSaidasSemDividas: number;
  /** fixas + variaveis + cartoes + emprestimos + outrasDividas (SEM
   * investimentos) — "passo 1" da DRE do Resumo. */
  totalSaidasOperacionais: number;
  /** receitas − totalSaidasOperacionais. */
  resultadoAntesInvestimentos: number;
  /** receitas − totalSaidasSemDividas — usado só quando `comprometimento.calculavel`
   * é false (sem renda cadastrada nem lançada). */
  resultadoSemPlano: number;
}

export interface PorCartao {
  cartaoId: string;
  nomeCartao: string;
  total: number;
}

export interface PorCategoria {
  categoria: string;
  total: number;
}

/** Reaproveita o contrato que já existe (`plano-pagamento-contrato.ts`) em
 * vez de duplicar a forma — o motor só acrescenta o que falta ali. */
export interface ComprometimentoFinanceiro extends ResumoPlanoParaDashboard {
  /** Receita lançada no período, com fallback pra renda declarada no
   * Perfil enquanto nada foi lançado ainda (mesma regra de hoje). */
  rendaEfetiva: number | null;
  percentualComprometido: number | null;
}

export interface HistoricoFinanceiro {
  periodoAnterior: PeriodoFinanceiro;
  totaisPeriodoAnterior: TotaisFinanceiros;
}

export interface PrevisaoFinanceira {
  diasNoPeriodo: number;
  diasDecorridos: number;
  diasRestantes: number;
}

export interface ResumoFinanceiro {
  clienteId: string;
  periodo: PeriodoFinanceiro;
  /** Quantos Lancamento existem no período, independente de entrarem ou
   * não em algum total (ex: FATURA_FECHADA conta aqui mas não soma em
   * nenhum total acima) — usado pra decidir estado vazio da tela. */
  quantidadeLancamentos: number;
  totais: TotaisFinanceiros;
  porCartao: PorCartao[];
  /** Só despesas (FIXA/VARIAVEL/COMPRA_CARTAO) com categoria preenchida —
   * mesma allowlist de tipos do resto do motor, então RECEITA/Metas/
   * FATURA_FECHADA nunca entram aqui. Base de "onde estou gastando mais"
   * (Skill/WhatsApp) e de detecção de anomalia por categoria. */
  porCategoria: PorCategoria[];
  comprometimento: ComprometimentoFinanceiro;
  /** Só preenchido quando chamado com `{ comHistorico: true }`. */
  historico?: HistoricoFinanceiro;
  /** Só preenchido quando `hoje` cai dentro do período pedido. */
  previsao?: PrevisaoFinanceira;
}

export interface OpcoesMotorFinanceiro {
  comHistorico?: boolean;
}

/** Média mensal de um período de N meses ANTERIORES a um período de
 * referência (o mês de referência nunca entra na média) — usado pelo
 * "ritmo" da Saúde Financeira e pela detecção de anomalia por categoria.
 * Mesmas fórmulas/allowlist do resto do motor, só que com N chamadas
 * internas em vez de uma. */
export interface MediaMensal {
  quantidadeMeses: number;
  despesasFixas: number;
  despesasVariaveis: number;
  cartoes: number;
  porCategoria: PorCategoria[];
}
