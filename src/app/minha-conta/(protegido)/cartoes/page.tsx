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

  const comprasPorCartao = await Promise.all(
    cartoes.map((c) =>
      prisma.lancamento.findMany({
        where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: c.id },
        orderBy: { data: "desc" },
        take: 15,
      })
    )
  );

  const gastoMesPorCartao = await Promise.all(
    cartoes.map((c) =>
      prisma.lancamento.aggregate({
        where: { clienteId: cliente.id, tipo: "COMPRA_CARTAO", cartaoId: c.id, data: { gte: inicioMes, lt: fimMes } },
        _sum: { valor: true },
      })
    )
  );

  const itens: CartaoCarrosselItem[] = cartoes.map((c, i) => {
    const gastoMes = gastoMesPorCartao[i]._sum.valor ?? 0;
    const disponivel = c.limite != null ? c.limite - gastoMes : null;
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
