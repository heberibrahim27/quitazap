import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { gradienteDoCartao } from "@/lib/cartoes-conhecidos";
import { deslocarMes, mesFaturaDaCompra } from "@/lib/financeiro/fatura-cartao";
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

  const { inicio: inicioMes } = limitesDoMes(anoAtual, mesAtual);

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
  // "Timed out fetching a new connection" (P2024). Trocado por queries
  // FIXAS no total (uma por grupo, todos os cartões de uma vez via
  // `cartaoId: { in: [...] }` ou `groupBy`), sem crescer com a quantidade
  // de cartões do cliente.
  const cartaoIds = cartoes.map((c) => c.id);
  const diaFechamentoPorCartao = new Map(cartoes.map((c) => [c.id, c.diaFechamento]));
  const diaVencimentoPorCartao = new Map(cartoes.map((c) => [c.id, c.diaVencimento]));

  // Achado real (Ibrahim, 14/09/2026): a fatura de cada compra é calculada
  // em memória por mesFaturaDaCompra (cada cartão pode ter um dia de
  // fechamento diferente, então o banco não sabe fazer essa conta por
  // cartão numa query só) — não mais pelo mês calendário puro da data. Uma
  // compra pode ir parar em até 2 meses depois do seu mês calendário (1
  // pelo fechamento + 1 pelo vencimento), então a janela buscada no banco
  // é alargada 2 meses pra cada lado do mês selecionado, generosa o
  // bastante pra cobrir qualquer combinação de fechamento/vencimento.
  const janelaIni = deslocarMes(anoSel, mesSel, -2);
  const janelaFim = deslocarMes(anoSel, mesSel, 2);
  const inicioJanela = limitesDoMes(janelaIni.ano, janelaIni.mes).inicio;
  const fimJanela = limitesDoMes(janelaFim.ano, janelaFim.mes).fim;
  const mesAnteriorAoAtual = deslocarMes(anoAtual, mesAtual, -1);
  const inicioJanelaParcelas = limitesDoMes(mesAnteriorAoAtual.ano, mesAnteriorAoAtual.mes).inicio;

  const [comprasJanela, proximasParcelasTodas, comprometidoPorCartaoRaw] = await Promise.all([
    // Substitui a antiga query estreita [inicioMesSel, fimMesSel) — ver
    // comentário da janela acima. A fatura de cada linha é decidida logo
    // abaixo, não pelo filtro do banco.
    prisma.lancamento.findMany({
      where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: { in: cartaoIds }, data: { gte: inicioJanela, lt: fimJanela } },
      orderBy: { data: "desc" },
    }),
    // Parcelas já agendadas pros próximos meses — pra dar visibilidade de
    // onde o limite comprometido (calculado abaixo) está "preso", já que
    // elas não aparecem em "Últimas compras" (só histórico do que já
    // aconteceu). Início alargado em 1 mês (mesmo motivo da janela acima)
    // — a fatura de cada uma é recalculada abaixo, e só entram as que
    // caem numa fatura de verdade futura em relação a hoje.
    prisma.lancamento.findMany({
      where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: { in: cartaoIds }, data: { gte: inicioJanelaParcelas } },
      orderBy: { data: "asc" },
    }),
    // "Disponível" precisa descontar o valor TOTAL comprometido no limite,
    // não só a fatura deste mês — uma compra parcelada reserva o valor
    // inteiro no limite assim que é feita (mesmo comportamento do cartão de
    // verdade), não só a parcela que cai na fatura atual. Por isso soma
    // tudo a partir do início do mês atual (mês atual + parcelas futuras já
    // agendadas); meses anteriores já viraram fatura paga. Continua por
    // mês CALENDÁRIO de propósito — é sobre limite consumido, não sobre em
    // qual fatura a compra vai aparecer.
    prisma.lancamento.groupBy({
      by: ["cartaoId"],
      where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: { in: cartaoIds }, data: { gte: inicioMes } },
      _sum: { valor: true },
    }),
  ]);

  const comprometidoPorCartao = new Map(comprometidoPorCartaoRaw.map((g) => [g.cartaoId, g._sum.valor ?? 0]));

  const faturaSelPorCartao = new Map<string, number>();
  const comprasPorCartao = new Map<string, typeof comprasJanela>();
  for (const l of comprasJanela) {
    if (!l.cartaoId) continue;
    const fatura = mesFaturaDaCompra(l.data, diaFechamentoPorCartao.get(l.cartaoId) ?? null, diaVencimentoPorCartao.get(l.cartaoId) ?? null);
    if (fatura.ano !== anoSel || fatura.mes !== mesSel) continue;

    faturaSelPorCartao.set(l.cartaoId, (faturaSelPorCartao.get(l.cartaoId) ?? 0) + l.valor);
    const lista = comprasPorCartao.get(l.cartaoId) ?? [];
    if (lista.length < 15) lista.push(l);
    comprasPorCartao.set(l.cartaoId, lista);
  }

  // Só entram parcelas cuja fatura calculada é estritamente depois do mês
  // atual DE VERDADE (não do mês navegado no filtro) — esta lista é
  // sempre "o que vem pela frente a partir de hoje".
  const proximasParcelasPorCartao = new Map<string, { l: (typeof proximasParcelasTodas)[number]; fatura: { ano: number; mes: number } }[]>();
  for (const l of proximasParcelasTodas) {
    if (!l.cartaoId) continue;
    const fatura = mesFaturaDaCompra(l.data, diaFechamentoPorCartao.get(l.cartaoId) ?? null, diaVencimentoPorCartao.get(l.cartaoId) ?? null);
    if (fatura.ano * 12 + fatura.mes <= anoAtual * 12 + mesAtual) continue;

    const lista = proximasParcelasPorCartao.get(l.cartaoId) ?? [];
    if (lista.length < 24) lista.push({ l, fatura });
    proximasParcelasPorCartao.set(l.cartaoId, lista);
  }

  const itens: CartaoCarrosselItem[] = cartoes.map((c) => {
    const comprometido = comprometidoPorCartao.get(c.id) ?? 0;
    const disponivel = c.limite != null ? c.limite - comprometido : null;
    const faturaSelValor = faturaSelPorCartao.get(c.id) ?? 0;

    // Fatura atual do cartão = a que uma compra feita agora mesmo cairia
    // — a partir dela dá pra saber se a fatura selecionada no filtro está
    // aberta (é a atual ou uma futura, ainda nem começou) ou já fechou
    // (é anterior à atual), sem precisar refazer a conta de fechamento ao
    // contrário. Mesmo achado do Ibrahim (14/09/2026): antes essa
    // comparação usava o mês CALENDÁRIO do filtro contra o mês calendário
    // de hoje, o que dava errado sempre que o rótulo da fatura (mês de
    // vencimento) diverge do mês em que ela fechou.
    const faturaAtualDoCartao = c.diaFechamento != null ? mesFaturaDaCompra(new Date(), c.diaFechamento, c.diaVencimento) : null;
    const faturaSelFechadaCartao =
      faturaAtualDoCartao != null && anoSel * 12 + mesSel < faturaAtualDoCartao.ano * 12 + faturaAtualDoCartao.mes;

    const mesSelEhFaturaAtual = faturaAtualDoCartao != null && anoSel === faturaAtualDoCartao.ano && mesSel === faturaAtualDoCartao.mes;
    const comprasLabel = mesSelEhFaturaAtual ? "Últimas compras" : `Compras de ${NOMES_MES_ABREV[mesSel - 1]}/${anoSel}`;
    const comprasVazioLabel = mesSelEhFaturaAtual
      ? "Nenhuma compra registrada nesse cartão ainda."
      : `Nenhuma compra em ${NOMES_MES_ABREV[mesSel - 1]}/${anoSel}.`;

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
      comprasLabel,
      comprasVazioLabel,
      compras: (comprasPorCartao.get(c.id) ?? []).map((l) => ({
        id: l.id,
        descricao: l.descricao,
        categoria: l.categoria,
        valor: l.valor,
        dataFmt: fmtData(l.data),
      })),
      proximasParcelas: (proximasParcelasPorCartao.get(c.id) ?? []).map(({ l, fatura }) => ({
        id: l.id,
        descricao: l.descricao,
        categoria: l.categoria,
        valor: l.valor,
        dataFmt: fmtDataComAno(l.data),
        mesChave: `${fatura.ano}-${String(fatura.mes).padStart(2, "0")}`,
        mesLabel: `${NOMES_MES_ABREV[fatura.mes - 1]}/${fatura.ano}`,
      })),
      proximasParcelasTotalFmt: fmtValor(
        (proximasParcelasPorCartao.get(c.id) ?? []).reduce((soma, { l }) => soma + l.valor, 0)
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
