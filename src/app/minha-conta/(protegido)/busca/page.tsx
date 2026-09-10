import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { anoMesAtualBrasil, limitesDoMes } from "@/lib/financeiro/motor";
import { BuscaClient } from "./BuscaClient";

export const dynamic = "force-dynamic";

// Busca por texto/período/valor — usa a MESMA rota (/api/minha-conta/
// movimentacoes) e função canônica (listarMovimentacoes) que o card de
// gráfico de categoria do chat usa pro "Ver lançamentos"/"Expandir" —
// nunca uma definição de filtro paralela.
export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<{ inicio?: string; fim?: string; categoria?: string }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const params = await searchParams;
  let inicio = params.inicio;
  let fim = params.fim;
  if (!inicio || !fim) {
    const { ano, mes } = anoMesAtualBrasil(new Date());
    const periodo = limitesDoMes(ano, mes);
    inicio = periodo.inicio.toISOString();
    fim = periodo.fim.toISOString();
  }

  return <BuscaClient inicioInicial={inicio} fimInicial={fim} categoriaInicial={params.categoria ?? ""} />;
}
