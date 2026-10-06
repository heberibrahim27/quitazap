// ─────────────────────────────────────────
// QuitaZAP Controle — Saúde Financeira (implementação) — fórmula v2
// ─────────────────────────────────────────
// Função pura — sem Prisma, sem IA. Pesos (únicos lugares a mudar se a fórmula for revista):
//   30 pts — Fôlego do mês: (renda − custo mensal de referência) ÷ renda
//   30 pts — Peso da dívida: total devido ÷ renda anual (consignado incluído)
//   20 pts — Contas em dia: maior atraso entre as dívidas
//   10 pts — Respiro: dias de custo de vida cobertos pela meta Respiro (alvo: 7)
//   10 pts — Avanço na quitação: % já pago do que foi contratado
// Sem renda ou sem custo de referência a nota NÃO é calculada ("Montando sua nota").

import type { ClassificacaoSaude, ComponenteSaude, EntradaSaudeFinanceira, ItemFaltante, RazaoSaude, SaudeFinanceira } from "./saude-financeira-contrato";
import { VERSAO_FORMULA_SAUDE } from "./saude-financeira-contrato";

type Parte = { pontos: number; razao: RazaoSaude };

function pontuarFolego(renda: number, custo: number): Parte {
  const folga = (renda - custo) / renda;
  const p = Math.round(folga * 100);
  if (folga >= 0.2) return { pontos: 30, razao: { tipo: "positiva", texto: `Sobra prevista folgada neste mês (${p}% da renda)` } };
  if (folga >= 0.1) return { pontos: 22, razao: { tipo: "positiva", texto: `Sobra prevista positiva neste mês (${p}% da renda)` } };
  if (folga >= 0) return { pontos: 12, razao: { tipo: "atencao", texto: "Sobra prevista, mas apertada neste mês" } };
  return { pontos: 0, razao: { tipo: "negativa", texto: "As contas previstas passam da renda deste mês" } };
}

function pontuarPesoDivida(renda: number, totalDevido: number): Parte {
  if (totalDevido <= 0.005) return { pontos: 30, razao: { tipo: "positiva", texto: "Nenhuma dívida ativa cadastrada" } };
  const r = totalDevido / (renda * 12);
  const p = Math.round(r * 100);
  if (r <= 0.25) return { pontos: 30, razao: { tipo: "positiva", texto: `Dívida pequena perto da renda (${p}% da renda anual)` } };
  if (r <= 0.5) return { pontos: 24, razao: { tipo: "positiva", texto: `Dívida administrável (${p}% da renda anual)` } };
  if (r <= 1) return { pontos: 18, razao: { tipo: "atencao", texto: `Dívida equivale a ${p}% da sua renda anual` } };
  if (r <= 2) return { pontos: 10, razao: { tipo: "atencao", texto: `Dívida alta: ${p}% da sua renda anual` } };
  if (r <= 3) return { pontos: 4, razao: { tipo: "negativa", texto: `Dívida muito alta: ${p}% da sua renda anual` } };
  return { pontos: 0, razao: { tipo: "negativa", texto: `Dívida muito alta: ${p}% da sua renda anual` } };
}

function pontuarContasEmDia(maiorAtrasoDias: number | null): Parte {
  if (maiorAtrasoDias == null) return { pontos: 20, razao: { tipo: "positiva", texto: "Nenhuma dívida em atraso" } };
  if (maiorAtrasoDias <= 30) return { pontos: 12, razao: { tipo: "atencao", texto: "Há dívida em atraso (até 30 dias)" } };
  if (maiorAtrasoDias <= 60) return { pontos: 6, razao: { tipo: "negativa", texto: "Há dívida em atraso (31 a 60 dias)" } };
  return { pontos: 0, razao: { tipo: "negativa", texto: "Há dívida em atraso há mais de 60 dias" } };
}

function pontuarRespiro(respiroDias: number | null): Parte {
  if (respiroDias == null) return { pontos: 0, razao: { tipo: "atencao", texto: "Ainda sem a meta Respiro para imprevistos" } };
  if (respiroDias >= 7) return { pontos: 10, razao: { tipo: "positiva", texto: "Respiro completo: 7 dias do dia a dia guardados" } };
  if (respiroDias >= 5) return { pontos: 7, razao: { tipo: "positiva", texto: "Respiro quase completo" } };
  if (respiroDias >= 3) return { pontos: 4, razao: { tipo: "atencao", texto: "Respiro cobre poucos dias" } };
  if (respiroDias >= 1) return { pontos: 2, razao: { tipo: "atencao", texto: "Respiro cobre só um ou dois dias" } };
  return { pontos: 0, razao: { tipo: "atencao", texto: "Respiro ainda vazio" } };
}

function pontuarAvanco(totalDevido: number, percentualPago: number): Parte {
  if (totalDevido <= 0.005) return { pontos: 10, razao: { tipo: "positiva", texto: "Sem dívida para quitar" } };
  if (percentualPago >= 75) return { pontos: 10, razao: { tipo: "positiva", texto: `Você já pagou ${Math.round(percentualPago)}% do que contratou` } };
  if (percentualPago >= 50) return { pontos: 8, razao: { tipo: "positiva", texto: `Você já pagou ${Math.round(percentualPago)}% do que contratou` } };
  if (percentualPago >= 25) return { pontos: 5, razao: { tipo: "positiva", texto: `Você já pagou ${Math.round(percentualPago)}% do que contratou` } };
  if (percentualPago >= 1) return { pontos: 2, razao: { tipo: "atencao", texto: "A quitação está só começando" } };
  return { pontos: 0, razao: { tipo: "atencao", texto: "A dívida ainda não começou a cair" } };
}

function classificar(score: number): ClassificacaoSaude {
  if (score >= 80) return "Bem encaminhada";
  if (score >= 60) return "Em organização";
  if (score >= 40) return "Atenção";
  return "Prioridade agora";
}

const PRIORIDADE_TIPO: Record<RazaoSaude["tipo"], number> = { negativa: 0, atencao: 1, positiva: 2 };

export function calcularSaudeFinanceira(entrada: EntradaSaudeFinanceira): SaudeFinanceira {
  const renda = entrada.rendaMensal != null && entrada.rendaMensal > 0 ? entrada.rendaMensal : null;
  const custo = entrada.custoMensalReferencia != null && entrada.custoMensalReferencia > 0 ? entrada.custoMensalReferencia : null;

  const pesoDivida =
    entrada.totalDevido > 0.005
      ? { totalDevido: entrada.totalDevido, percentualDaRendaAnual: renda != null ? Math.round((entrada.totalDevido / (renda * 12)) * 100) : null }
      : null;

  const faltando: ItemFaltante[] = [];
  if (renda == null) faltando.push("renda");
  if (custo == null) faltando.push("gastos");

  if (renda == null || custo == null) {
    return {
      score: 0,
      classificacao: "Prioridade agora",
      componentes: [],
      razoes: [],
      versaoFormula: VERSAO_FORMULA_SAUDE,
      dadosInsuficientes: true,
      faltando,
      proximoPasso:
        faltando.length === 2
          ? "Cadastre sua renda e registre alguns gastos (mercado, contas, transporte) para eu calcular."
          : faltando[0] === "renda"
            ? "Cadastre sua renda no Perfil ou lance o salário do mês para eu calcular."
            : "Registre seus gastos do mês (mercado, contas, transporte) para eu calcular com segurança.",
      pesoDivida,
    };
  }

  const folego = pontuarFolego(renda, custo);
  const peso = pontuarPesoDivida(renda, entrada.totalDevido);
  const atraso = pontuarContasEmDia(entrada.maiorAtrasoDias);
  const respiro = pontuarRespiro(entrada.respiroDias);
  const avanco = pontuarAvanco(entrada.totalDevido, entrada.percentualPago);

  const componentes: ComponenteSaude[] = [
    { nome: "Fôlego do mês", pontos: folego.pontos, pontosMaximos: 30 },
    { nome: "Peso da dívida", pontos: peso.pontos, pontosMaximos: 30 },
    { nome: "Contas em dia", pontos: atraso.pontos, pontosMaximos: 20 },
    { nome: "Respiro", pontos: respiro.pontos, pontosMaximos: 10 },
    { nome: "Avanço na quitação", pontos: avanco.pontos, pontosMaximos: 10 },
  ];
  const score = Math.round(componentes.reduce((s, c) => s + c.pontos, 0));
  const razoes = [folego.razao, peso.razao, atraso.razao, respiro.razao, avanco.razao]
    .sort((a, b) => PRIORIDADE_TIPO[a.tipo] - PRIORIDADE_TIPO[b.tipo])
    .slice(0, 3);

  // Próximo passo: o que mais move a nota, em ordem de urgência.
  let proximoPasso = "Siga o seu plano de quitação: ele mostra o que pagar primeiro.";
  if (entrada.maiorAtrasoDias != null) proximoPasso = "Regularize a dívida em atraso primeiro: é o que mais pesa agora.";
  else if (folego.pontos === 0) proximoPasso = "Veja no plano onde abrir espaço no mês: as contas passaram da renda.";
  else if (entrada.respiroDias == null || entrada.respiroDias < 7) proximoPasso = "Monte o seu Respiro: um colchão de 7 dias evita voltar ao cartão num imprevisto.";

  return {
    score,
    classificacao: classificar(score),
    componentes,
    razoes,
    versaoFormula: VERSAO_FORMULA_SAUDE,
    dadosInsuficientes: false,
    faltando: [],
    proximoPasso,
    pesoDivida,
  };
}
