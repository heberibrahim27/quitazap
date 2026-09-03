import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { ValorLista } from "../../ValorLista";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const ROTULO_TIPO: Record<string, string> = {
  CARTAO: "Cartão",
  EMPRESTIMO: "Empréstimo",
  BOLETO: "Boleto",
  ACORDO: "Acordo",
  OUTRO: "Outro",
};

const ROTULO_STATUS_PARCELA: Record<string, string> = {
  PENDENTE: "Pendente",
  PAGA: "Paga",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
};

export default async function DetalheDividaPage({ params }: { params: Promise<{ id: string }> }) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { id } = await params;
  const divida = await prisma.divida.findUnique({
    where: { id },
    include: { parcelas: { orderBy: { numero: "asc" } } },
  });
  if (!divida || divida.clienteId !== cliente.id) notFound();

  const saldoDevedor = divida.valorTotal - divida.valorPago;

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <Link href="/minha-conta/dividas" style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>
          ‹ Dívidas
        </Link>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "8px 0 0" }}>{divida.credor}</h1>
        <p style={{ color: "var(--ink-dim)", marginTop: 4 }}>
          {ROTULO_TIPO[divida.tipo] ?? divida.tipo}
          {divida.emAtraso && (
            <span style={{ color: "var(--red)", fontWeight: 700 }}>
              {" "}· {divida.diasAtraso != null ? `${divida.diasAtraso} dias em atraso` : "em atraso"}
            </span>
          )}
        </p>
      </div>

      <div className="mc-card" style={{ marginBottom: 16, display: "flex", gap: 24 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Saldo devedor</p>
          <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: "var(--red)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtValor(saldoDevedor)}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Total da dívida</p>
          <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: "var(--ink)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtValor(divida.valorTotal)}
          </p>
        </div>
      </div>

      <div className="card-head">
        <p className="card-title" style={{ fontSize: 14 }}>
          <span className="title-label">Parcelas</span>
        </p>
      </div>
      <div className="mc-card">
        {divida.parcelas.length === 0 ? (
          <p className="mc-empty">Essa dívida não tem parcelas cadastradas.</p>
        ) : (
          <div className="mc-list">
            {divida.parcelas.map((p) => (
              <div key={p.id} className="mc-list-row">
                <div className="mc-list-body">
                  <div className="mc-list-desc">Parcela {p.numero}</div>
                  <div className="mc-list-meta">Vence {fmtData(p.vencimento)}</div>
                </div>
                <div className="mc-list-side">
                  <ValorLista valor={p.valor} />
                  <div
                    className="mc-list-sub"
                    style={{
                      color:
                        p.status === "PAGA" ? "var(--green)" : p.status === "VENCIDA" ? "var(--red)" : "var(--ink-faint)",
                      fontWeight: 700,
                    }}
                  >
                    {ROTULO_STATUS_PARCELA[p.status] ?? p.status}
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
