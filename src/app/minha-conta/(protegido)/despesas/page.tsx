import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { NOMES_CATEGORIAS_GASTO } from "@/lib/gasto-flow";
import { verificarOrcamentoEAvisar } from "@/lib/orcamento-service";
import { MesSwipe } from "../MesSwipe";
import { ValorLista } from "../ValorLista";

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
  searchParams: Promise<{ mes?: string | string[]; aba?: string | string[]; erro?: string | string[] }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { mes: mesParamBruto, aba: abaParamBruto, erro: erroBruto } = await searchParams;
  const erro = Array.isArray(erroBruto) ? erroBruto[0] : erroBruto;
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

  const [despesas, cartoes] = await Promise.all([
    prisma.lancamento.findMany({
      where: { clienteId: cliente.id, tipo: { in: tipos }, data: { gte: inicioMes, lt: fimMes } },
      orderBy: { data: "desc" },
    }),
    prisma.cartao.findMany({ where: { clienteId: cliente.id }, orderBy: { nome: "asc" } }),
  ]);
  const total = despesas.reduce((soma, d) => soma + d.valor, 0);

  const sufixoMes = `mes=${paramMes(ano, mes)}`;
  const hojeStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const dataPadrao = hojeStr.slice(0, 7) === paramMes(ano, mes) ? hojeStr : `${paramMes(ano, mes)}-01`;

  async function criarDespesa(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const descricao = String(formData.get("descricao") || "").trim();
    const categoria = String(formData.get("categoria") || "Outros").trim();
    const valorTexto = String(formData.get("valor") || "").replace(",", ".").trim();
    const valor = Number(valorTexto);
    const dataTexto = String(formData.get("data") || "");
    const recorrente = formData.get("recorrente") === "on";
    const tipoSelecionado = String(formData.get("tipo") || "DESPESA_VARIAVEL");
    const cartaoIdTexto = String(formData.get("cartaoId") || "").trim();

    if (!descricao || !Number.isFinite(valor) || valor <= 0) {
      redirect(`/minha-conta/despesas?${sufixoMes}&aba=${aba}&erro=${encodeURIComponent("Descrição e valor (maior que zero) são obrigatórios.")}`);
    }

    let cartaoId: string | null = null;
    if (cartaoIdTexto) {
      const cartao = await prisma.cartao.findUnique({ where: { id: cartaoIdTexto } });
      if (!cartao || cartao.clienteId !== clienteAtual.id) {
        redirect(`/minha-conta/despesas?${sufixoMes}&aba=${aba}&erro=${encodeURIComponent("Cartão inválido.")}`);
      }
      cartaoId = cartaoIdTexto;
    }

    const tipo = cartaoId ? "COMPRA_CARTAO" : tipoSelecionado === "DESPESA_FIXA" ? "DESPESA_FIXA" : "DESPESA_VARIAVEL";
    const dataLancamento = dataTexto ? new Date(`${dataTexto}T12:00:00`) : new Date();

    await prisma.lancamento.create({
      data: {
        clienteId: clienteAtual.id,
        tipo,
        descricao,
        categoria,
        valor,
        data: dataLancamento,
        recorrente,
        cartaoId,
        origem: "WEB",
      },
    });

    await verificarOrcamentoEAvisar(clienteAtual.id, categoria, valor, dataLancamento).catch((err) =>
      console.error("[DESPESAS] Erro ao verificar orçamento:", err)
    );

    revalidatePath("/minha-conta", "layout");
    revalidatePath("/minha-conta/despesas");
    revalidatePath("/minha-conta/plano");
    revalidatePath("/minha-conta/movimentacoes");
    revalidatePath("/minha-conta/gastos");
    if (cartaoId) revalidatePath("/minha-conta/cartoes");
    redirect(`/minha-conta/despesas?${sufixoMes}&aba=${aba}`);
  }

  return (
    <MesSwipe
      hrefAnterior={`/minha-conta/despesas?mes=${paramMes(mesAnterior.ano, mesAnterior.mes)}&aba=${aba}`}
      hrefSeguinte={`/minha-conta/despesas?mes=${paramMes(mesSeguinte.ano, mesSeguinte.mes)}&aba=${aba}`}
    >
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11L12 4l8 7" /><path d="M6 9.5V20a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1V9.5" /></svg>
          </span>
          <span className="title-label">Despesas — {nomeMes}/{ano}</span>
        </p>
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

      {erro && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--red-soft)", border: "1px solid rgba(226,59,92,0.25)" }}>
          <p style={{ margin: 0, color: "var(--red)", fontSize: 13.5, fontWeight: 600 }}>{erro}</p>
        </div>
      )}

      <form action={criarDespesa} className="mc-form-card" style={{ marginBottom: 16 }}>
        <label className="mc-label">
          Descrição *
          <input name="descricao" required placeholder="Ex: Mercado, Aluguel, Uber" className="mc-input" />
        </label>
        <label className="mc-label">
          Categoria
          <select name="categoria" defaultValue="Outros" className="mc-input">
            {NOMES_CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="mc-label">
          Valor *
          <input name="valor" required type="text" inputMode="decimal" placeholder="Ex: 150,00" className="mc-input" />
        </label>
        <label className="mc-label">
          Data
          <input name="data" type="date" defaultValue={dataPadrao} className="mc-input" />
        </label>
        <label className="mc-label">
          Tipo
          <select name="tipo" defaultValue="DESPESA_VARIAVEL" className="mc-input">
            <option value="DESPESA_VARIAVEL">Despesa variável</option>
            <option value="DESPESA_FIXA">Despesa fixa (repete todo mês)</option>
          </select>
        </label>
        {cartoes.length > 0 && (
          <label className="mc-label">
            Cartão (só se for compra no cartão)
            <select name="cartaoId" defaultValue="" className="mc-input">
              <option value="">Nenhum — despesa direto</option>
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </label>
        )}
        <label className="mc-label" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input name="recorrente" type="checkbox" style={{ width: 16, height: 16 }} />
          Recorrente (repete todo mês)
        </label>
        <div>
          <button type="submit" className="mc-btn-primary" style={{ border: "none", width: "100%" }}>
            Adicionar despesa
          </button>
        </div>
      </form>

      <div className="mc-card">
        {despesas.length === 0 ? (
          <p className="mc-empty">Nenhuma despesa registrada em {nomeMes.toLowerCase()}.</p>
        ) : (
          <div className="mc-list">
            {despesas.map((d) => (
              <div key={d.id} className="mc-list-row">
                <div className="mc-list-icon" style={{ background: d.tipo === "DESPESA_FIXA" ? "rgba(30,99,233,0.1)" : "rgba(23,180,216,0.1)", color: d.tipo === "DESPESA_FIXA" ? "var(--blue)" : "var(--cyan)" }}>
                  {d.tipo === "DESPESA_FIXA" ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11L12 4l8 7" /><path d="M6 9.5V20a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1V9.5" /></svg>
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
                  <ValorLista valor={d.valor} sinal="-" />
                  <div className="mc-list-sub">
                    {fmtData(d.data)} · <Link href={`/minha-conta/lancamento/${d.id}/editar`}>editar</Link>
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
