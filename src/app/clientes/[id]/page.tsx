import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ExcluirForm } from "@/components/ExcluirForm";
import { AlertaBanner } from "@/components/AlertaBanner";

function fmt(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}
function fmtData(data: Date | null) {
  if (!data) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(data));
}

const STATUS_ATEND: Record<string, { label: string; bg: string; color: string }> = {
  NOVO:                    { label: "🆕 Novo",                   bg: "#dbeafe", color: "#1e40af" },
  AGUARDANDO_INFORMACOES:  { label: "⏳ Aguardando informações", bg: "#fef9c3", color: "#854d0e" },
  PLANO_GERADO:            { label: "📋 Plano gerado",           bg: "#f3e8ff", color: "#6b21a8" },
  ACOMPANHAMENTO:          { label: "🔄 Acompanhamento",         bg: "#dcfce7", color: "#166534" },
  ENCERRADO:               { label: "✅ Encerrado",              bg: "#f1f5f9", color: "#475569" },
};

function BadgeStatus({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    PENDENTE:   { bg: "#fef9c3", color: "#854d0e", label: "Pendente" },
    PAGA:       { bg: "#dcfce7", color: "#166534", label: "Paga" },
    VENCIDA:    { bg: "#fee2e2", color: "#991b1b", label: "Vencida" },
    CANCELADA:  { bg: "#f1f5f9", color: "#475569", label: "Cancelada" },
    ATIVA:      { bg: "#dbeafe", color: "#1e40af", label: "Ativa" },
    QUITADA:    { bg: "#dcfce7", color: "#166534", label: "Quitada" },
    NEGOCIANDO: { bg: "#fef3c7", color: "#92400e", label: "Negociando" },
  };
  const s = map[status] ?? { bg: "#f1f5f9", color: "#475569", label: status };
  return (
    <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

export default async function ClienteDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { id } = await params;
  const { ok } = await searchParams;

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      dividas: {
        include: {
          parcelas: { orderBy: { vencimento: "asc" } },
          pagamentos: true,
        },
        orderBy: { criadoEm: "desc" },
      },
      pagamentos: true,
      _count: { select: { planosEnviados: true } },
    },
  });

  if (!cliente) notFound();

  // ── Server Actions ──────────────────────────────────────
  async function excluirCliente(_fd: FormData) {
    "use server";
    await prisma.cliente.delete({ where: { id } });
    redirect("/clientes");
  }

  async function excluirDivida(fd: FormData) {
    "use server";
    const dividaId = String(fd.get("dividaId") || "");
    if (dividaId) await prisma.divida.delete({ where: { id: dividaId } });
    redirect(`/clientes/${id}?ok=divida_excluida`);
  }

  async function excluirParcela(fd: FormData) {
    "use server";
    const parcelaId = String(fd.get("parcelaId") || "");
    if (parcelaId) await prisma.parcela.delete({ where: { id: parcelaId } });
    redirect(`/clientes/${id}?ok=parcela_excluida`);
  }

  async function resetarCliente(_fd: FormData) {
    "use server";
    // Apaga dívidas (cascade remove parcelas e pagamentos vinculados)
    await prisma.divida.deleteMany({ where: { clienteId: id } });
    // Apaga planos enviados
    await prisma.planoEnviado.deleteMany({ where: { clienteId: id } });
    // Reseta sessão do bot
    await prisma.botSessao.updateMany({
      where: { clienteId: id },
      data: {
        etapa: "COLETANDO_DIVIDAS",
        dividasTemp: "[]",
        renda: null,
      },
    });
    // Reseta cliente
    await prisma.cliente.update({
      where: { id },
      data: { statusAtendimento: "NOVO", rendaMensal: null },
    });
    redirect(`/clientes/${id}?ok=resetado`);
  }

  async function atualizarStatus(fd: FormData) {
    "use server";
    const status = String(fd.get("statusAtendimento") || "NOVO");
    await prisma.cliente.update({ where: { id }, data: { statusAtendimento: status } });
    redirect(`/clientes/${id}?ok=status`);
  }

  async function marcarParcelaPaga(fd: FormData) {
    "use server";
    const parcelaId = String(fd.get("parcelaId") || "");
    const dividaId  = String(fd.get("dividaId") || "");
    const valor     = Number(fd.get("valor") || "0");
    if (!parcelaId) return;

    await prisma.$transaction(async (tx) => {
      await tx.parcela.update({ where: { id: parcelaId }, data: { status: "PAGA" } });
      if (dividaId && valor > 0) {
        const divida = await tx.divida.findUnique({ where: { id: dividaId } });
        const novoTotal = Number(divida?.valorPago ?? 0) + valor;
        const quitada = divida && novoTotal >= Number(divida.valorTotal);
        await tx.divida.update({
          where: { id: dividaId },
          data: {
            valorPago: { increment: valor },
            ...(quitada ? { status: "QUITADA" } : {}),
          },
        });
        await tx.pagamento.create({
          data: { clienteId: id, dividaId, valor, data: new Date(), obs: "Marcado como pago via parcela" },
        });
      }
    });
    redirect(`/clientes/${id}?ok=paga`);
  }
  // ───────────────────────────────────────────────────────

  const totalDividas = cliente.dividas.reduce((t, d) => t + Number(d.valorTotal), 0);
  const totalPago    = cliente.pagamentos.reduce((t, p) => t + Number(p.valor), 0);
  const saldoAberto  = Math.max(0, totalDividas - totalPago);

  const statusInfo = STATUS_ATEND[cliente.statusAtendimento] ?? STATUS_ATEND["NOVO"];

  const mensagemOk: Record<string, string> = {
    editado:        "Cliente atualizado com sucesso!",
    divida:         "Dívida cadastrada com sucesso!",
    divida_excluida: "Dívida excluída.",
    parcela_excluida:"Parcela excluída.",
    pagamento:       "Pagamento registrado com sucesso!",
    status:          "Status de atendimento atualizado!",
    paga:            "Parcela marcada como paga!",
    resetado:        "Conversa reiniciada! Todas as dívidas foram apagadas.",
  };

  return (
    <main className="page-shell">
      <section className="page-container">

        {ok && mensagemOk[ok] && (
          <AlertaBanner tipo={ok.includes("excluida") ? "info" : "sucesso"} mensagem={mensagemOk[ok]} />
        )}

        {/* ── Cabeçalho ── */}
        <div className="page-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <h1 className="page-title" style={{ margin: 0 }}>{cliente.nome}</h1>
              <span style={{
                background: statusInfo.bg, color: statusInfo.color,
                padding: "3px 10px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              }}>
                {statusInfo.label}
              </span>
            </div>
            <p className="page-subtitle">WhatsApp: {cliente.telefone}</p>
            {cliente.obs && <p className="page-subtitle">{cliente.obs}</p>}
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>
              {cliente._count.planosEnviados} plano(s) enviado(s)
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <Link href={`/clientes/${id}/editar`} className="btn-secondary">Editar</Link>
            <ExcluirForm
              action={resetarCliente}
              mensagem={`Reiniciar a conversa de "${cliente.nome}"? Isso apaga todas as dívidas e planos cadastrados, mas mantém o cadastro do cliente.`}
              label="🔄 Reiniciar"
            />
            <ExcluirForm
              action={excluirCliente}
              mensagem={`Excluir o cliente "${cliente.nome}" e todas as suas dívidas? Esta ação não pode ser desfeita.`}
              label="Excluir"
            />
            <Link href="/clientes" className="btn-secondary">Voltar</Link>
          </div>
        </div>

        {/* ── Status de atendimento (rápido) ── */}
        <form action={atualizarStatus} style={{
          background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14,
          padding: "14px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#64748b", whiteSpace: "nowrap" }}>Status do atendimento:</span>
          <select name="statusAtendimento" defaultValue={cliente.statusAtendimento} style={{
            border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px",
            fontSize: 14, color: "#0f172a", background: "#f8fafc", flex: 1, minWidth: 200,
          }}>
            <option value="NOVO">🆕 Novo</option>
            <option value="AGUARDANDO_INFORMACOES">⏳ Aguardando informações</option>
            <option value="PLANO_GERADO">📋 Plano gerado</option>
            <option value="ACOMPANHAMENTO">🔄 Acompanhamento</option>
            <option value="ENCERRADO">✅ Encerrado</option>
          </select>
          <button type="submit" style={{
            background: "#0f172a", color: "#fff", border: "none",
            padding: "8px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            Salvar
          </button>
        </form>

        {/* ── Contexto financeiro ── */}
        {(cliente.rendaMensal || cliente.valorDisponivelMensal) && (
          <div style={{
            background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 14,
            padding: "14px 16px", marginBottom: 20,
            display: "flex", gap: 20, flexWrap: "wrap",
          }}>
            {cliente.rendaMensal && (
              <div>
                <span style={{ fontSize: 12, color: "#166534" }}>Renda mensal</span>
                <strong style={{ display: "block", color: "#14532d" }}>{fmt(Number(cliente.rendaMensal))}</strong>
              </div>
            )}
            {cliente.despesasFixas && (
              <div>
                <span style={{ fontSize: 12, color: "#166534" }}>Despesas fixas</span>
                <strong style={{ display: "block", color: "#14532d" }}>{fmt(Number(cliente.despesasFixas))}</strong>
              </div>
            )}
            {cliente.valorDisponivelMensal && (
              <div>
                <span style={{ fontSize: 12, color: "#166534" }}>Disponível/mês para dívidas</span>
                <strong style={{ display: "block", color: "#14532d" }}>{fmt(Number(cliente.valorDisponivelMensal))}</strong>
              </div>
            )}
          </div>
        )}

        {/* ── Totais ── */}
        <div className="finance-grid">
          <div className="finance-card">
            <p className="finance-label">Total em dívidas</p>
            <strong className="finance-value">{fmt(totalDividas)}</strong>
          </div>
          <div className="finance-card">
            <p className="finance-label">Total pago</p>
            <strong className="finance-value">{fmt(totalPago)}</strong>
          </div>
          <div className="finance-card">
            <p className="finance-label">Saldo em aberto</p>
            <strong className="finance-value finance-value-green">{fmt(saldoAberto)}</strong>
          </div>
        </div>

        {/* ── Ações ── */}
        <div className="action-row">
          <Link href={`/clientes/${id}/divida/nova`} className="btn-primary">Nova dívida</Link>
          <Link href={`/clientes/${id}/pagamento/novo`} className="btn-secondary">Registrar pagamento</Link>
          <Link href={`/clientes/${id}/pagamentos`} className="btn-secondary">Ver pagamentos</Link>
          <Link href={`/clientes/${id}/plano`} className="btn-dark">Plano WhatsApp</Link>
        </div>

        {/* ── Dívidas ── */}
        <div className="content-card">
          <h2 style={{ margin: "0 0 16px", color: "#0f172a" }}>Dívidas cadastradas</h2>

          {cliente.dividas.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>Nenhuma dívida cadastrada ainda.</p>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {cliente.dividas.map((divida) => {
                const saldoD = Math.max(0, Number(divida.valorTotal) - Number(divida.valorPago));
                return (
                  <div key={divida.id} className="debt-card">

                    {/* Cabeçalho da dívida */}
                    <div className="debt-header">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <strong style={{ color: "#0f172a" }}>{divida.credor}</strong>
                          <BadgeStatus status={divida.status} />
                          <span style={{ fontSize: 12, color: "#94a3b8", background: "#f1f5f9", padding: "2px 7px", borderRadius: 6 }}>
                            {divida.tipo}
                          </span>
                          {(divida.prioridade ?? 0) > 0 && (
                            <span style={{ fontSize: 12, background: "#fef3c7", color: "#92400e", padding: "2px 7px", borderRadius: 6, fontWeight: 700 }}>
                              ⚡ P{divida.prioridade}
                            </span>
                          )}
                        </div>
                        {divida.dataReferencia && (
                          <span style={{ display: "block", color: "#64748b", fontSize: 13 }}>
                            Referência: {fmtData(divida.dataReferencia)}
                          </span>
                        )}
                        {divida.descricao && (
                          <span style={{ display: "block", color: "#64748b", fontSize: 13 }}>{divida.descricao}</span>
                        )}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <strong className="debt-value">{fmt(Number(divida.valorTotal))}</strong>
                        {saldoD > 0 && (
                          <span style={{ display: "block", fontSize: 12, color: "#dc2626", marginTop: 2 }}>
                            Saldo: {fmt(saldoD)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações da dívida */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                      <Link
                        href={`/clientes/${id}/divida/${divida.id}/editar`}
                        style={{ fontSize: 13, color: "#16a34a", fontWeight: 600, padding: "4px 10px", border: "1px solid #bbf7d0", borderRadius: 8 }}
                      >
                        Editar
                      </Link>
                      <Link
                        href={`/clientes/${id}/divida/${divida.id}/parcela/nova`}
                        style={{ fontSize: 13, color: "#2563eb", fontWeight: 600, padding: "4px 10px", border: "1px solid #bfdbfe", borderRadius: 8 }}
                      >
                        + Parcela
                      </Link>
                      <Link
                        href={`/clientes/${id}/divida/${divida.id}/parcelar`}
                        style={{ fontSize: 13, color: "#7c3aed", fontWeight: 600, padding: "4px 10px", border: "1px solid #ddd6fe", borderRadius: 8 }}
                      >
                        Parcelar em lote
                      </Link>
                      <ExcluirForm
                        action={excluirDivida}
                        mensagem={`Excluir a dívida "${divida.credor}"? As parcelas e pagamentos vinculados também serão excluídos.`}
                        label="Excluir"
                        tamanho="pequeno"
                        fields={{ dividaId: divida.id }}
                      />
                    </div>

                    {/* Parcelas */}
                    {divida.parcelas.length > 0 ? (
                      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, display: "grid", gap: 6 }}>
                        <strong style={{ color: "#0f172a", fontSize: 14 }}>Parcelas</strong>
                        {divida.parcelas.map((parcela) => (
                          <div key={parcela.id} style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "center", gap: 8, flexWrap: "wrap",
                            fontSize: 14, padding: "6px 0", borderBottom: "1px solid #f8fafc",
                          }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", color: "#475569" }}>
                              Parcela {parcela.numero} · {fmtData(parcela.vencimento)}
                              <BadgeStatus status={parcela.status} />
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <strong style={{ color: "#0f172a" }}>{fmt(Number(parcela.valor))}</strong>
                              {parcela.status === "PENDENTE" && (
                                <form action={marcarParcelaPaga}>
                                  <input type="hidden" name="parcelaId" value={parcela.id} />
                                  <input type="hidden" name="dividaId"  value={divida.id} />
                                  <input type="hidden" name="valor"     value={String(parcela.valor)} />
                                  <button type="submit" style={{
                                    fontSize: 12, color: "#16a34a", fontWeight: 700,
                                    padding: "3px 8px", border: "1px solid #bbf7d0",
                                    borderRadius: 6, background: "#f0fdf4", cursor: "pointer",
                                  }}>
                                    ✓ Paga
                                  </button>
                                </form>
                              )}
                              <Link
                                href={`/clientes/${id}/parcela/${parcela.id}/editar`}
                                style={{ fontSize: 12, color: "#16a34a", fontWeight: 600, padding: "3px 8px", border: "1px solid #bbf7d0", borderRadius: 6 }}
                              >
                                Editar
                              </Link>
                              <ExcluirForm
                                action={excluirParcela}
                                mensagem={`Excluir a parcela ${parcela.numero}?`}
                                label="✕"
                                tamanho="pequeno"
                                fields={{ parcelaId: parcela.id }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: 13 }}>Nenhuma parcela cadastrada.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
