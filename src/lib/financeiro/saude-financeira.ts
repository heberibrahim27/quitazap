// ─────────────────────────────────────────
// QuitaZAP Controle — Saúde Financeira (implementação)
// ─────────────────────────────────────────
// Função pura — sem Prisma, sem IA. Ver saude-financeira-contrato.ts pro
// porquê de cada peso. Pesos documentados aqui, únicos lugar que precisa
// mudar se a fórmula for revista:
//   35 pts — % da renda comprometida
//   25 pts — resultado do período (sobra vs. déficit) sobre a receita
//   20 pts — ritmo de despesas variáveis vs. média dos últimos 3 meses
//   20 pts — nenhuma dívida em atraso

import type { ClassificacaoSaude, ComponenteSaude, EntradaSaudeFinanceira, RazaoSaude, SaudeFinanceira } from "./saude-financeira-contrato";
import { VERSAO_FORMULA_SAUDE } from "./saude-financeira-contrato";

function pontuarComprometimento(entrada: EntradaSaudeFinanceira): { pontos: number; razao: RazaoSaude } {
  const { calculavel, percentualComprometido: pct } = entrada.comprometimento;
  if (!calculavel || pct == null) {
    return { pontos: 17.5, razao: { tipo: "atencao", texto: "⚠ Sem renda cadastrada para avaliar o comprometimento" } };
  }
  const p = Math.round(pct * 100);
  if (pct <= 0.5) return { pontos: 35, razao: { tipo: "positiva", texto: `✓ Renda pouco comprometida (${p}%)` } };
  if (pct <= 0.7) return { pontos: 25, razao: { tipo: "positiva", texto: `✓ Renda comprometida em nível saudável (${p}%)` } };
  if (pct <= 0.9) return { pontos: 15, razao: { tipo: "atencao", texto: `⚠ Renda comprometida acima de 70% (${p}%)` } };
  if (pct <= 1.0) return { pontos: 5, razao: { tipo: "atencao", texto: `⚠ Renda quase toda comprometida (${p}%)` } };
  return { pontos: 0, razao: { tipo: "negativa", texto: `✗ Compromissos já superam a renda (${p}%)` } };
}

function pontuarResultado(entrada: EntradaSaudeFinanceira): { pontos: number; razao: RazaoSaude } {
  const receita = entrada.comprometimento.rendaEfetiva ?? entrada.totais.receitas;
  const resultado = entrada.comprometimento.calculavel ? entrada.comprometimento.saldoProjetado : entrada.totais.resultadoSemPlano;
  if (receita <= 0) {
    return { pontos: 12.5, razao: { tipo: "atencao", texto: "⚠ Sem receita lançada para avaliar a sobra do mês" } };
  }
  const proporcao = resultado / receita;
  if (proporcao >= 0.3) return { pontos: 25, razao: { tipo: "positiva", texto: "✓ Sobra prevista robusta este mês" } };
  if (proporcao >= 0.1) return { pontos: 18, razao: { tipo: "positiva", texto: "✓ Sobra prevista positiva este mês" } };
  if (proporcao >= 0) return { pontos: 10, razao: { tipo: "atencao", texto: "⚠ Sobra prevista, mas apertada" } };
  return { pontos: 0, razao: { tipo: "negativa", texto: "✗ Déficit previsto este mês" } };
}

function pontuarRitmo(entrada: EntradaSaudeFinanceira): { pontos: number; razao: RazaoSaude } {
  const { despesasVariaveis } = entrada.totais;
  const { mediaDespesasVariaveis } = entrada;
  if (mediaDespesasVariaveis <= 0) {
    return { pontos: 10, razao: { tipo: "atencao", texto: "— Ainda sem histórico suficiente para avaliar o ritmo de gastos" } };
  }
  const razaoMultiplicador = despesasVariaveis / mediaDespesasVariaveis;
  const percentualAcima = Math.round((razaoMultiplicador - 1) * 100);
  if (razaoMultiplicador <= 1.1) return { pontos: 20, razao: { tipo: "positiva", texto: "✓ Despesas variáveis dentro do ritmo normal" } };
  if (razaoMultiplicador <= 1.3) return { pontos: 10, razao: { tipo: "atencao", texto: `⚠ Despesas variáveis ${percentualAcima}% acima da média dos últimos 3 meses` } };
  return { pontos: 0, razao: { tipo: "negativa", texto: `✗ Despesas variáveis ${percentualAcima}% acima da média dos últimos 3 meses` } };
}

function pontuarAtraso(entrada: EntradaSaudeFinanceira): { pontos: number; razao: RazaoSaude } {
  if (entrada.temDividaEmAtraso) {
    return { pontos: 0, razao: { tipo: "negativa", texto: "✗ Existe dívida em atraso" } };
  }
  return { pontos: 20, razao: { tipo: "positiva", texto: "✓ Nenhuma dívida em atraso" } };
}

function classificar(score: number): ClassificacaoSaude {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Boa";
  if (score >= 40) return "Atenção";
  return "Crítica";
}

// Prioridade de exibição das razões: negativa > atenção > positiva — o
// que precisa de atenção aparece primeiro; só mostra só positivas quando
// não há nada de negativo/atenção pra reportar.
const PRIORIDADE_TIPO: Record<RazaoSaude["tipo"], number> = { negativa: 0, atencao: 1, positiva: 2 };

export function calcularSaudeFinanceira(entrada: EntradaSaudeFinanceira): SaudeFinanceira {
  const comprometimento = pontuarComprometimento(entrada);
  const resultado = pontuarResultado(entrada);
  const ritmo = pontuarRitmo(entrada);
  const atraso = pontuarAtraso(entrada);

  const componentes: ComponenteSaude[] = [
    { nome: "Comprometimento da renda", pontos: comprometimento.pontos, pontosMaximos: 35 },
    { nome: "Resultado do período", pontos: resultado.pontos, pontosMaximos: 25 },
    { nome: "Ritmo de despesas variáveis", pontos: ritmo.pontos, pontosMaximos: 20 },
    { nome: "Dívidas em atraso", pontos: atraso.pontos, pontosMaximos: 20 },
  ];

  const score = Math.round(componentes.reduce((soma, c) => soma + c.pontos, 0));

  const razoes = [comprometimento.razao, resultado.razao, ritmo.razao, atraso.razao]
    .sort((a, b) => PRIORIDADE_TIPO[a.tipo] - PRIORIDADE_TIPO[b.tipo])
    .slice(0, 3);

  // "Dados insuficientes" = os três componentes que dependem de histórico
  // ficaram todos no valor neutro (nada de renda, nada de receita lançada,
  // nada de média de despesas) — a mesma condição que cada pontuarX() usa
  // pra decidir seu próprio "neutro", checada aqui de novo em cima da
  // entrada crua pra não depender de expor esse detalhe de cada função.
  // Dívida em atraso fica de fora de propósito: é sinal real, não ausência
  // de dado, e não pode ser mascarado por "conta vazia".
  const semRenda = !entrada.comprometimento.calculavel;
  const semReceita = (entrada.comprometimento.rendaEfetiva ?? entrada.totais.receitas) <= 0;
  const semHistoricoRitmo = entrada.mediaDespesasVariaveis <= 0;
  const dadosInsuficientes = semRenda && semReceita && semHistoricoRitmo && !entrada.temDividaEmAtraso;

  return { score, classificacao: classificar(score), componentes, razoes, versaoFormula: VERSAO_FORMULA_SAUDE, dadosInsuficientes };
}
