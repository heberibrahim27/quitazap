import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const ROTULO_TIPO_LANCAMENTO: Record<string, string> = {
  RECEITA: "Receita",
  DESPESA_FIXA: "Despesa fixa",
  DESPESA_VARIAVEL: "Despesa variável",
  COMPRA_CARTAO: "Compra no cartão",
};

const ICONE_TIPO_LANCAMENTO: Record<string, string> = {
  RECEITA: "💰",
  DESPESA_FIXA: "📌",
  DESPESA_VARIAVEL: "🛒",
  COMPRA_CARTAO: "💳",
};

// Início/fim do mês corrente em horário de Brasília (fixo UTC-3, sem
// horário de verão desde 2019) — mesma convenção já usada no cron de
// tarefas, pra "mês atual" bater com o calendário que o cliente vê.
function limitesDoMesAtualBrasil(agora: Date) {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(agora)
    .split("-")
    .map(Number);

  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1, 3, 0, 0, 0));
  return { inicio, fim };
}

const cardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, marginBottom: 20,
};
const tituloStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" };

export default async function MinhaContaPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { inicio: inicioMes, fim: fimMes } = limitesDoMesAtualBrasil(new Date());

  const [dividas, pagamentos, tarefasPendentes, lancamentosDoMes, cartoes, ultimosLancamentos] = await Promise.all([
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
    prisma.lancamento.findMany({
      where: { clienteId: cliente.id, data: { gte: inicioMes, lt: fimMes } },
      include: { cartao: { select: { nome: true } } },
    }),
    prisma.cartao.findMany({ where: { clienteId: cliente.id }, orderBy: { nome: "asc" } }),
    prisma.lancamento.findMany({
      where: { clienteId: cliente.id },
      orderBy: { data: "desc" },
      take: 10,
      include: { cartao: { select: { nome: true } } },
    }),
  ]);

  const totalDividas = dividas.reduce((soma, d) => soma + (d.valorTotal - d.valorPago), 0);

  const gastoCartaoMes = new Map<string, number>();
  let totalReceitasMes = 0;
  let totalFixasMes = 0;
  let totalVariaveisMes = 0;
  let totalCartaoMes = 0;
  for (const l of lancamentosDoMes) {
    if (l.tipo === "RECEITA") totalReceitasMes += l.valor;
    else if (l.tipo === "DESPESA_FIXA") totalFixasMes += l.valor;
    else if (l.tipo === "DESPESA_VARIAVEL") totalVariaveisMes += l.valor;
    else if (l.tipo === "COMPRA_CARTAO") {
      totalCartaoMes += l.valor;
      if (l.cartao) gastoCartaoMes.set(l.cartao.nome, (gastoCartaoMes.get(l.cartao.nome) ?? 0) + l.valor);
    }
  }
  // Inclui compras no cartão mesmo com fatura ainda aberta — de propósito
  // diferente do "saldo disponível" que o bot informa no WhatsApp (esse só
  // desconta fatura fechada, pra não travar o saldo antes da fatura vencer).
  // Aqui o objetivo é outro: mostrar tudo que já entrou/saiu no mês, cartão
  // incluído — por isso o rótulo abaixo não usa a palavra "disponível".
  const resultadoMes = totalReceitasMes - totalFixasMes - totalVariaveisMes - totalCartaoMes;

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
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Entradas − saídas do mês</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: resultadoMes >= 0 ? "#16a34a" : "#dc2626", marginTop: 6 }}>
            {fmtValor(resultadoMes)}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>já conta compras no cartão deste mês</div>
        </div>
        <div style={{ ...cardStyle, marginBottom: 0 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Tarefas pendentes</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>{tarefasPendentes.length}</div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={tituloStyle}>📊 Resumo do mês</h2>
        {lancamentosDoMes.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Nenhum gasto ou receita registrado neste mês ainda.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { rotulo: "Receitas", valor: totalReceitasMes, cor: "#16a34a" },
              { rotulo: "Despesas fixas", valor: totalFixasMes, cor: "#0f172a" },
              { rotulo: "Despesas variáveis", valor: totalVariaveisMes, cor: "#0f172a" },
              { rotulo: "Compras no cartão", valor: totalCartaoMes, cor: "#0f172a" },
            ]
              .filter((linha) => linha.valor > 0)
              .map((linha) => (
                <div key={linha.rotulo} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 10 }}>
                  <div style={{ fontSize: 14, color: "#0f172a" }}>{linha.rotulo}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: linha.cor }}>{fmtValor(linha.valor)}</div>
                </div>
              ))}
          </div>
        )}
      </div>

      {cartoes.length > 0 && (
        <div style={cardStyle}>
          <h2 style={tituloStyle}>💳 Cartões</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cartoes.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>{c.nome}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {c.diaFechamento ? `Fecha dia ${c.diaFechamento}` : ""}
                    {c.diaFechamento && c.diaVencimento ? " · " : ""}
                    {c.diaVencimento ? `Vence dia ${c.diaVencimento}` : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>
                  {fmtValor(gastoCartaoMes.get(c.nome) ?? 0)}
                  <span style={{ fontWeight: 400, color: "#94a3b8" }}> este mês</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={cardStyle}>
        <h2 style={tituloStyle}>🧾 Últimos lançamentos</h2>
        {ultimosLancamentos.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Nenhum lançamento registrado ainda.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ultimosLancamentos.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, color: "#0f172a" }}>
                    {ICONE_TIPO_LANCAMENTO[l.tipo] ?? "•"} {l.descricao}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    {ROTULO_TIPO_LANCAMENTO[l.tipo] ?? l.tipo}
                    {l.cartao ? ` · ${l.cartao.nome}` : ""}
                    {l.recorrente ? " · 🔁 recorrente" : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: l.tipo === "RECEITA" ? "#16a34a" : "#0f172a" }}>
                    {l.tipo === "RECEITA" ? "+" : "-"}{fmtValor(l.valor)}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{fmtData(l.data)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
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
