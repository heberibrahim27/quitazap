import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ExcluirForm } from "@/components/ExcluirForm";
import { AlertaBanner } from "@/components/AlertaBanner";
import { IconAlertTriangle, IconCheckCircle, IconClock } from "@/components/icons";
import { PRECO_MENSAL } from "@/lib/financeiro-admin/motor";

function fmt(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}
function fmtData(data: Date | null) {
  if (!data) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(data));
}

const STATUS_ATEND: Record<string, { label: string; bg: string; color: string; border: string }> = {
  NOVO:                    { label: "Novo",                   bg: "rgba(0,123,255,0.12)",   color: "#7dc4ff", border: "rgba(0,123,255,0.3)" },
  AGUARDANDO_INFORMACOES:  { label: "Aguardando informações", bg: "rgba(245,158,11,0.12)",  color: "#fcd34d", border: "rgba(245,158,11,0.25)" },
  PLANO_GERADO:            { label: "Plano gerado",           bg: "rgba(167,139,250,0.12)", color: "#c4b5fd", border: "rgba(167,139,250,0.3)" },
  ACOMPANHAMENTO:          { label: "Acompanhamento",         bg: "rgba(16,185,129,0.12)",  color: "#6ee7b7", border: "rgba(16,185,129,0.25)" },
  ENCERRADO:               { label: "Encerrado",              bg: "rgba(255,255,255,0.06)", color: "#9ca3af", border: "rgba(255,255,255,0.12)" },
};

const estiloExcluir: React.CSSProperties = {
  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5",
  padding: "11px 18px", borderRadius: 12, fontWeight: 600, fontSize: 13.5,
};
const estiloResetar: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#e5e7eb",
  padding: "11px 18px", borderRadius: 12, fontWeight: 600, fontSize: 13.5,
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

  // ───────────────────────────────────────────────────────

  const statusInfo  = STATUS_ATEND[cliente.statusAtendimento] ?? STATUS_ATEND["NOVO"];
  const planos      = cliente._count.planosEnviados;
  const ultimoPlano = cliente.planosEnviados[0] ?? null;

  // Total pago em assinaturas: meses desde cadastro × preço vigente (só para clientes pagantes)
  const mesesAtivo   = Math.max(1, Math.floor(
    (Date.now() - new Date(cliente.criadoEm).getTime()) / (1000 * 60 * 60 * 24 * 30)
  ));
  const totalAssinaturas = (cliente as { gratuito?: boolean }).gratuito ? 0 : mesesAtivo * PRECO_MENSAL;

  const mensagemOk: Record<string, string> = {
    editado:  "Cliente atualizado com sucesso!",
    resetado: "Conversa reiniciada! Histórico apagado.",
  };

  return (
    <div>
      {ok && mensagemOk[ok] && (
        <AlertaBanner tipo={ok === "resetado" ? "info" : "sucesso"} mensagem={mensagemOk[ok]} />
      )}

      {/* ── Cabeçalho ── */}
      <div className="qa-page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <h1 className="qa-page-title" style={{ margin: 0 }}>{cliente.nome}</h1>
            <span className="qa-badge" style={{ background: statusInfo.bg, color: statusInfo.color, border: `1px solid ${statusInfo.border}` }}>
              {statusInfo.label}
            </span>
          </div>
          <p className="qa-page-subtitle" style={{ marginBottom: 2 }}>{cliente.telefone}</p>
          {cliente.email && (
            <p className="qa-page-subtitle" style={{ marginBottom: 2 }}>{cliente.email}</p>
          )}
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--qa-gray-500)" }}>
            {planos > 0
              ? `${planos} plano${planos !== 1 ? "s" : ""} enviado${planos !== 1 ? "s" : ""}`
              : "Nenhum plano enviado ainda"}
            {" · "}desde {fmtData(cliente.criadoEm)}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Link href={`/clientes/${id}/editar`} className="qa-btn-secondary">Editar</Link>
          <ExcluirForm
            action={resetarCliente}
            mensagem={`Reiniciar a conversa de "${cliente.nome}"? Isso apaga todas as dívidas e planos, mas mantém o cadastro.`}
            label="Reiniciar"
            estiloBotao={estiloResetar}
          />
          <ExcluirForm
            action={excluirCliente}
            mensagem={`Excluir o cliente "${cliente.nome}"? Esta ação não pode ser desfeita.`}
            label="Excluir"
            estiloBotao={estiloExcluir}
          />
          <Link href="/clientes" className="qa-btn-secondary">Voltar</Link>
        </div>
      </div>

      {/* ── Dados do cliente ── */}
      <div className="qa-card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Dados do cliente</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 18 }}>

          <div>
            <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Nome completo</span>
            <strong style={{ fontSize: 14 }}>{cliente.nome}</strong>
          </div>

          <div>
            <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>WhatsApp</span>
            <strong style={{ fontSize: 14 }}>{cliente.telefone}</strong>
          </div>

          {cliente.email && (
            <div>
              <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>E-mail</span>
              <strong style={{ fontSize: 14 }}>{cliente.email}</strong>
            </div>
          )}

          {cliente.cpf && (
            <div>
              <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>CPF</span>
              <strong style={{ fontSize: 14 }}>{cliente.cpf}</strong>
            </div>
          )}

          {cliente.rendaMensal && (
            <div>
              <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Renda mensal</span>
              <strong style={{ fontSize: 14, color: "#6ee7b7" }}>{fmt(Number(cliente.rendaMensal))}</strong>
            </div>
          )}

          {cliente.despesasFixas && (
            <div>
              <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Despesas fixas</span>
              <strong style={{ fontSize: 14 }}>{fmt(Number(cliente.despesasFixas))}</strong>
            </div>
          )}

          {cliente.valorDisponivelMensal && (
            <div>
              <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Disponível/mês</span>
              <strong style={{ fontSize: 14, color: "#7dc4ff" }}>{fmt(Number(cliente.valorDisponivelMensal))}</strong>
            </div>
          )}

          <div>
            <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Cliente desde</span>
            <strong style={{ fontSize: 14 }}>{fmtData(cliente.criadoEm)}</strong>
          </div>

          <div>
            <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Meses ativo</span>
            <strong style={{ fontSize: 14 }}>{mesesAtivo} mês{mesesAtivo !== 1 ? "es" : ""}</strong>
          </div>

          <div>
            <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Total em assinaturas</span>
            {(cliente as { gratuito?: boolean }).gratuito ? (
              <strong style={{ fontSize: 14, color: "#7dc4ff" }}>Gratuito</strong>
            ) : (
              <strong style={{ fontSize: 14, color: "#c4b5fd" }}>{fmt(totalAssinaturas)}</strong>
            )}
          </div>

          {!(cliente as { gratuito?: boolean }).gratuito && (
            <div>
              <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Assinatura vence em</span>
              {(cliente as { assinaturaVenceEm?: Date | null }).assinaturaVenceEm ? (() => {
                const vence = new Date((cliente as { assinaturaVenceEm: Date }).assinaturaVenceEm);
                const hoje = new Date();
                const diasRestantes = Math.ceil((vence.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                const vencido = diasRestantes < 0;
                const urgente = diasRestantes <= 5 && diasRestantes >= 0;
                const cor = vencido ? "#fca5a5" : urgente ? "#fcd34d" : "#6ee7b7";
                const Icone = vencido ? IconAlertTriangle : urgente ? IconClock : IconCheckCircle;
                return (
                  <strong style={{ fontSize: 14, color: cor, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icone size={14} /> {fmtData(vence)}
                    {!vencido && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--qa-gray-500)" }}>({diasRestantes}d)</span>}
                  </strong>
                );
              })() : (
                <strong style={{ fontSize: 14, color: "var(--qa-gray-500)", fontWeight: 500 }}>Não definida</strong>
              )}
            </div>
          )}

          {cliente.obs && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span className="qa-label" style={{ display: "block", marginBottom: 4 }}>Observações</span>
              <span style={{ fontSize: 14, color: "var(--qa-ink-70)" }}>{cliente.obs}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Último plano enviado ── */}
      {ultimoPlano && (
        <div className="qa-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Último plano enviado</h2>
            <span style={{ fontSize: 12, color: "var(--qa-gray-500)" }}>{fmtData(ultimoPlano.criadoEm)}</span>
          </div>
          <pre style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            fontFamily: "inherit",
            fontSize: 13,
            color: "var(--qa-gray-400)",
            lineHeight: 1.6,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--qa-line-soft)",
            borderRadius: 12,
            padding: "14px 16px",
            maxHeight: 320,
            overflowY: "auto",
          }}>
            {ultimoPlano.texto}
          </pre>
        </div>
      )}
    </div>
  );
}
