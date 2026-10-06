// ─────────────────────────────────────────
// QuitaZAP Controle — Saúde Financeira (contrato) — fórmula v2
// ─────────────────────────────────────────
// Nota 0-100 determinística (nenhuma IA decide o número). Revisada em 06/10/2026 com o ChatGPT depois
// que uma conta com ~R$ 159 mil em consignados e ZERO gasto registrado recebeu 90 "Excelente":
//
//   REGRA DE OURO: falta de informação nunca vira ponto positivo. "R$ 0 registrado" não é "R$ 0 gasto".
//   Sem renda ou sem como saber o custo mensal, a tela mostra "Montando sua nota" (e o que falta),
//   nunca um número enganoso. O saldo devedor do consignado entra 100% no "Peso da dívida" — só a
//   PARCELA em folha fica de fora do fluxo do mês (já está descontada do salário líquido).
//
// Nome deliberadamente diferente de "QuitaScore" (conceito de outras áreas do produto).

/** Faixas em linguagem de bússola, não de boletim ("Crítica" desanimava quem mais precisa do app). */
export type ClassificacaoSaude = "Bem encaminhada" | "Em organização" | "Atenção" | "Prioridade agora";

export interface RazaoSaude {
  tipo: "positiva" | "atencao" | "negativa";
  texto: string;
}

/** Cada componente com seus pontos — é isto que torna a nota auditável. */
export interface ComponenteSaude {
  nome: string;
  pontos: number;
  pontosMaximos: number;
}

/** Grava junto de cada registro salvo (SaudeFinanceiraLog): uma revisão futura dos pesos não reinterpreta o passado. */
export const VERSAO_FORMULA_SAUDE = "financial_health_v2";

export type ItemFaltante = "renda" | "gastos";

export interface SaudeFinanceira {
  /** 0-100; 0 e sem significado enquanto `dadosInsuficientes` (a tela não mostra o número). */
  score: number;
  classificacao: ClassificacaoSaude;
  componentes: ComponenteSaude[];
  /** 2-3 razões concretas (negativas/atenção primeiro). */
  razoes: RazaoSaude[];
  versaoFormula: string;
  /** true = "Montando sua nota": falta renda ou como saber o custo mensal. Nunca mostrar nota nesse estado. */
  dadosInsuficientes: boolean;
  /** O que falta informar (vazio quando a nota está completa). */
  faltando: ItemFaltante[];
  /** Próximo passo curto, sempre ao lado da nota (a nota é bússola, não boletim). */
  proximoPasso: string;
  /** Informativo mesmo no estado "montando": dívida total e quanto ela pesa na renda anual. */
  pesoDivida: { totalDevido: number; percentualDaRendaAnual: number | null } | null;
}

export interface EntradaSaudeFinanceira {
  /** Renda do mês (receitas já recebidas ou a declarada no Perfil); null = desconhecida. */
  rendaMensal: number | null;
  /**
   * Custo mensal de referência: o MAIOR entre o que foi registrado no mês, a média dos meses anteriores e
   * as despesas fixas declaradas no Perfil, mais as parcelas fora da folha. null = nada registrado nem
   * declarado ("zero lançamentos ≠ zero gastos").
   */
  custoMensalReferencia: number | null;
  /** Saldo devedor de TODAS as dívidas ativas, consignado incluído. */
  totalDevido: number;
  /** Maior atraso em dias entre as dívidas ativas; null = nenhuma em atraso. */
  maiorAtrasoDias: number | null;
  /** % já pago do total contratado das dívidas ativas (0-100). */
  percentualPago: number;
  /** Dias de custo de vida cobertos pelo que está guardado na meta Respiro; null = não existe meta Respiro. */
  respiroDias: number | null;
}
