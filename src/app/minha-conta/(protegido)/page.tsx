import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const cardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, marginBottom: 20,
};
const tituloStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" };

export default async function MinhaContaPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const [dividas, pagamentos, tarefasPendentes] = await Promise.all([
    prisma.divida.findMany({
      where: { clienteId: cliente.id, status: "ATIVA" },
      orderBy: [{ prioridade: "desc" }, { criadoEm: "asc" }],
    }),
    prisma.pagamento.findMany({
      where: { clienteId: cliente.id },
      orderBy: { data: "desc" },
      take: 10,
      include: { divida: { select: { credor: true } } },
    }),
    prisma.tarefa.findMany({
      where: { clienteId: cliente.id, status: "PENDENTE" },
      orderBy: [{ vencimento: "asc" }, { criadoEm: "asc" }],
    }),
  ]);

  const totalDividas = dividas.reduce((soma, d) => soma + (d.valorTotal - d.valorPago), 0);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
        Olá, {cliente.nome.split(" ")[0]}! 👋
      </h1>
      <p style={{ color: "#64748b", marginBottom: 24 }}>Aqui está o resumo do que você registrou pelo WhatsApp.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div style={{ ...cardStyle, marginBottom: 0 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Renda mensal</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>
            {cliente.rendaMensal != null ? fmtValor(cliente.rendaMensal) : "—"}
          </div>
        </div>
        <div style={{ ...cardStyle, marginBottom: 0 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Saldo devedor total</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#dc2626", marginTop: 6 }}>{fmtValor(totalDividas)}</div>
        </div>
        <div style={{ ...cardStyle, marginBottom: 0 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Tarefas pendentes</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>{tarefasPendentes.length}</div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={tituloStyle}>💳 Dívidas e empréstimos</h2>
        {dividas.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Nenhuma dívida ativa registrada.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dividas.map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>{d.credor}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {d.tipo}
                    {d.totalParcelas ? ` · ${d.totalParcelas}x` : ""}
                    {d.diaVencimento ? ` · vence dia ${d.diaVencimento}` : ""}
                    {d.emAtraso ? " · ⚠️ em atraso" : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>{fmtValor(d.valorTotal - d.valorPago)}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>de {fmtValor(d.valorTotal)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h2 style={tituloStyle}>🔔 Tarefas e lembretes</h2>
        {tarefasPendentes.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Nenhuma tarefa pendente.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tarefasPendentes.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 10 }}>
                <div style={{ fontSize: 14, color: "#0f172a" }}>
                  {t.descricao} {t.recorrente ? "🔁" : ""}
                </div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {t.valor != null ? fmtValor(t.valor) : ""} {t.vencimento ? fmtData(t.vencimento) : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h2 style={tituloStyle}>✅ Últimos pagamentos</h2>
        {pagamentos.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Nenhum pagamento registrado ainda.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pagamentos.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 10 }}>
                <div style={{ fontSize: 14, color: "#0f172a" }}>{p.divida.credor}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {fmtValor(p.valor)} · {fmtData(p.data)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
