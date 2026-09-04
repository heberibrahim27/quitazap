// ─────────────────────────────────────────
// QuitaZAP Controle — Simulador "essa parcela cabe?" (Skill Analista)
// ─────────────────────────────────────────
// Projeta o comprometimento de renda mês a mês somando uma parcela nova
// (hipotética) ao que já existe — nunca resoma Lancamento/Parcela por
// conta própria: usa resumoPlanoSimplificado (o mesmo motor que o
// Dashboard e a Saúde Financeira já consomem) uma vez por mês futuro, só
// acrescentando o valor da parcela hipotética por cima do resultado real
// de cada mês.
//
// Renda e despesas de referência vêm do mês corrente — assumidas estáveis
// pros próximos meses (mesma renda, mesmo padrão de gasto); só a parcela
// de dívida JÁ existente é buscada por período real (varia mês a mês de
// verdade, conforme dívidas vão terminando de pagar).

import { prisma } from "@/lib/prisma";
import { calcularResumoFinanceiro, limitesDoMes, anoMesAtualBrasil } from "./motor";
import { resumoPlanoSimplificado } from "@/lib/plano-pagamento-service";

export interface ProjecaoMesParcela {
  mes: string; // YYYY-MM
  nomeMes: string; // "Outubro/2026"
  calculavel: boolean;
  percentualAtual: number | null;
  percentualComNova: number | null;
  saldoProjetadoComNova: number | null;
  fecha: boolean | null;
}

export interface ResultadoSimulacaoParcela {
  rendaBase: number | null;
  projecoes: ProjecaoMesParcela[];
  primeiroMesQueNaoFecha: string | null;
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function proximoMes(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

// Cap de segurança: a resposta não precisa (nem deveria, por tamanho de
// mensagem de WhatsApp) detalhar mais que 2 anos de projeção mesmo que a
// compra seja parcelada em mais vezes que isso.
const LIMITE_MESES_PROJETADOS = 24;

export async function simularParcela(
  clienteId: string,
  valorParcela: number,
  quantidadeParcelas: number,
  primeiraData: Date = new Date(),
): Promise<ResultadoSimulacaoParcela> {
  const hoje = new Date();
  const { ano: anoAtualRef, mes: mesAtualRef } = anoMesAtualBrasil(hoje);
  const periodoAtual = limitesDoMes(anoAtualRef, mesAtualRef);
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { rendaMensal: true } });
  const resumoAtual = await calcularResumoFinanceiro({ clienteId, periodo: periodoAtual, rendaMensalDeclarada: cliente?.rendaMensal ?? null });
  const rendaBase = resumoAtual.comprometimento.rendaEfetiva;
  const despesasBase = resumoAtual.totais.totalSaidasSemDividas;

  const { ano: anoInicio, mes: mesInicio } = anoMesAtualBrasil(primeiraData);
  const projecoes: ProjecaoMesParcela[] = [];
  let ano = anoInicio;
  let mes = mesInicio;

  const limiteMeses = Math.min(quantidadeParcelas, LIMITE_MESES_PROJETADOS);
  for (let i = 0; i < limiteMeses; i++) {
    const periodo = limitesDoMes(ano, mes);
    const resumoPlano = await resumoPlanoSimplificado({
      clienteId,
      rendaMensal: rendaBase,
      totalDespesasMes: despesasBase,
      inicioMes: periodo.inicio,
      fimMes: periodo.fim,
    });

    let percentualAtual: number | null = null;
    let percentualComNova: number | null = null;
    let saldoProjetadoComNova: number | null = null;
    let fecha: boolean | null = null;

    if (resumoPlano.calculavel && resumoPlano.rendaDisponivel > 0) {
      percentualAtual = Math.min(resumoPlano.totalComprometido / resumoPlano.rendaDisponivel, 1.5);
      const totalComNova = resumoPlano.totalComprometido + valorParcela;
      percentualComNova = Math.min(totalComNova / resumoPlano.rendaDisponivel, 1.5);
      saldoProjetadoComNova = resumoPlano.saldoProjetado - valorParcela;
      fecha = saldoProjetadoComNova >= 0;
    }

    projecoes.push({
      mes: `${ano}-${String(mes).padStart(2, "0")}`,
      nomeMes: `${NOMES_MES[mes - 1]}/${ano}`,
      calculavel: resumoPlano.calculavel,
      percentualAtual,
      percentualComNova,
      saldoProjetadoComNova,
      fecha,
    });

    const prox = proximoMes(ano, mes);
    ano = prox.ano;
    mes = prox.mes;
  }

  const primeiroMesQueNaoFecha = projecoes.find((p) => p.fecha === false)?.nomeMes ?? null;

  return { rendaBase, projecoes, primeiroMesQueNaoFecha };
}
