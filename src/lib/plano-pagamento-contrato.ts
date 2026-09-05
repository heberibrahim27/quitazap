// ─────────────────────────────────────────
// QuitaZAP Controle — Plano de Pagamento (contrato funcional do MVP)
// ─────────────────────────────────────────
// Isto NÃO é a implementação do Plano — é só o contrato de entradas/saídas,
// combinado antes do Dashboard nascer, pra ele já poder mostrar um resumo
// ("disponível", "comprometido", "déficit previsto") e o CTA "Ver meu
// plano →" sem que o motor de verdade precise existir ainda.
//
// O motor real (calcularPlanoPagamento, ainda não escrito) vai:
// 1. ler a renda disponível do período;
// 2. ler despesas, dívidas e vencimentos do mesmo período;
// 3. considerar juros, atraso, risco de corte e prioridade de cada item;
// 4. calcular déficit ou sobra;
// 5. gerar a ordem recomendada de pagamento;
// 6. explicar por que cada item ficou naquela posição;
// 7. mostrar o que fica pendente quando não dá pra cobrir tudo;
// 8. sugerir alternativas quando faltar dinheiro;
// 9. permitir que o cliente aceite ou ajuste o plano proposto.
//
// Dívida técnica conhecida (documentada de propósito, não resolvida agora):
// - `Divida` não tem campo de taxa de juros — o motor real vai precisar
//   desse dado (ou de uma estimativa) pra calcular custo de atraso/risco.
// - "Risco de corte" (luz, água, internet, cartão bloqueado) depende do
//   `tipo` da dívida/despesa carregar essa informação — hoje não carrega;
//   o motor real provavelmente precisa de uma tabela de categorias com
//   peso de risco, não só o texto livre que existe hoje.

/** Uma entrada bruta que o Plano considera: uma parcela de dívida, uma
 * despesa fixa recorrente, ou qualquer compromisso com valor e vencimento. */
export interface CompromissoFinanceiro {
  id: string;
  origem: "PARCELA_DIVIDA" | "DESPESA_FIXA" | "COMPRA_CARTAO" | "OUTRO";
  /** id da Divida/Lancamento de origem, pra o motor real conseguir voltar à fonte. */
  referenciaId: string;
  descricao: string;
  credor: string | null;
  valor: number;
  vencimento: Date;
  /** Dias de atraso, se já vencido e não pago. 0 quando em dia. */
  diasAtraso: number;
  /** Taxa de juros do período, quando conhecida (ver dívida técnica acima — hoje quase sempre null). */
  taxaJurosMensal: number | null;
  /** Risco de consequência grave se não for pago (corte de serviço, negativação, bloqueio de cartão). */
  riscoCorte: boolean;
  /** Prioridade manual que o cliente já deu à dívida de origem (Divida.prioridade), quando existe. */
  prioridadeManual: number | null;
}

/** Entrada do cálculo do Plano para um período (normalmente o mês corrente). */
export interface EntradaPlanoPagamento {
  clienteId: string;
  periodoInicio: Date;
  periodoFim: Date;
  /** Renda disponível no período — Cliente.rendaMensal quando cadastrada,
   * ou a soma de Lancamento tipo RECEITA do período como alternativa. */
  rendaDisponivel: number;
  compromissos: CompromissoFinanceiro[];
}

/** Motivo determinístico de uma posição no plano — nunca "a IA achou que
 * devia ser assim": todo item carrega um código auditável, e a
 * `justificativa` em texto é só a tradução desse código (por template no
 * v1; LLM formatando o mesmo código pode entrar depois sem mudar a
 * ordenação). */
export type ReasonCode =
  | "RISK_SERVICE_CUTOFF" // moradia/serviço essencial com risco de corte, já vencido ou vencendo muito perto
  | "OVERDUE" // já em atraso, sem risco crítico específico identificado
  | "DUE_SOON" // vence nos próximos dias, ainda não atrasou
  | "MINIMUM_REQUIRED" // compromisso do mês, sem urgência acima das anteriores
  | "HIGH_COST_DEBT" // maior custo/juros embutido entre as que podem receber amortização extra
  | "LOWER_PRIORITY"; // resto — pode esperar

/** Um item já ordenado dentro do plano recomendado, com a explicação de
 * por que ficou nessa posição — texto pronto pra mostrar ao cliente, não
 * só um código de motivo. */
export interface ItemPlanoRecomendado {
  compromissoId: string;
  posicao: number;
  valorRecomendado: number;
  reasonCode: ReasonCode;
  /** "Prioridade alta porque atrasa há 12 dias e tem risco de corte de energia." */
  justificativa: string;
  /** false quando o item não coube no plano por falta de saldo. */
  cabeNoOrcamento: boolean;
}

/** Uma alternativa que o Plano sugere quando há déficit (não cobre tudo). */
export interface AlternativaDeficit {
  titulo: string;
  descricao: string;
  /** Quanto essa alternativa ajudaria a reduzir o déficit, quando estimável. */
  impactoEstimado: number | null;
}

/** Saída do cálculo do Plano — o que a tela de verdade (ainda não construída) vai renderizar. */
export interface PlanoPagamentoCalculado {
  clienteId: string;
  periodoInicio: Date;
  periodoFim: Date;
  rendaDisponivel: number;
  totalComprometido: number;
  /** Positivo = sobra; negativo = déficit. */
  saldoProjetado: number;
  itens: ItemPlanoRecomendado[];
  /** Itens que não couberam no plano dado o saldo disponível. */
  pendentes: ItemPlanoRecomendado[];
  alternativas: AlternativaDeficit[];
  /** Preenchido quando o cliente já aceitou ou ajustou manualmente este plano. */
  status: "SUGERIDO" | "ACEITO" | "AJUSTADO";
}

/** Resumo enxuto pro Dashboard — é só isso que a tela inicial precisa hoje,
 * calculado com aritmética simples (sem prioridade/juros/risco ainda) até o
 * motor completo (calcularPlanoPagamento) existir. Ver
 * `resumoPlanoSimplificado` em `plano-pagamento-service.ts`. */
export interface ResumoPlanoParaDashboard {
  rendaDisponivel: number;
  totalComprometido: number;
  saldoProjetado: number;
  /** true quando já existe informação suficiente (renda cadastrada) pra calcular. */
  calculavel: boolean;
}
