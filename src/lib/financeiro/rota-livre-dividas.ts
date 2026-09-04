// ─────────────────────────────────────────
// QuitaZAP Controle — Rota para ficar livre das dívidas (Skill Analista)
// ─────────────────────────────────────────
// Compara duas estratégias clássicas de priorização de dívida — "menor
// saldo primeiro" (bola de neve) vs "maior juros primeiro" (avalanche) —
// usando só os dados que já existem em Divida/Parcela, sem inventar taxa
// de juros nem CET (upgrade futuro, fora do escopo agora).
//
// "Juros restante" de cada dívida é derivado só de campos já cadastrados:
// soma das parcelas PENDENTE (o que ainda seria pago seguindo o
// cronograma) menos o saldo devedor atual (valorTotal - valorPago). Isso
// só é > 0 quando o cliente cadastrou o empréstimo com parcela × qtd
// maior que o valor tomado emprestado (juros de verdade, não um simples
// parcelamento sem juros) — nunca uma taxa inventada.
//
// A "economia" mostrada não é uma simulação mês a mês (isso exigiria
// saber a taxa mensal pra separar principal de juros em cada parcela,
// que não temos) — é o juro que ainda falta pagar na dívida de maior
// custo relativo, economizável quitando ela à vista hoje em vez de seguir
// o cronograma normal (direito à redução proporcional de juros na
// quitação antecipada, Art. 52 §2º do CDC).

import { prisma } from "@/lib/prisma";

export interface DividaRota {
  id: string;
  credor: string;
  tipo: string;
  saldoDevedor: number;
  parcelasRestantes: number;
  dataQuitacaoNatural: Date | null;
  /** null quando a dívida não tem nenhuma Parcela cadastrada — sem
   * cronograma, não dá pra estimar juros embutido. */
  jurosRestante: number | null;
  /** jurosRestante / saldoDevedor — proxy de "taxa restante", pra
   * comparar dívidas de tamanhos diferentes. null = sem estimativa. */
  custoRelativo: number | null;
}

export interface RotaLivreDividas {
  porMenorSaldo: DividaRota[];
  porMaiorJuros: DividaRota[];
  /** Maior data de quitação natural entre as dívidas com cronograma —
   * "se nada mudar, esta é a data que você fica livre de tudo". */
  dataLivreDeTudo: Date | null;
  /** A dívida no topo da estratégia "maior juros primeiro", quando dá
   * pra estimar juros nela — é a candidata a quitar à vista primeiro. */
  prioridadeJuros: DividaRota | null;
}

export async function calcularRotaLivreDividas(clienteId: string): Promise<RotaLivreDividas> {
  const dividas = await prisma.divida.findMany({
    where: { clienteId, status: "ATIVA" },
    include: {
      parcelas: { where: { status: "PENDENTE" }, orderBy: { vencimento: "asc" } },
    },
  });

  const itens: DividaRota[] = dividas
    .map((d) => {
      const saldoDevedor = Math.max(d.valorTotal - d.valorPago, 0);
      const parcelasRestantes = d.parcelas.length;
      const dataQuitacaoNatural = parcelasRestantes > 0 ? d.parcelas[parcelasRestantes - 1].vencimento : null;

      let jurosRestante: number | null = null;
      let custoRelativo: number | null = null;
      if (parcelasRestantes > 0) {
        const totalParcelasRestantes = d.parcelas.reduce((soma, p) => soma + p.valor, 0);
        jurosRestante = Math.max(totalParcelasRestantes - saldoDevedor, 0);
        custoRelativo = saldoDevedor > 0 ? jurosRestante / saldoDevedor : 0;
      }

      return { id: d.id, credor: d.credor, tipo: d.tipo, saldoDevedor, parcelasRestantes, dataQuitacaoNatural, jurosRestante, custoRelativo };
    })
    .filter((d) => d.saldoDevedor > 0);

  const porMenorSaldo = [...itens].sort((a, b) => a.saldoDevedor - b.saldoDevedor);
  const porMaiorJuros = [...itens].sort((a, b) => (b.custoRelativo ?? -1) - (a.custoRelativo ?? -1));

  const datasConhecidas = itens
    .map((d) => d.dataQuitacaoNatural)
    .filter((d): d is Date => d != null);
  const dataLivreDeTudo = datasConhecidas.length > 0
    ? new Date(Math.max(...datasConhecidas.map((d) => d.getTime())))
    : null;

  const prioridadeJuros = porMaiorJuros.find((d) => d.jurosRestante != null && d.jurosRestante > 0) ?? null;

  return { porMenorSaldo, porMaiorJuros, dataLivreDeTudo, prioridadeJuros };
}
