import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { MesSwipe } from "../MesSwipe";
import { MesFiltro } from "../MesFiltro";
import { ValorLista } from "../ValorLista";
import { ehReceitaFutura } from "@/lib/financeiro/receita-futura";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

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

function paramMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export default async function ReceitasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[] }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { mes: mesParamBruto } = await searchParams;
  const mesParam = Array.isArray(mesParamBruto) ? mesParamBruto[0] : mesParamBruto;
  const { ano: anoAtual, mes: mesAtualNum } = anoMesAtualBrasil(new Date());

  let ano = anoAtual;
  let mes = mesAtualNum;
  const match = mesParam?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const anoInformado = Number(match[1]);
    const mesInformado = Number(match[2]);
    if (anoInformado >= 2000 && anoInformado <= 2100 && mesInformado >= 1 && mesInformado <= 12) {
      ano = anoInformado;
      mes = mesInformado;
    }
  }

  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(ano, mes);
  const mesAnterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const mesSeguinte = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  const nomeMes = NOMES_MES[mes - 1];

  // Saque de meta (categoria "Metas") é dinheiro voltando pro disponível, não
  // renda — o motor já o exclui de receitas (calcularTotaisBase); esta lista
  // precisa bater com ele.
  const receitas = (
    await prisma.lancamento.findMany({
      where: { clienteId: cliente.id, tipo: "RECEITA", data: { gte: inicioMes, lt: fimMes } },
      orderBy: { data: "desc" },
    })
  ).filter((r) => r.categoria !== "Metas");
  const total = receitas.filter((r) => !ehReceitaFutura(r.data)).reduce((soma, r) => soma + r.valor, 0);
  const aReceber = receitas.filter((r) => ehReceitaFutura(r.data)).reduce((soma, r) => soma + r.valor, 0);

  return (
    <MesSwipe
      hrefAnterior={`/minha-conta/receitas?mes=${paramMes(mesAnterior.ano, mesAnterior.mes)}`}
      hrefSeguinte={`/minha-conta/receitas?mes=${paramMes(mesSeguinte.ano, mesSeguinte.mes)}`}
    >
      <MesFiltro
        hrefAnterior={`/minha-conta/receitas?mes=${paramMes(mesAnterior.ano, mesAnterior.mes)}`}
        hrefSeguinte={`/minha-conta/receitas?mes=${paramMes(mesSeguinte.ano, mesSeguinte.mes)}`}
        label={`${nomeMes}/${ano}`}
      />

      <section className="card aba-destaque verde" style={{ marginBottom: 16 }}>
        <div className="aba-destaque-topo">
          <div>
            <p className="aba-destaque-rot">Total recebido em {nomeMes.toLowerCase()}</p>
            <p className="aba-destaque-valor">{fmtValor(total)}</p>
          </div>
          <span className="aba-destaque-chip">{receitas.length} entrada{receitas.length === 1 ? "" : "s"}</span>
        </div>
        {aReceber > 0 && <p className="aba-delta bom">Ainda a receber neste mês: {fmtValor(aReceber)}</p>}
      </section>

      <div className="mc-card">
        {receitas.length === 0 ? (
          <p className="mc-empty">Nenhuma receita registrada em {nomeMes.toLowerCase()}.</p>
        ) : (
          <div className="mc-list">
            {receitas.map((r) => (
              <div key={r.id} className="mc-list-row">
                <div className="mc-list-icon" style={{ background: "var(--green-soft)", color: "var(--green)" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="3" /><circle cx="12" cy="12" r="2.6" /><path d="M5.5 9v6M18.5 9v6" /></svg>
                </div>
                <div className="mc-list-body">
                  <div className="mc-list-desc">{r.descricao}</div>
                  <div className="mc-list-meta">
                    {r.recorrente ? "Recorrente" : "Receita"}
                    {ehReceitaFutura(r.data) && <span className="dv-tag libera" style={{ marginLeft: 6 }}>A receber</span>}
                  </div>
                </div>
                <div className="mc-list-side">
                  <ValorLista valor={r.valor} sinal="+" cor="pos" />
                  <div className="mc-list-sub">
                    {fmtData(r.data)} · <Link href={`/minha-conta/lancamento/${r.id}/editar`}>editar</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MesSwipe>
  );
}
