import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { gradienteDoCartao } from "@/lib/cartoes-conhecidos";
import { CartaoCarrossel, type CartaoCarrosselItem } from "./CartaoCarrossel";

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

export default async function CartoesPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { ano, mes, dia: diaAtual } = anoMesAtualBrasil(new Date());
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(ano, mes);

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

  // "Últimas compras" é histórico — só o que já aconteceu (até o fim do mês
  // atual). Sem esse corte, parcelas futuras de uma compra parcelada (datadas
  // pros próximos meses) apareciam misturadas aqui, inclusive antes de
  // parcelas mais antigas já realizadas (por causa do orderBy desc por data).
  const comprasPorCartao = await Promise.all(
    cartoes.map((c) =>
      prisma.lancamento.findMany({
        where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: c.id, data: { lt: fimMes } },
        orderBy: { data: "desc" },
        take: 15,
      })
    )
  );

  // Parcelas já agendadas pros próximos meses — pra dar visibilidade de onde
  // o limite comprometido (calculado abaixo) está "preso", já que elas não
  // aparecem em "Últimas compras" (que é só histórico do que já aconteceu).
  const proximasParcelasPorCartao = await Promise.all(
    cartoes.map((c) =>
      prisma.lancamento.findMany({
        where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: c.id, data: { gte: fimMes } },
        orderBy: { data: "asc" },
        take: 24,
      })
    )
  );

  // "Disponível" precisa descontar o valor TOTAL comprometido no limite, não
  // só a fatura deste mês — uma compra parcelada reserva o valor inteiro no
  // limite assim que é feita (mesmo comportamento do cartão de verdade), não
  // só a parcela que cai na fatura atual. Por isso soma tudo a partir do
  // início do mês atual (mês atual + parcelas futuras já agendadas); meses
  // anteriores já viraram fatura paga e não pesam mais no limite.
  const comprometidoPorCartao = await Promise.all(
    cartoes.map((c) =>
      prisma.lancamento.aggregate({
        where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: c.id, data: { gte: inicioMes } },
        _sum: { valor: true },
      })
    )
  );

  const itens: CartaoCarrosselItem[] = cartoes.map((c, i) => {
    const comprometido = comprometidoPorCartao[i]._sum.valor ?? 0;
    const disponivel = c.limite != null ? c.limite - comprometido : null;
    return {
      id: c.id,
      nome: c.nome,
      cor: gradienteDoCartao(c.nome),
      vencimentoTexto: c.diaVencimento ? `Vence dia ${c.diaVencimento}` : "Vencimento não definido",
      limiteFmt: c.limite != null ? fmtValor(c.limite) : null,
      disponivelFmt: disponivel != null ? fmtValor(disponivel) : null,
      faturaFechada: c.diaFechamento != null && diaAtual >= c.diaFechamento,
      compras: comprasPorCartao[i].map((l) => ({
        id: l.id,
        descricao: l.descricao,
        categoria: l.categoria,
        valor: l.valor,
        dataFmt: fmtData(l.data),
      })),
      proximasParcelas: proximasParcelasPorCartao[i].map((l) => ({
        id: l.id,
        descricao: l.descricao,
        categoria: l.categoria,
        valor: l.valor,
        dataFmt: fmtDataComAno(l.data),
        mesChave: mesChave(l.data),
        mesLabel: mesLabel(l.data),
      })),
      proximasParcelasTotalFmt: fmtValor(
        proximasParcelasPorCartao[i].reduce((soma, l) => soma + l.valor, 0)
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

      <CartaoCarrossel cartoes={itens} />
    </div>
  );
}
