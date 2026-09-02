import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

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

const ABAS = ["todas", "fixas", "variaveis"] as const;
type Aba = (typeof ABAS)[number];
const ROTULO_ABA: Record<Aba, string> = { todas: "Todas", fixas: "Fixas", variaveis: "Variáveis" };

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

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[]; aba?: string | string[] }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { mes: mesParamBruto, aba: abaParamBruto } = await searchParams;
  const mesParam = Array.isArray(mesParamBruto) ? mesParamBruto[0] : mesParamBruto;
  const abaParam = Array.isArray(abaParamBruto) ? abaParamBruto[0] : abaParamBruto;
  const aba: Aba = ABAS.includes(abaParam as Aba) ? (abaParam as Aba) : "todas";

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

  const tipos = aba === "fixas" ? ["DESPESA_FIXA"] : aba === "variaveis" ? ["DESPESA_VARIAVEL"] : ["DESPESA_FIXA", "DESPESA_VARIAVEL"];

  const despesas = await prisma.lancamento.findMany({
    where: { clienteId: cliente.id, tipo: { in: tipos }, data: { gte: inicioMes, lt: fimMes } },
    orderBy: { data: "desc" },
  });
  const total = despesas.reduce((soma, d) => soma + d.valor, 0);

  const sufixoMes = `mes=${paramMes(ano, mes)}`;

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-7 9 7" /><path d="M5 9v11h14V9" /></svg>
          </span>
          <span className="title-label">Despesas — {nomeMes}/{ano}</span>
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href={`/minha-conta/despesas?mes=${paramMes(mesAnterior.ano, mesAnterior.mes)}&aba=${aba}`} className="card-link" aria-label="Mês anterior">‹</Link>
          <Link href={`/minha-conta/despesas?mes=${paramMes(mesSeguinte.ano, mesSeguinte.mes)}&aba=${aba}`} className="card-link" aria-label="Próximo mês">›</Link>
        </div>
      </div>

      <div className="mc-tabs">
        {ABAS.map((a) => (
          <Link key={a} href={`/minha-conta/despesas?${sufixoMes}&aba=${a}`} className={`mc-tab ${aba === a ? "active" : ""}`}>
            {ROTULO_ABA[a]}
          </Link>
        ))}
      </div>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink-dim)" }}>
          Total em {ROTULO_ABA[aba].toLowerCase()} — {nomeMes.toLowerCase()}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 800, color: "var(--ink)", fontFamily: "'IBM Plex Mono', monospace" }}>
          {fmtValor(total)}
        </p>
      </div>

      <div className="mc-card">
        {despesas.length === 0 ? (
          <p className="mc-empty">Nenhuma despesa registrada em {nomeMes.toLowerCase()}.</p>
        ) : (
          <div className="mc-list">
            {despesas.map((d) => (
              <div key={d.id} className="mc-list-row">
                <div className="mc-list-icon" style={{ background: d.tipo === "DESPESA_FIXA" ? "rgba(30,99,233,0.1)" : "rgba(23,180,216,0.1)", color: d.tipo === "DESPESA_FIXA" ? "var(--blue)" : "var(--cyan)" }}>
                  {d.tipo === "DESPESA_FIXA" ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-7 9 7" /><path d="M5 9v11h14V9" /></svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.7 12.5h9.8l2.1-8H6.4" /></svg>
                  )}
                </div>
                <div className="mc-list-body">
                  <div className="mc-list-desc">{d.descricao}</div>
                  <div className="mc-list-meta">
                    {d.tipo === "DESPESA_FIXA" ? "Despesa fixa" : "Despesa variável"}
                    {d.categoria ? ` · ${d.categoria}` : ""}
                    {d.recorrente ? " · recorrente" : ""}
                  </div>
                </div>
                <div className="mc-list-side">
                  <div className="mc-list-value">-{fmtValor(d.valor)}</div>
                  <div className="mc-list-sub">
                    {fmtData(d.data)} · <Link href={`/minha-conta/lancamento/${d.id}/editar`}>editar</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
