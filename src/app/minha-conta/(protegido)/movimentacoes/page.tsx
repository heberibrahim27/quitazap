import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { listarMovimentacoes } from "@/lib/movimentacoes-service";

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

export default async function MovimentacoesPage({
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

  const { inicio, fim } = limitesDoMes(ano, mes);
  const mesAnterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const mesSeguinte = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  const nomeMes = NOMES_MES[mes - 1];

  const movimentacoes = await listarMovimentacoes({ clienteId: cliente.id, inicio, fim });
  const entradas = movimentacoes.filter((m) => m.sinal === "entrada").reduce((s, m) => s + m.valor, 0);
  const saidas = movimentacoes.filter((m) => m.sinal === "saida").reduce((s, m) => s + m.valor, 0);

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
          </span>
          <span className="title-label">Movimentações — {nomeMes}/{ano}</span>
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href={`/minha-conta/movimentacoes?mes=${paramMes(mesAnterior.ano, mesAnterior.mes)}`} className="card-link" aria-label="Mês anterior">‹</Link>
          <Link href={`/minha-conta/movimentacoes?mes=${paramMes(mesSeguinte.ano, mesSeguinte.mes)}`} className="card-link" aria-label="Próximo mês">›</Link>
        </div>
      </div>

      <div className="mc-card" style={{ marginBottom: 16, display: "flex", gap: 24 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Entradas</p>
          <p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 800, color: "var(--green)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtValor(entradas)}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Saídas</p>
          <p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 800, color: "var(--ink)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtValor(saidas)}
          </p>
        </div>
      </div>

      <div className="mc-card">
        {movimentacoes.length === 0 ? (
          <p className="mc-empty">Nenhuma movimentação em {nomeMes.toLowerCase()}.</p>
        ) : (
          <div className="mc-list">
            {movimentacoes.map((m) => (
              <div key={m.id} className="mc-list-row">
                <div
                  className="mc-list-icon"
                  style={{
                    background: m.sinal === "entrada" ? "var(--green-soft)" : "rgba(30,99,233,0.08)",
                    color: m.sinal === "entrada" ? "var(--green)" : "var(--ink-dim)",
                  }}
                >
                  {m.sinal === "entrada" ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12l7 7 7-7" /></svg>
                  )}
                </div>
                <div className="mc-list-body">
                  <div className="mc-list-desc">{m.descricao}</div>
                  <div className="mc-list-meta">{m.meta}</div>
                </div>
                <div className="mc-list-side">
                  <div className={`mc-list-value ${m.sinal === "entrada" ? "mc-list-value-pos" : ""}`}>
                    {m.sinal === "entrada" ? "+" : "-"}{fmtValor(m.valor)}
                  </div>
                  <div className="mc-list-sub">
                    {fmtData(m.data)}
                    {m.editarUrl && <> · <Link href={m.editarUrl}>editar</Link></>}
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
