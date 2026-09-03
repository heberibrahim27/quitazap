import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { MesSwipe } from "../MesSwipe";
import { AnimarAoAparecer } from "../AnimarAoAparecer";
import { ValorLista } from "../ValorLista";
import { CategoriaAccordion } from "./CategoriaAccordion";
import { GastosDonut } from "./GastosDonut";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNumero(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CORES = ["blue", "cyan", "orange", "red", "green"] as const;

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

export default async function GastosPage({
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

  const gastos = await prisma.lancamento.findMany({
    where: {
      clienteId: cliente.id,
      tipo: { in: ["DESPESA_FIXA", "DESPESA_VARIAVEL", "COMPRA_CARTAO"] },
      data: { gte: inicioMes, lt: fimMes },
    },
    include: { cartao: { select: { nome: true } } },
    orderBy: { data: "desc" },
  });

  const totalGeral = gastos.reduce((soma, g) => soma + g.valor, 0);

  const porCategoria = new Map<string, typeof gastos>();
  for (const g of gastos) {
    const chave = g.categoria ?? "Outros";
    const lista = porCategoria.get(chave) ?? [];
    lista.push(g);
    porCategoria.set(chave, lista);
  }
  const categorias = Array.from(porCategoria.entries())
    .map(([nome, itens]) => ({ nome, itens, total: itens.reduce((soma, i) => soma + i.valor, 0) }))
    .sort((a, b) => b.total - a.total)
    .map((c, indice) => ({
      ...c,
      cor: CORES[indice % CORES.length],
      percentual: totalGeral > 0 ? Math.round((c.total / totalGeral) * 100) : 0,
    }));

  return (
    <MesSwipe
      hrefAnterior={`/minha-conta/gastos?mes=${paramMes(mesAnterior.ano, mesAnterior.mes)}`}
      hrefSeguinte={`/minha-conta/gastos?mes=${paramMes(mesSeguinte.ano, mesSeguinte.mes)}`}
    >
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 3.5" /></svg>
          </span>
          <span className="title-label">Onde está indo — {nomeMes}/{ano}</span>
        </p>
      </div>

      {categorias.length === 0 ? (
        <div className="mc-card" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink-dim)" }}>
            Total gasto em {nomeMes.toLowerCase()}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 800, color: "var(--ink)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtValor(totalGeral)}
          </p>
        </div>
      ) : (
        <div className="mc-card" style={{ marginBottom: 16 }}>
          <GastosDonut categorias={categorias} totalFmt={fmtValor(totalGeral)} />
          <div className="gastos-legenda">
            {categorias.map((c) => (
              <span key={c.nome} className="gastos-legenda-item">
                <span className="gastos-legenda-dot" style={{ background: `var(--${c.cor})` }} />
                {c.nome} · {c.percentual}%
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mc-card">
        {categorias.length === 0 ? (
          <p className="mc-empty">Nenhum gasto registrado em {nomeMes.toLowerCase()}.</p>
        ) : (
          <AnimarAoAparecer>
            {categorias.map((c, indice) => {
              return (
                <CategoriaAccordion key={c.nome} nome={c.nome} valorFmt={fmtNumero(c.total)} percentual={c.percentual} cor={c.cor} indice={indice}>
                  <div className="mc-list">
                    {c.itens.map((item) => (
                      <div key={item.id} className="mc-list-row">
                        <div className="mc-list-body">
                          <div className="mc-list-desc">{item.descricao}</div>
                          <div className="mc-list-meta">
                            {item.cartao ? `Cartão ${item.cartao.nome}` : "Sem cartão"}
                          </div>
                        </div>
                        <div className="mc-list-side">
                          <ValorLista valor={item.valor} sinal="-" />
                          <div className="mc-list-sub">{fmtData(item.data)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CategoriaAccordion>
              );
            })}
          </AnimarAoAparecer>
        )}
      </div>
    </MesSwipe>
  );
}
