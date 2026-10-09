// ─────────────────────────────────────────
// Entradas previstas × saldo do mês ("aguardando salário") — parte pura
// ─────────────────────────────────────────
// Achado do Ibrahim (09/10/2026), validado com o ChatGPT: quem recebe o salário
// no fim do mês e paga a fatura do cartão logo depois via "-R$ 2.161,20",
// "640% da renda" e "suas contas estão no vermelho" — assustador, porque o
// salário recorrente que ele já cadastrou vai cobrir tudo. O número negativo
// está certo (é o mínimo que precisa entrar), faltava CONTEXTO.
//
// Regras:
//  • receita prevista NUNCA vira dinheiro existente: não entra no disponível
//    nem em "Entradas" (o motor continua igual). Aparece só como previsão;
//  • entram: (a) receita com data futura dentro do mês ("a receber") e
//    (b) fonte recorrente cuja ocorrência do mês ainda não nasceu e cai depois
//    de hoje (o cron só cria a ocorrência quando o dia chega — ver
//    recorrencia-service.ts);
//  • sem previsão, nada é inventado: o estado é SEM_PREVISAO.

import { decidirRecorrencia, normalizarDescricaoRecorrencia, podeRepetir } from "./recorrencia";

export interface ReceitaPrevista {
  descricao: string;
  valor: number;
  data: Date;
  origem: "AGENDADA" | "RECORRENTE";
}

export interface ReceitaFonte {
  descricao: string;
  valor: number;
  data: Date;
  tipo: string;
  categoria: string | null;
}

export interface EntradaProjecao {
  /** Receitas já lançadas com data a partir de amanhã, dentro do período. */
  agendadas: Array<{ descricao: string; valor: number; data: Date }>;
  /** Receitas recorrentes ainda sem a cópia do mês seguinte (fontes do cron). */
  fontesRecorrentes: ReceitaFonte[];
  /** Descrições (qualquer data) das receitas já lançadas no período. */
  descricoesNoPeriodo: string[];
  periodo: { inicio: Date; fim: Date };
  agora: Date;
}

export function projetarReceitasPrevistas(e: EntradaProjecao): ReceitaPrevista[] {
  const itens: ReceitaPrevista[] = e.agendadas.map((a) => ({ ...a, origem: "AGENDADA" as const }));
  const jaTem = new Set([...e.descricoesNoPeriodo, ...e.agendadas.map((a) => a.descricao)].map(normalizarDescricaoRecorrencia));

  for (const f of e.fontesRecorrentes) {
    if (!podeRepetir(f) || f.tipo !== "RECEITA") continue;
    // Mesmo valor já agendado no mês (ex.: "Salário out" agendado e fonte "Salário"):
    // é a mesma entrada com outro nome — não conta duas vezes.
    if (e.agendadas.some((a) => Math.abs(a.valor - f.valor) < 0.005)) continue;
    const { proxima, aguardar } = decidirRecorrencia(f.data, e.agora);
    if (!aguardar) continue; // o dia já chegou: o cron cria a cópia (ou o usuário lança)
    if (proxima.getTime() < e.periodo.inicio.getTime() || proxima.getTime() >= e.periodo.fim.getTime()) continue;
    const chave = normalizarDescricaoRecorrencia(f.descricao);
    if (jaTem.has(chave)) continue;
    jaTem.add(chave);
    itens.push({ descricao: f.descricao, valor: f.valor, data: proxima, origem: "RECORRENTE" });
  }

  return itens.sort((a, b) => a.data.getTime() - b.data.getTime());
}

export type EstadoCaixa =
  | "NORMAL" // saldo do mês >= 0
  | "COBERTO" // saldo negativo, mas as entradas previstas cobrem (lacuna temporária)
  | "DEFICIT_PROJETADO" // mesmo com as entradas previstas, ainda falta
  | "SEM_PREVISAO"; // saldo negativo e nenhuma entrada prevista cadastrada

export interface AvaliacaoCaixa {
  estado: EstadoCaixa;
  saldoMes: number;
  /** Quanto falta entrar pra o mês fechar em zero (0 quando o saldo é positivo). */
  falta: number;
  totalPrevisto: number;
  /** saldoMes + totalPrevisto — "caixa livre previsto" quando >= 0. */
  saldoComPrevistas: number;
  previstas: ReceitaPrevista[];
  /** Primeira entrada prevista (a mais próxima). */
  proxima: ReceitaPrevista | null;
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

export function avaliarCaixaPrevisto(saldoMes: number, previstas: ReceitaPrevista[]): AvaliacaoCaixa {
  const totalPrevisto = arredondar(previstas.reduce((s, p) => s + p.valor, 0));
  const saldoComPrevistas = arredondar(saldoMes + totalPrevisto);
  const falta = saldoMes < 0 ? arredondar(-saldoMes) : 0;
  let estado: EstadoCaixa;
  if (saldoMes >= 0) estado = "NORMAL";
  else if (previstas.length === 0) estado = "SEM_PREVISAO";
  else if (saldoComPrevistas >= 0) estado = "COBERTO";
  else estado = "DEFICIT_PROJETADO";
  return { estado, saldoMes, falta, totalPrevisto, saldoComPrevistas, previstas, proxima: previstas[0] ?? null };
}
