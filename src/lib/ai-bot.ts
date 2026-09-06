// ─────────────────────────────────────────
// QuitaZAP — Rescue parser (último recurso do fluxo financeiro)
// ─────────────────────────────────────────
// Histórico: até 2026-09, este módulo era o motor conversacional completo
// do onboarding (ETAPA 1-10 + gerar_diagnostico via IA), de um produto que
// vendia "diagnóstico financeiro + plano de quitação". O produto pivotou
// pra controle financeiro contínuo (renda/gasto/dívida/meta registrados
// aos poucos, sem diagnóstico automático) — quem faz onboarding e registro
// hoje é o fluxo determinístico (onboarding-controle.ts,
// controle-financeiro-flow.ts) e a interpretação de linguagem natural pra
// financeiro é financeiro-intent-resolver.ts (local + classificador remoto
// próprio), não este arquivo.
//
// O que sobra pra este módulo: é chamado só quando TUDO ISSO ACIMA já
// tentou e não reconheceu a mensagem (ver api/webhook/zapi/route.ts). Em
// vez de ele mesmo tentar "adivinhar" e fechar um diagnóstico alternativo
// (o que causava respostas fora do produto atual), ele é 100%
// determinístico — nenhuma chamada de IA — e só faz 3 coisas: pede pra
// reformular, pede de novo de um jeito mais simples e, na 3ª tentativa sem
// sucesso, desiste e registra a mensagem pra revisão humana (sem alertar
// ninguém na hora — só fica numa fila no admin).
//
// Os tipos abaixo (DividaIA, DiagnosticoIA etc.) continuam exportados
// porque ainda são usados pelo comando QUITASCORE (monta um
// DiagnosticoIA parcial a partir de Divida reais pra reaproveitar o
// cálculo de score) e por diagnostico-normalizer.ts/plano.ts, que seguem
// cobertos por teste de regressão mesmo sem gerar diagnóstico novo.

import { registrarMensagemPendenteRevisao } from "./mensagem-pendente-revisao-service";

export type Mensagem = {
  role: "user" | "assistant" | "system";
  content: string;
};

// ── Tipos expandidos ─────────────────────

export type DividaIA = {
  credor: string;
  tipo: "CARTAO" | "EMPRESTIMO" | "FINANCIAMENTO" | "CHEQUE_ESPECIAL" | "CREDIARIO" | "LOJA" | "IMPOSTO" | "ALUGUEL" | "ASSOCIACAO" | "OUTRO";
  valorOriginal: number;
  saldoAtual: number;
  juros?: number;
  multa?: number;
  valorParcela: number;
  parcelaAtual?: number;
  totalParcelas?: number;
  parcelasRestantes: number;
  diaVencimento?: number;
  emAtraso: boolean;
  diasAtraso?: number;
  possuiProposta?: boolean;
  valorParaQuitar?: number;
  descontoAVista?: boolean;
};

export type CartaoIA = {
  banco: string;
  limite: number;
  limiteDisponivel?: number;
  faturaAtual: number;
  valorMinimo?: number;
  melhorDiaCompra?: number;
  parcelasFuturas?: number;
};

export type EmprestimoIA = {
  banco: string;
  valorContratado: number;
  saldoRestante: number;
  taxaJuros?: number;
  parcelasFaltam: number;
  valorParcela: number;
};

export type DadosPessoaisIA = {
  nome: string;
  idade?: number;
  cidade?: string;
  estadoCivil?: string;
  dependentes?: number;
  filhos?: number;
  profissao?: string;
  vinculo?: string;
};

export type RendaIA = {
  salarioLiquido: number;
  salarioLiquidoComExtras?: number; // líquido total do mês (com 13º/férias) — preencher quando houver extras
  adiantamento13?: number;          // valor do 13º/férias/abono incluído no mês
  outrasRendas?: number;
  comissoes?: number;
  rendaConjuge?: number;
  rendaExtra?: number;
  beneficios?: number;
  totalFamiliar: number;
};

export type DespesaIA = {
  descricao: string;
  valor: number;
};

export type PatrimonioIA = {
  possuiCasa?: boolean;
  possuiCarro?: boolean;
  possuiMoto?: boolean;
  possuiInvestimentos?: boolean;
  reservaEmergencia?: number;
  valorBens?: number;
};

export type ObjetivosIA = {
  objetivoPrincipal?: string;
  prazoQuitacao?: number;
  valorDisponivel?: number;
  aceitaReduzirGastos?: boolean;
  aceitaRenegociar?: boolean;
  pretendeMaiRenda?: boolean;
};

export type AlertasIA = {
  acaoJudicial?: boolean;
  negativado?: boolean;
  bloqueioBancario?: boolean;
  financiamentoAtraso?: boolean;
  riscoPerdaPatrimonio?: boolean;
};

export type DiagnosticoIA = {
  dadosPessoais: DadosPessoaisIA;
  renda: RendaIA;
  despesasFixas: DespesaIA[];
  despesasVariaveis: DespesaIA[];
  dividas: DividaIA[];
  cartoes: CartaoIA[];
  emprestimos: EmprestimoIA[];
  patrimonio: PatrimonioIA;
  objetivos: ObjetivosIA;
  alertas: AlertasIA;
};

// ── Rescue ladder (3 tentativas, depois fila de revisão humana) ──────────
// Textos exatos — a detecção de "qual tentativa é essa" funciona
// comparando a ÚLTIMA mensagem do assistente no histórico contra estes
// textos (mesmo padrão já usado em route.ts pra detectar
// "aguardando renda", por exemplo). Não precisa de campo novo no banco
// pra contar tentativa: o histórico da conversa já é a fonte de verdade.
export const MENSAGEM_RESCUE_TENTATIVA_1 =
  "Não consegui entender exatamente o que você quer registrar. Você está falando de um gasto, uma renda, uma dívida ou outra coisa?";
export const MENSAGEM_RESCUE_TENTATIVA_2 =
  'Ainda não consegui interpretar com segurança. Pode me mandar de forma simples, por exemplo: "gastei R$80 no mercado" ou "recebi R$3.000 de salário".';
export const MENSAGEM_RESCUE_TENTATIVA_3 =
  "Não quero registrar algo errado. Vou deixar essa mensagem pendente pra revisão.";

function ultimaRespostaDoAssistente(historico: Mensagem[]): string | null {
  const ultima = historico.at(-1);
  return ultima && ultima.role === "assistant" ? ultima.content.trim() : null;
}

// Chamado só depois que TODO o resto do webhook (gasto determinístico,
// financeiro-intent-resolver, tarefas, consultas...) já tentou e não
// reconheceu a mensagem. Não tenta mais adivinhar sozinho — apenas escala
// o pedido de esclarecimento e, na 3ª vez seguida sem sucesso, registra
// pra revisão humana em vez de arriscar um registro errado ou inventar um
// diagnóstico fora do produto atual.
export async function processarMensagemIA(
  historico: Mensagem[],
  novaMensagem: string,
  nomeCliente: string,
  clienteId?: string | null,
  _gratuito?: boolean,
  telefone?: string | null
): Promise<{ resposta: string; diagnostico?: DiagnosticoIA }> {
  const ultimaResposta = ultimaRespostaDoAssistente(historico);

  if (ultimaResposta === MENSAGEM_RESCUE_TENTATIVA_2) {
    await registrarMensagemPendenteRevisao({
      clienteId: clienteId ?? null,
      telefone: telefone ?? null,
      nome: nomeCliente,
      mensagem: novaMensagem,
      motivo: "Não reconhecida pelo fluxo determinístico nem pelo interpretador financeiro após 3 tentativas.",
    });
    return { resposta: MENSAGEM_RESCUE_TENTATIVA_3 };
  }

  if (ultimaResposta === MENSAGEM_RESCUE_TENTATIVA_1) {
    return { resposta: MENSAGEM_RESCUE_TENTATIVA_2 };
  }

  return { resposta: MENSAGEM_RESCUE_TENTATIVA_1 };
}
