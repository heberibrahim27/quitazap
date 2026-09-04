// ─────────────────────────────────────────
// QuitaZAP — Motor DRE Admin (contrato)
// ─────────────────────────────────────────
// Contrato do único lugar autorizado a calcular receita/custo/resultado
// do NEGÓCIO (não confundir com src/lib/financeiro/motor.ts, que é o
// motor do CLIENTE final dentro do Controle — domínios e donos diferentes,
// deliberadamente não compartilham código nem tabela).
//
// Motivo de existir: auditoria encontrou /painel e /financeiro calculando
// "lucro" de dois jeitos DIVERGENTES (um ignorava comissão Cakto e custo
// manual, o outro não), cada um com sua própria query solta. As duas
// telas agora leem daqui.
//
// "Resultado operacional" (não "lucro líquido") de propósito: falta
// imposto e custo geral de infraestrutura (Vercel/Supabase) integrados —
// ver `custos` abaixo, que já reserva as linhas com status ESTIMATED até
// as credenciais chegarem (ver README/instruções da migração da Cakto).

export type FonteReceita = "OBSERVADA" | "ESTIMADA";

/** OBSERVED = veio de dado real (LogIA, CustoMensal, EventoCakto.valorPago).
 * ESTIMATED = fallback calculado (contagem × preço fixo) ou zero por falta
 * de credencial — nunca deve ser tratado como fatura real numa exportação. */
export type StatusLinhaCusto = "OBSERVED" | "ESTIMATED";

export interface LinhaCusto {
  categoria: string;
  valor: number;
  status: StatusLinhaCusto;
  observacao?: string;
}

export interface DreAdminResumo {
  mes: string; // YYYY-MM
  totalAssinantes: number;
  totalGratuitos: number;

  receitaBruta: number;
  /** OBSERVADA quando existe EventoCakto com valorPago real no período
   * (aprovações menos reembolso/chargeback); ESTIMADA quando cai no
   * fallback de contagem de assinantes × preço fixo. */
  receitaFonte: FonteReceita;
  comissaoCakto: number;
  receitaLiquida: number;

  custoIA: number;
  custoIAPagantes: number;
  custoIAGratuitos: number;
  custoManual: number;
  /** Linhas prontas pra UI/ledger — inclui Vercel/Supabase já reservadas
   * (valor 0, status ESTIMATED) até a credencial de billing chegar; nova
   * fonte de custo real vira só uma linha a mais aqui, não muda contrato. */
  custos: LinhaCusto[];

  resultadoOperacional: number;
  margem: number | null;
}
