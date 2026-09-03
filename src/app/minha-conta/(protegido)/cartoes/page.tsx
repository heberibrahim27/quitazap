import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { gradienteDoCartao } from "@/lib/cartoes-conhecidos";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Mesma âncora em Brasília usada no resto do Controle — ver page.tsx da home.
function anoMesAtualBrasil(agora: Date): { ano: number; mes: number } {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(agora)
    .split("-")
    .map(Number);
  return { ano, mes };
}

function limitesDoMes(ano: number, mes: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1, 3, 0, 0, 0));
  return { inicio, fim };
}

export default async function CartoesPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { ano, mes } = anoMesAtualBrasil(new Date());
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(ano, mes);

  const [cartoes, comprasMes] = await Promise.all([
    prisma.cartao.findMany({ where: { clienteId: cliente.id }, orderBy: { nome: "asc" } }),
    prisma.lancamento.findMany({
      where: {
        clienteId: cliente.id,
        tipo: "COMPRA_CARTAO",
        data: { gte: inicioMes, lt: fimMes },
        cartaoId: { not: null },
      },
      select: { cartaoId: true, valor: true },
    }),
  ]);

  const gastoPorCartao = new Map<string, number>();
  for (const c of comprasMes) {
    if (!c.cartaoId) continue;
    gastoPorCartao.set(c.cartaoId, (gastoPorCartao.get(c.cartaoId) ?? 0) + c.valor);
  }
  const totalMes = comprasMes.reduce((soma, c) => soma + c.valor, 0);

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

      {cartoes.length > 0 && (
        <div className="mc-card" style={{ marginBottom: 16 }}>
          <div className="cartoes-total">
            <div className="cartoes-total-top">
              <span>
                <p className="cartoes-total-label">Compras no cartão este mês</p>
                <p className="cartoes-total-value">{fmtValor(totalMes)}</p>
              </span>
              <span className="cartoes-total-icon">
                <span className="cartoes-total-icon-chip" />
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="mc-card">
        {cartoes.length === 0 ? (
          <p className="mc-empty">Nenhum cartão cadastrado ainda. Toque em &ldquo;+ Adicionar&rdquo; pra criar o primeiro.</p>
        ) : (
          cartoes.map((c) => {
            const [cor1, cor2] = gradienteDoCartao(c.nome);
            return (
              <Link key={c.id} href={`/minha-conta/cartoes/${c.id}/editar`} className="cartao-row" style={{ textDecoration: "none", color: "inherit" }}>
                <span className="cartao-mark" style={{ background: `linear-gradient(160deg, ${cor1}, ${cor2})` }}>
                  <span className="cartao-chip" />
                  <span className="cartao-initial">{c.nome.charAt(0).toUpperCase()}</span>
                </span>
                <span className="cartao-body">
                  <p className="cartao-nome">{c.nome}</p>
                  <p className="cartao-meta">
                    {c.diaFechamento ? `Fecha dia ${c.diaFechamento}` : "Fechamento não definido"}
                    {c.diaFechamento && c.diaVencimento ? " · " : " · "}
                    {c.diaVencimento ? `Vence dia ${c.diaVencimento}` : "Vencimento não definido"}
                  </p>
                </span>
                <span className="cartao-side">
                  <p className="cartao-value">{fmtValor(gastoPorCartao.get(c.id) ?? 0)}</p>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
