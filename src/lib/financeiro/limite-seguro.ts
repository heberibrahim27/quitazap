// ─────────────────────────────────────────
// QuitaZAP Controle — "Até o próximo salário" / limite seguro por dia
// ─────────────────────────────────────────
// O app não tem Cliente.diaRecebimento (decisão explícita: não adicionar
// esse campo por enquanto) — "próximo salário" aqui é aproximado pelo fim
// do mês corrente, o mesmo ciclo que todo o resto do Controle já usa.
// Sempre lê do motor central (calcularResumoFinanceiro) pro saldo livre e
// pros compromissos já sabidos do mês — a única query nova aqui é o
// agrupamento de parcelas futuras por dia, pra achar dia com contas
// coincidindo (não existe primitiva pra isso em motor.ts ainda).

import { prisma } from "@/lib/prisma";
import { calcularResumoFinanceiro, limitesDoMes, anoMesAtualBrasil } from "./motor";

export interface ItemDiaApertado {
  credor: string;
  valor: number;
}

export interface DiaApertado {
  data: string; // YYYY-MM-DD
  totalNoDia: number;
  itens: ItemDiaApertado[];
}

export interface LimiteSeguro {
  diasRestantes: number;
  saldoLivre: number;
  compromissosRestantes: number;
  limiteSeguroDiario: number;
  diaApertado: DiaApertado | null;
  // true quando não há renda lançada este mês NEM renda declarada no
  // Perfil — nesse caso saldoLivre/limiteSeguroDiario abaixo são só "0
  // menos despesas", não um saldo real, e não devem ser mostrados como se
  // fossem (ver LimiteSeguroCard.tsx e limite-seguro-resolver.ts).
  semDadosSuficientes: boolean;
}

export async function calcularLimiteSeguro(
  clienteId: string,
  referencia: Date = new Date(),
): Promise<LimiteSeguro> {
  const { ano, mes } = anoMesAtualBrasil(referencia);
  const periodo = limitesDoMes(ano, mes);
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { rendaMensal: true } });
  const resumo = await calcularResumoFinanceiro({ clienteId, periodo, rendaMensalDeclarada: cliente?.rendaMensal ?? null });
  const semDadosSuficientes = !resumo.comprometimento.calculavel;

  const diasRestantes = resumo.previsao?.diasRestantes ?? 0;
  // Empréstimos/outras dívidas do mês (já excluindo consignado — ver
  // Divida.descontadoEmFolha) são os "compromissos" ainda a honrar este
  // mês, o mesmo total que o motor já soma pra `totalSaidasOperacionais`.
  const compromissosRestantes = resumo.totais.emprestimos + resumo.totais.outrasDividas;
  // Mesma "sobra do mês" que o Dashboard e a Saúde Financeira já mostram —
  // aqui só é redistribuída pelos dias restantes, nunca recalculada.
  const saldoLivre = resumo.comprometimento.calculavel
    ? resumo.comprometimento.saldoProjetado
    : resumo.totais.resultadoSemPlano;
  const limiteSeguroDiario = diasRestantes > 0 ? saldoLivre / diasRestantes : saldoLivre;

  // Dia apertado: 2+ parcelas de dívidas diferentes vencendo no mesmo dia,
  // de hoje até o fim do mês — sinal concreto de "contas coincidindo".
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const parcelasFuturas = await prisma.parcela.findMany({
    where: {
      status: "PENDENTE",
      vencimento: { gte: hoje, lt: periodo.fim },
      divida: { clienteId, status: "ATIVA", descontadoEmFolha: false },
    },
    select: { valor: true, vencimento: true, divida: { select: { credor: true } } },
    orderBy: { vencimento: "asc" },
  });

  const porDia = new Map<string, { total: number; itens: ItemDiaApertado[] }>();
  for (const p of parcelasFuturas) {
    const chave = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(p.vencimento);
    const atual = porDia.get(chave) ?? { total: 0, itens: [] };
    atual.total += p.valor;
    atual.itens.push({ credor: p.divida.credor, valor: p.valor });
    porDia.set(chave, atual);
  }

  let diaApertado: DiaApertado | null = null;
  for (const [data, info] of porDia) {
    if (info.itens.length >= 2 && (diaApertado == null || info.total > diaApertado.totalNoDia)) {
      diaApertado = { data, totalNoDia: info.total, itens: info.itens };
    }
  }

  return { diasRestantes, saldoLivre, compromissosRestantes, limiteSeguroDiario, diaApertado, semDadosSuficientes };
}
