import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { resumoPlanoSimplificado } from "@/lib/plano-pagamento-service";

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

// Página "em breve": o motor completo do Plano (prioridade, juros, risco de
// corte, alternativas — ver plano-pagamento-contrato.ts) ainda não existe.
// Enquanto isso, mostra o mesmo resumo simplificado do Dashboard, pra não
// ser uma tela vazia sem nenhuma informação real.
export default async function PlanoPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { ano, mes } = anoMesAtualBrasil(new Date());
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(ano, mes);

  const lancamentosDoMes = await prisma.lancamento.findMany({
    where: { clienteId: cliente.id, data: { gte: inicioMes, lt: fimMes } },
    select: { tipo: true, valor: true },
  });

  let totalDespesasMes = 0;
  let totalReceitasMes = 0;
  for (const l of lancamentosDoMes) {
    if (l.tipo === "DESPESA_FIXA" || l.tipo === "DESPESA_VARIAVEL" || l.tipo === "COMPRA_CARTAO") {
      totalDespesasMes += l.valor;
    } else if (l.tipo === "RECEITA") {
      totalReceitasMes += l.valor;
    }
  }

  // Mesma regra do Dashboard: renda = receitas lançadas no mês, com
  // fallback pra Renda mensal declarada no Perfil enquanto nada foi
  // lançado ainda — um só número de renda em todo o app.
  const rendaEfetiva = totalReceitasMes > 0 ? totalReceitasMes : (cliente.rendaMensal ?? null);

  const resumo = await resumoPlanoSimplificado({
    clienteId: cliente.id,
    rendaMensal: rendaEfetiva,
    totalDespesasMes,
    inicioMes,
    fimMes,
  });

  return (
    <div>
      <div className="mc-hero">
        <div className="mc-hero-top">
          <div>
            <p className="mc-hero-greeting">Plano de pagamento</p>
            <p className="mc-hero-sub">Em construção</p>
          </div>
        </div>

        <div className="mc-hero-body">
          <div>
            <p className="mc-hero-label">{resumo.saldoProjetado >= 0 ? "Sobra prevista este mês" : "Déficit previsto este mês"}</p>
            <p className="mc-hero-amount" style={{ color: resumo.saldoProjetado >= 0 ? "#fff" : "#fca5a5" }}>
              {!resumo.calculavel && "— "}
              {resumo.calculavel ? fmtValor(Math.abs(resumo.saldoProjetado)) : "cadastre sua renda mensal"}
            </p>
            <p className="mc-hero-caption">
              {resumo.calculavel
                ? `${fmtValor(resumo.rendaDisponivel)} de renda − ${fmtValor(resumo.totalComprometido)} comprometidos`
                : "Sem renda mensal cadastrada não dá pra calcular sobra ou déficit."}
            </p>
          </div>
        </div>
      </div>

      <section className="mc-section">
        <div className="mc-card">
          <p style={{ margin: 0, fontWeight: 600 }}>O que essa tela vai fazer</p>
          <p style={{ color: "var(--mc-ink-dim)", marginTop: 8, fontSize: 13.5, lineHeight: 1.6 }}>
            O Plano de Pagamento vai olhar sua renda, suas despesas e suas dívidas juntos e te dizer,
            em ordem, o que pagar primeiro — considerando juros, atraso e risco de corte — além de
            sugerir alternativas quando o dinheiro não fechar. O número acima já é real (calculado a
            partir dos seus dados), mas a recomendação completa ainda está sendo construída.
          </p>
        </div>
      </section>
    </div>
  );
}
