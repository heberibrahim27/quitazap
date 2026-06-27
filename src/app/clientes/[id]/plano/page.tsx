import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CopiarTextoButton } from "@/components/CopiarTextoButton";
import { AbrirWhatsAppButton } from "@/components/AbrirWhatsAppButton";
import { gerarCenarios, gerarPlanoWhatsApp, parcelasVencidas, parcelasProximas, totalParcelas, formatarMoeda, formatarData } from "@/lib/calculos";

export default async function PlanoWhatsAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      dividas: {
        include: {
          parcelas: { orderBy: { vencimento: "asc" } },
          pagamentos: true,
        },
        orderBy: [{ prioridade: "desc" }, { criadoEm: "desc" }],
      },
      pagamentos: true,
      planosEnviados: { orderBy: { criadoEm: "desc" }, take: 1 },
    },
  });

  if (!cliente) notFound();

  async function salvarPlanoEnviado(fd: FormData) {
    "use server";
    const texto = String(fd.get("texto") || "");
    if (!texto) return;
    await prisma.planoEnviado.create({ data: { clienteId: id, texto } });
    redirect(`/clientes/${id}/plano`);
  }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const em30 = new Date(hoje); em30.setDate(em30.getDate() + 30);

  const totalDividas = cliente.dividas.reduce((t, d) => t + Number(d.valorTotal), 0);
  const totalPago    = cliente.pagamentos.reduce((t, p) => t + Number(p.valor), 0);
  const saldoAberto  = Math.max(0, totalDividas - totalPago);

  const todasParcelas = cliente.dividas.flatMap((d) =>
    d.parcelas.map((p) => ({ ...p, valor: Number(p.valor), vencimento: new Date(p.vencimento), divida: { credor: d.credor } }))
  );

  const vencidas  = parcelasVencidas(todasParcelas);
  const prox7     = parcelasProximas(todasParcelas, 7);
  const prox30    = parcelasProximas(todasParcelas, 30);
  const totalP30  = totalParcelas(prox30);

  const cenarios = gerarCenarios(saldoAberto, {
    rendaMensal:           cliente.rendaMensal ? Number(cliente.rendaMensal) : null,
    despesasFixas:         cliente.despesasFixas ? Number(cliente.despesasFixas) : null,
    valorDisponivelMensal: cliente.valorDisponivelMensal ? Number(cliente.valorDisponivelMensal) : null,
  }, totalP30);

  const dividasCalculo = cliente.dividas.map((d) => ({
    id: d.id, credor: d.credor,
    valorTotal: Number(d.valorTotal), valorPago: Number(d.valorPago),
    status: d.status, prioridade: d.prioridade,
  }));

  const textoWhatsApp = gerarPlanoWhatsApp({
    nomeCliente: cliente.nome,
    dividas: dividasCalculo,
    parcelas: todasParcelas,
    cenarios,
  });

  const totalPlanosEnviados = await prisma.planoEnviado.count({ where: { clienteId: id } });
  const ultimoEnvio = cliente.planosEnviados[0];

  return (
    <main className="page-shell">
      <section className="page-container">

        {/* Cabeçalho */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Plano WhatsApp</h1>
            <p className="page-subtitle">Cliente: {cliente.nome}</p>
            {ultimoEnvio && (
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>
                Último envio: {formatarData(ultimoEnvio.criadoEm)} · {totalPlanosEnviados} plano(s) no histórico
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href={`/clientes/${id}/historico-planos`} className="btn-secondary">
              Histórico ({totalPlanosEnviados})
            </Link>
            <Link href={`/clientes/${id}`} className="btn-secondary">Voltar</Link>
          </div>
        </div>

        {/* ── 3 Cenários ── */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18, color: "#0f172a" }}>📊 Cenários de quitação</h2>
          {!cliente.rendaMensal && !cliente.valorDisponivelMensal && (
            <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#854d0e" }}>
              💡 <strong>Dica:</strong> Cadastre a renda mensal e o valor disponível do cliente para cenários mais precisos.{" "}
              <Link href={`/clientes/${id}/editar`} style={{ color: "#92400e", fontWeight: 700 }}>Editar cliente →</Link>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {cenarios.map((c) => (
              <div key={c.nome} style={{
                background: "#ffffff", border: `2px solid ${c.cor}20`,
                borderRadius: 16, padding: 20,
                boxShadow: `0 4px 16px ${c.cor}10`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{
                    background: `${c.cor}15`, color: c.cor,
                    padding: "3px 10px", borderRadius: 8, fontSize: 13, fontWeight: 800,
                  }}>
                    {c.nome}
                  </span>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{c.descricao}</p>
                <div style={{ display: "grid", gap: 6 }}>
                  <div>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>Por mês</span>
                    <strong style={{ display: "block", fontSize: 20, color: c.cor }}>{formatarMoeda(c.valorMensal)}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>Por semana</span>
                    <strong style={{ display: "block", fontSize: 15, color: "#0f172a" }}>{formatarMoeda(c.valorSemanal)}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>Previsão de quitação</span>
                    <strong style={{ display: "block", fontSize: 14, color: "#0f172a" }}>
                      {c.dataQuitacao ? formatarData(c.dataQuitacao) : "—"}
                      {c.mesesParaQuitacao > 0 && (
                        <span style={{ fontWeight: 400, color: "#64748b", fontSize: 12 }}>
                          {" "}({c.mesesParaQuitacao} {c.mesesParaQuitacao === 1 ? "mês" : "meses"})
                        </span>
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Resumo rápido ── */}
        <div className="finance-grid" style={{ marginBottom: 24 }}>
          <div className="finance-card">
            <p className="finance-label">Saldo em aberto</p>
            <strong className="finance-value">{formatarMoeda(saldoAberto)}</strong>
          </div>
          <div className="finance-card">
            <p className="finance-label">Parcelas vencidas</p>
            <strong className="finance-value" style={{ color: vencidas.length > 0 ? "#dc2626" : undefined }}>
              {vencidas.length}
              {vencidas.length > 0 && <span style={{ fontSize: 14, marginLeft: 6 }}>({formatarMoeda(totalParcelas(vencidas))})</span>}
            </strong>
          </div>
          <div className="finance-card">
            <p className="finance-label">Vencem em 7 dias</p>
            <strong className="finance-value">{prox7.length}
              {prox7.length > 0 && <span style={{ fontSize: 14, marginLeft: 6 }}>({formatarMoeda(totalParcelas(prox7))})</span>}
            </strong>
          </div>
        </div>

        {/* ── Texto WhatsApp ── */}
        <div className="content-card">
          <h2 style={{ margin: "0 0 8px", color: "#0f172a" }}>Texto pronto para enviar</h2>
          <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 14 }}>
            Copie e cole no WhatsApp. Depois clique em <strong>Marcar como enviado</strong> para registrar no histórico.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <CopiarTextoButton texto={textoWhatsApp} />
            <AbrirWhatsAppButton telefone={cliente.telefone} texto={textoWhatsApp} />
          </div>

          <textarea
            readOnly
            value={textoWhatsApp}
            style={{
              width: "100%", minHeight: 380, border: "1px solid #cbd5e1",
              borderRadius: 14, padding: 16, fontSize: 14, lineHeight: 1.6,
              color: "#0f172a", background: "#f8fafc", resize: "vertical", boxSizing: "border-box",
            }}
          />

          <form action={salvarPlanoEnviado} style={{ marginTop: 16 }}>
            <input type="hidden" name="texto" value={textoWhatsApp} />
            <button type="submit" style={{
              background: "#0f172a", color: "#ffffff", border: "none",
              padding: "12px 20px", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: "pointer",
            }}>
              ✅ Marcar como enviado e salvar no histórico
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
