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
// determinístico — nenhuma chamada de IA.
//
// Reescrito (Ibrahim, 2026-09-06): "pensa em 10 mil clientes tendo que
// olhar manualmente" — a versão anterior desistia na 3ª tentativa e
// deixava o cliente esperando alguém olhar no admin, sem prazo nenhum.
// Isso não escala. Agora o bot SEMPRE dá uma resposta definitiva e
// acionável na hora (nunca "vou deixar pendente pra alguém ver") — a
// decisão de qual resposta dar (e se a mensagem é crítica o bastante pra
// precisar de um humano depois) é toda pura, em rescue-classificador.ts;
// este módulo só orquestra o efeito colateral (registrar na fila quando a
// decisão pede isso).
//
// Os tipos abaixo (DividaIA, DiagnosticoIA etc.) continuam exportados
// porque ainda são usados pelo comando QUITASCORE (monta um
// DiagnosticoIA parcial a partir de Divida reais pra reaproveitar o
// cálculo de score) e por diagnostico-normalizer.ts/plano.ts, que seguem
// cobertos por teste de regressão mesmo sem gerar diagnóstico novo.

import { registrarMensagemPendenteRevisao } from "./mensagem-pendente-revisao-service";
import {
  decidirRespostaRescue,
  MENSAGEM_RESCUE_TENTATIVA_1,
  MENSAGEM_RESCUE_FINAL_NAO_CRITICA,
} from "./rescue-classificador";

export { MENSAGEM_RESCUE_TENTATIVA_1, MENSAGEM_RESCUE_FINAL_NAO_CRITICA };

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

// ── Rescue ladder ──────────────────────────
// A detecção de "qual ponto da escada é esse" funciona comparando a
// ÚLTIMA mensagem do assistente no histórico contra os textos conhecidos
// (mesmo padrão já usado em route.ts pra detectar "aguardando renda", por
// exemplo) — não precisa de campo novo no banco pra contar tentativa: o
// histórico da conversa já é a fonte de verdade. Toda a decisão de qual
// resposta dar mora em rescue-classificador.ts (puro, testável sem
// banco); aqui só orquestra o efeito colateral.
function ultimaRespostaDoAssistente(historico: Mensagem[]): string | null {
  const ultima = historico.at(-1);
  return ultima && ultima.role === "assistant" ? ultima.content.trim() : null;
}

// Chamado só depois que TODO o resto do webhook (gasto determinístico,
// financeiro-intent-resolver, tarefas, consultas...) já tentou e não
// reconheceu a mensagem. Nunca deixa o cliente esperando um humano: toda
// resposta é definitiva e acionável na hora. Só registra na fila de
// revisão (MensagemPendenteRevisao) quando a mensagem é CRÍTICA de
// verdade (cancelamento, reclamação grave, erro de cobrança, pedido
// explícito de humano — aí sim alguém da equipe precisa agir depois) ou,
// no fim da escada sem sucesso e sem nada crítico, como dado de
// monitoramento pra melhorar o parser (nunca como tarefa pendente).
export async function processarMensagemIA(
  historico: Mensagem[],
  novaMensagem: string,
  nomeCliente: string,
  clienteId?: string | null,
  _gratuito?: boolean,
  telefone?: string | null
): Promise<{ resposta: string; diagnostico?: DiagnosticoIA }> {
  const decisao = decidirRespostaRescue(ultimaRespostaDoAssistente(historico), novaMensagem);

  if (decisao.tipo === "critica") {
    await registrarMensagemPendenteRevisao({
      clienteId: clienteId ?? null,
      telefone: telefone ?? null,
      nome: nomeCliente,
      mensagem: novaMensagem,
      motivo: `Mensagem crítica detectada (${decisao.categoria}) — precisa de atenção humana.`,
      criticidade: "CRITICA",
      categoria: decisao.categoria,
    });
  } else if (decisao.tipo === "final_nao_critica") {
    await registrarMensagemPendenteRevisao({
      clienteId: clienteId ?? null,
      telefone: telefone ?? null,
      nome: nomeCliente,
      mensagem: novaMensagem,
      motivo: "Não reconhecida pelo fluxo determinístico nem pelo interpretador financeiro após a escada de esclarecimento.",
      criticidade: "MONITORAMENTO",
      categoria: null,
    });
  }

  return { resposta: decisao.resposta };
}
