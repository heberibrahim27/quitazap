import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { gradienteDoCartao } from "@/lib/cartoes-conhecidos";
import { CartaoCarrossel, type CartaoCarrosselItem } from "./CartaoCarrossel";
import { MesFiltro } from "../MesFiltro";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
// Parcela futura pode cair num ano diferente do atual (ex: compra em 12x
// feita em outubro termina no ano seguinte) — sem o ano, "03/06" fica
// ambíguo entre "mês que vem" e "daqui a um ano e meio".
function fmtDataComAno(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const NOMES_MES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// Chave ordenável (ano-mês) pra agrupar/filtrar parcelas futuras por mês
// no client, e um rótulo pra exibir ("Out/2026").
function mesChave(d: Date): string {
  const data = new Date(d);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}
function mesLabel(d: Date): string {
  const data = new Date(d);
  return `${NOMES_MES_ABREV[data.getMonth()]}/${data.getFullYear()}`;
}

// Mesma âncora em Brasília usada no resto do Controle — ver page.tsx da home.
function anoMesAtualBrasil(agora: Date): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(agora)
    .split("-")
    .map(Number);
  return { ano, mes, dia };
}

function limitesDoMes(ano: number, mes: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1, 3, 0, 0, 0));
  return { inicio, fim };
}

function paramMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export default async function CartoesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[] }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { ano: anoAtual, mes: mesAtual, dia: diaAtual } = anoMesAtualBrasil(new Date());

  // Mês selecionado no filtro (mesmo padrão de Receitas/Despesas) — separado
  // do mês atual porque "Limite"/"Disponível" continuam sendo "agora",
  // só a fatura do card é que navega por mês.
  const { mes: mesParamBruto } = await searchParams;
  const mesParam = Array.isArray(mesParamBruto) ? mesParamBruto[0] : mesParamBruto;
  let anoSel = anoAtual;
  let mesSel = mesAtual;
  const match = mesParam?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const anoInformado = Number(match[1]);
    const mesInformado = Number(match[2]);
    if (anoInformado >= 2000 && anoInformado <= 2100 && mesInformado >= 1 && mesInformado <= 12) {
      anoSel = anoInformado;
      mesSel = mesInformado;
    }
  }
  const mesAnterior = mesSel === 1 ? { ano: anoSel - 1, mes: 12 } : { ano: anoSel, mes: mesSel - 1 };
  const mesSeguinte = mesSel === 12 ? { ano: anoSel + 1, mes: 1 } : { ano: anoSel, mes: mesSel + 1 };

  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(anoAtual, mesAtual);
  const { inicio: inicioMesSel, fim: fimMesSel } = limitesDoMes(anoSel, mesSel);
  // A fatura do mês selecionado já fechou? Qualquer mês antes do atual
  // sempre fechou; o mês atual só fecha quando o dia de hoje alcança o dia
  // de fechamento cadastrado no cartão (sem essa data, nunca consideramos
  // fechada — fica sempre "em aberto").
  const mesSelEhAnterior = anoSel < anoAtual || (anoSel === anoAtual && mesSel < mesAtual);
  const mesSelEhAtual = anoSel === anoAtual && mesSel === mesAtual;

  const cartoes = await prisma.cartao.findMany({ where: { clienteId: cliente.id }, orderBy: { nome: "asc" } });

  if (cartoes.length === 0) {
    return (
      <div>
        <div className="card-head">
          <p className="card-title">
            <span className="title-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>
            </span>
            <span className="title-label">Cartões</span>
          </p>
          <Link href="/minha-conta/cartoes/novo" className="card-link">
            + Adicionar
          </Link>
        </div>
        <div className="mc-card">
          <p className="mc-empty">Nenhum cartão cadastrado ainda. Toque em &ldquo;+ Adicionar&rdquo; pra criar o primeiro.</p>
        </div>
      </div>
    );
  }

  // Antes disparava até 4 queries POR CARTÃO em paralelo (uma pra cada
  // grupo abaixo) — com o pool de conexões do Postgres limitado (5 no
  // plano atual), um cliente com vários cartões estourava o pool e caía em
  // "Timed out fetching a new connection" (P2024). Trocado por 4 queries
  // FIXAS no total (uma por grupo, todos os cartões de uma vez via
  // `cartaoId: { in: [...] }` ou `groupBy`), sem crescer com a quantidade
  // de cartões do cliente.
  const cartaoIds = cartoes.map((c) => c.id);

  const [comprasTodas, proximasParcelasTodas, comprometidoPorCartaoRaw, faturaSelPorCartaoRaw] = await Promise.all([
    // "Últimas compras" é histórico — só o que já aconteceu (até o fim do
    // mês atual). Sem esse corte, parcelas futuras de uma compra parcelada
    // (datadas pros próximos meses) apareciam misturadas aqui, inclusive
    // antes de parcelas mais antigas já realizadas (orderBy desc por data).
    // Sem `take` por cartão (agora é uma query só) — a lista é fatiada por
    // cartão depois, em memória.
    prisma.lancamento.findMany({
      where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: { in: cartaoIds }, data: { lt: fimMes } },
      orderBy: { data: "desc" },
    }),
    // Parcelas já agendadas pros próximos meses — pra dar visibilidade de
    // onde o limite comprometido (calculado abaixo) está "preso", já que
    // elas não aparecem em "Últimas compras" (só histórico do que já
    // aconteceu).
    prisma.lancamento.findMany({
      where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: { in: cartaoIds }, data: { gte: fimMes } },
      orderBy: { data: "asc" },
    }),
    // "Disponível" precisa descontar o valor TOTAL comprometido no limite,
    // não só a fatura deste mês — uma compra parcelada reserva o valor
    // inteiro no limite assim que é feita (mesmo comportamento do cartão de
    // verdade), não só a parcela que cai na fatura atual. Por isso soma
    // tudo a partir do início do mês atual (mês atual + parcelas futuras já
    // agendadas); meses anteriores já viraram fatura paga.
    prisma.lancamento.groupBy({
      by: ["cartaoId"],
      where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: { in: cartaoIds }, data: { gte: inicioMes } },
      _sum: { valor: true },
    }),
    // Total da fatura do mês escolhido no filtro (independente do mês
    // atual) — o que o cliente navega pra conferir meses passados/futuros.
    prisma.lancamento.groupBy({
      by: ["cartaoId"],
      where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: { in: cartaoIds }, data: { gte: inicioMesSel, lt: fimMesSel } },
      _sum: { valor: true },
    }),
  ]);

  const comprometidoPorCartao = new Map(comprometidoPorCartaoRaw.map((g) => [g.cartaoId, g._sum.valor ?? 0]));
  const faturaSelPorCartao = new Map(faturaSelPorCartaoRaw.map((g) => [g.cartaoId, g._sum.valor ?? 0]));
  const comprasPorCartao = new Map<string, typeof comprasTodas>();
  for (const l of comprasTodas) {
    if (!l.cartaoId) continue;
    const lista = comprasPorCartao.get(l.cartaoId) ?? [];
    if (lista.length < 15) lista.push(l);
    comprasPorCartao.set(l.cartaoId, lista);
  }
  const proximasParcelasPorCartao = new Map<string, typeof proximasParcelasTodas>();
  for (const l of proximasParcelasTodas) {
    if (!l.cartaoId) continue;
    const lista = proximasParcelasPorCartao.get(l.cartaoId) ?? [];
    if (lista.length < 24) lista.push(l);
    proximasParcelasPorCartao.set(l.cartaoId, lista);
  }

  const itens: CartaoCarrosselItem[] = cartoes.map((c) => {
    const comprometido = comprometidoPorCartao.get(c.id) ?? 0;
    const disponivel = c.limite != null ? c.limite - comprometido : null;
    const faturaSelValor = faturaSelPorCartao.get(c.id) ?? 0;
    const faturaSelFechadaCartao = mesSelEhAnterior || (mesSelEhAtual && c.diaFechamento != null && diaAtual >= c.diaFechamento);
    return {
      id: c.id,
      nome: c.nome,
      cor: gradienteDoCartao(c.nome),
      vencimentoTexto: c.diaVencimento ? `Vence dia ${c.diaVencimento}` : "Vencimento não definido",
      limiteFmt: c.limite != null ? fmtValor(c.limite) : null,
      disponivelFmt: disponivel != null ? fmtValor(disponivel) : null,
      faturaFechada: c.diaFechamento != null && diaAtual >= c.diaFechamento,
      faturaSelLabel: faturaSelFechadaCartao ? "Fatura fechada" : "Fatura em aberto",
      faturaSelValorFmt: fmtValor(faturaSelValor),
      compras: (comprasPorCartao.get(c.id) ?? []).map((l) => ({
        id: l.id,
        descricao: l.descricao,
        categoria: l.categoria,
        valor: l.valor,
        dataFmt: fmtData(l.data),
      })),
      proximasParcelas: (proximasParcelasPorCartao.get(c.id) ?? []).map((l) => ({
        id: l.id,
        descricao: l.descricao,
        categoria: l.categoria,
        valor: l.valor,
        dataFmt: fmtDataComAno(l.data),
        mesChave: mesChave(l.data),
        mesLabel: mesLabel(l.data),
      })),
      proximasParcelasTotalFmt: fmtValor(
        (proximasParcelasPorCartao.get(c.id) ?? []).reduce((soma, l) => soma + l.valor, 0)
      ),
    };
  });

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>
          </span>
          <span className="title-label">Cartões</span>
        </p>
        <Link href="/minha-conta/cartoes/novo" className="card-link">
          + Adicionar
        </Link>
      </div>

      <MesFiltro
        hrefAnterior={`/minha-conta/cartoes?mes=${paramMes(mesAnterior.ano, mesAnterior.mes)}`}
        hrefSeguinte={`/minha-conta/cartoes?mes=${paramMes(mesSeguinte.ano, mesSeguinte.mes)}`}
        label={`${NOMES_MES_ABREV[mesSel - 1]}/${anoSel}`}
      />

      <CartaoCarrossel cartoes={itens} />
    </div>
  );
}
