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
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(data));
}

const STATUS_ATEND: Record<string, { label: string; bg: string; color: string }> = {
  NOVO:                    { label: "🆕 Novo",                   bg: "#dbeafe", color: "#1e40af" },
  AGUARDANDO_INFORMACOES:  { label: "⏳ Aguardando informações", bg: "#fef9c3", color: "#854d0e" },
  PLANO_GERADO:            { label: "📋 Plano gerado",           bg: "#f3e8ff", color: "#6b21a8" },
  ACOMPANHAMENTO:          { label: "🔄 Acompanhamento",         bg: "#dcfce7", color: "#166534" },
  ENCERRADO:               { label: "✅ Encerrado",              bg: "#f1f5f9", color: "#475569" },
};

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
      _count:         { select: { planosEnviados: true } },
      planosEnviados: { orderBy: { criadoEm: "desc" }, take: 1 },
    },
  });

  if (!cliente) notFound();

  // ── Server Actions ──────────────────────────────────────
  async function excluirCliente(_fd: FormData) {
    "use server";
    await prisma.cliente.delete({ where: { id } });
    redirect("/clientes");
  }

  async function resetarCliente(_fd: FormData) {
    "use server";
    await prisma.divida.deleteMany({ where: { clienteId: id } });
    await prisma.planoEnviado.deleteMany({ where: { clienteId: id } });
    await prisma.botSessao.updateMany({
      where: { clienteId: id },
      data: { etapa: "COLETANDO_DIVIDAS", dividasTemp: "[]", renda: null },
    });
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
  // ───────────────────────────────────────────────────────

  const statusInfo  = STATUS_ATEND[cliente.statusAtendimento] ?? STATUS_ATEND["NOVO"];
  const planos      = cliente._count.planosEnviados;
  const ultimoPlano = cliente.planosEnviados[0] ?? null;

  // Total pago em assinaturas: meses desde cadastro × R$47 (só para clientes pagantes)
  const PRECO_MENSAL = 47;
  const mesesAtivo   = Math.max(1, Math.floor(
    (Date.now() - new Date(cliente.criadoEm).getTime()) / (1000 * 60 * 60 * 24 * 30)
  ));
  const totalAssinaturas = (cliente as { gratuito?: boolean }).gratuito ? 0 : mesesAtivo * PRECO_MENSAL;

  const mensagemOk: Record<string, string> = {
    editado:  "Cliente atualizado com sucesso!",
    status:   "Status de atendimento atualizado!",
    resetado: "Conversa reiniciada! Histórico apagado.",
  };

  return (
    <main className="page-shell">
      <section className="page-container">

        {ok && mensagemOk[ok] && (
          <AlertaBanner tipo={ok === "resetado" ? "info" : "sucesso"} mensagem={mensagemOk[ok]} />
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
            <p className="page-subtitle" style={{ marginBottom: 2 }}>📱 {cliente.telefone}</p>
            {cliente.email && (
              <p className="page-subtitle" style={{ marginBottom: 2 }}>✉️ {cliente.email}</p>
            )}
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>
              {planos > 0
                ? `📋 ${planos} plano${planos !== 1 ? "s" : ""} enviado${planos !== 1 ? "s" : ""}`
                : "Nenhum plano enviado ainda"}
              {" · "}desde {fmtData(cliente.criadoEm)}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <Link href={`/clientes/${id}/editar`} className="btn-secondary">Editar</Link>
            <ExcluirForm
              action={resetarCliente}
              mensagem={`Reiniciar a conversa de "${cliente.nome}"? Isso apaga todas as dívidas e planos, mas mantém o cadastro.`}
              label="🔄 Reiniciar"
            />
            <ExcluirForm
              action={excluirCliente}
              mensagem={`Excluir o cliente "${cliente.nome}"? Esta ação não pode ser desfeita.`}
              label="Excluir"
            />
            <Link href="/clientes" className="btn-secondary">Voltar</Link>
          </div>
        </div>

        {/* ── Status de atendimento ── */}
        <form action={atualizarStatus} style={{
          background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14,
          padding: "14px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#64748b", whiteSpace: "nowrap" }}>
            Status do atendimento:
          </span>
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

        {/* ── Dados do cliente ── */}
        <div style={{
          background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14,
          padding: "20px", marginBottom: 20,
        }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#0f172a" }}>Dados do cliente</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>

            <div>
              <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>Nome completo</span>
              <strong style={{ fontSize: 14, color: "#0f172a" }}>{cliente.nome}</strong>
            </div>

            <div>
              <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>WhatsApp</span>
              <strong style={{ fontSize: 14, color: "#0f172a" }}>{cliente.telefone}</strong>
            </div>

            {cliente.email && (
              <div>
                <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>E-mail</span>
                <strong style={{ fontSize: 14, color: "#0f172a" }}>{cliente.email}</strong>
              </div>
            )}

            {cliente.cpf && (
              <div>
                <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>CPF</span>
                <strong style={{ fontSize: 14, color: "#0f172a" }}>{cliente.cpf}</strong>
              </div>
            )}

            {cliente.rendaMensal && (
              <div>
                <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>Renda mensal</span>
                <strong style={{ fontSize: 14, color: "#166534" }}>{fmt(Number(cliente.rendaMensal))}</strong>
              </div>
            )}

            {cliente.despesasFixas && (
              <div>
                <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>Despesas fixas</span>
                <strong style={{ fontSize: 14, color: "#0f172a" }}>{fmt(Number(cliente.despesasFixas))}</strong>
              </div>
            )}

            {cliente.valorDisponivelMensal && (
              <div>
                <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>Disponível/mês</span>
                <strong style={{ fontSize: 14, color: "#2563eb" }}>{fmt(Number(cliente.valorDisponivelMensal))}</strong>
              </div>
            )}

            <div>
              <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>Cliente desde</span>
              <strong style={{ fontSize: 14, color: "#0f172a" }}>{fmtData(cliente.criadoEm)}</strong>
            </div>

            <div>
              <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>Meses ativo</span>
              <strong style={{ fontSize: 14, color: "#0f172a" }}>{mesesAtivo} mês{mesesAtivo !== 1 ? "es" : ""}</strong>
            </div>

            <div>
              <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>Total em assinaturas</span>
              {(cliente as { gratuito?: boolean }).gratuito ? (
                <strong style={{ fontSize: 14, color: "#2563eb" }}>🎁 Gratuito</strong>
              ) : (
                <strong style={{ fontSize: 14, color: "#7c3aed" }}>{fmt(totalAssinaturas)}</strong>
              )}
            </div>

            {!(cliente as { gratuito?: boolean }).gratuito && (
              <div>
                <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>Assinatura vence em</span>
                {(cliente as { assinaturaVenceEm?: Date | null }).assinaturaVenceEm ? (() => {
                  const vence = new Date((cliente as { assinaturaVenceEm: Date }).assinaturaVenceEm);
                  const hoje = new Date();
                  const diasRestantes = Math.ceil((vence.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                  const vencido = diasRestantes < 0;
                  const urgente = diasRestantes <= 5 && diasRestantes >= 0;
                  return (
                    <strong style={{ fontSize: 14, color: vencido ? "#dc2626" : urgente ? "#d97706" : "#166534" }}>
                      {vencido ? "⚠️ Vencida" : urgente ? "⏳" : "✅"} {fmtData(vence)}
                      {!vencido && <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>({diasRestantes}d)</span>}
                    </strong>
                  );
                })() : (
                  <strong style={{ fontSize: 14, color: "#94a3b8" }}>Não definida</strong>
                )}
              </div>
            )}

            {cliente.obs && (
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 2 }}>Observações</span>
                <span style={{ fontSize: 14, color: "#475569" }}>{cliente.obs}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Botão Plano WhatsApp ── */}
        <div style={{ marginBottom: 20 }}>
          <Link href={`/clientes/${id}/plano`} className="btn-dark">
            📲 Ver / Enviar Plano WhatsApp
          </Link>
        </div>

        {/* ── Último plano enviado ── */}
        {ultimoPlano && (
          <div style={{
            background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14,
            padding: "20px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>Último plano enviado</h2>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>{fmtData(ultimoPlano.criadoEm)}</span>
            </div>
            <pre style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              fontSize: 13,
              color: "#475569",
              lineHeight: 1.6,
              background: "#f8fafc",
              borderRadius: 10,
              padding: "14px 16px",
              maxHeight: 320,
              overflowY: "auto",
            }}>
              {ultimoPlano.texto}
            </pre>
          </div>
        )}

      </section>
    </main>
  );
}
