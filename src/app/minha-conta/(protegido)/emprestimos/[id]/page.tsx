import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { ExcluirForm } from "@/components/ExcluirForm";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Mesmo cuidado das outras telas de editar: nunca confia só no id, sempre
// confere o dono (via a dívida) antes de deixar ler/mexer na parcela.
async function carregarParcelaDoDono(parcelaId: string, clienteId: string) {
  const parcela = await prisma.parcela.findUnique({ where: { id: parcelaId }, include: { divida: true } });
  if (!parcela || parcela.divida.clienteId !== clienteId) return null;
  return parcela;
}

export default async function DetalheEmprestimoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { id } = await params;
  const { erro } = await searchParams;

  const emprestimo = await prisma.divida.findUnique({
    where: { id },
    include: { parcelas: { orderBy: { numero: "asc" } } },
  });
  if (!emprestimo || emprestimo.clienteId !== cliente.id || emprestimo.tipo !== "EMPRESTIMO") notFound();

  async function marcarParcelaPaga(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const parcelaId = String(formData.get("parcelaId") || "");
    const valorPago = Number(String(formData.get("valorPago") || "").replace(",", "."));
    const parcela = await carregarParcelaDoDono(parcelaId, clienteAtual.id);
    if (!parcela) notFound();

    if (!Number.isFinite(valorPago) || valorPago <= 0) {
      redirect(`/minha-conta/emprestimos/${parcela.dividaId}?erro=${encodeURIComponent("Digite um valor pago válido.")}`);
    }

    await prisma.$transaction([
      prisma.parcela.update({ where: { id: parcelaId }, data: { status: "PAGA", valor: valorPago } }),
      prisma.divida.update({ where: { id: parcela.dividaId }, data: { valorPago: { increment: valorPago } } }),
    ]);

    const restantes = await prisma.parcela.count({ where: { dividaId: parcela.dividaId, status: { not: "PAGA" } } });
    if (restantes === 0) {
      await prisma.divida.update({ where: { id: parcela.dividaId }, data: { status: "QUITADA" } });
    }

    revalidatePath("/minha-conta", "layout");
    revalidatePath("/minha-conta/emprestimos");
    revalidatePath(`/minha-conta/emprestimos/${parcela.dividaId}`);
    revalidatePath("/minha-conta/dividas");
    redirect(`/minha-conta/emprestimos/${parcela.dividaId}`);
  }

  async function desfazerPagamento(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const parcelaId = String(formData.get("parcelaId") || "");
    const parcela = await carregarParcelaDoDono(parcelaId, clienteAtual.id);
    if (!parcela) notFound();

    await prisma.$transaction([
      prisma.parcela.update({ where: { id: parcelaId }, data: { status: "PENDENTE" } }),
      prisma.divida.update({ where: { id: parcela.dividaId }, data: { valorPago: { decrement: parcela.valor } } }),
    ]);
    await prisma.divida.update({ where: { id: parcela.dividaId }, data: { status: "ATIVA" } });

    revalidatePath("/minha-conta", "layout");
    revalidatePath("/minha-conta/emprestimos");
    revalidatePath(`/minha-conta/emprestimos/${parcela.dividaId}`);
    revalidatePath("/minha-conta/dividas");
    redirect(`/minha-conta/emprestimos/${parcela.dividaId}`);
  }

  async function apagarEmprestimo(_fd: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");
    const atual = await prisma.divida.findUnique({ where: { id } });
    if (!atual || atual.clienteId !== clienteAtual.id) notFound();

    await prisma.divida.delete({ where: { id } });

    revalidatePath("/minha-conta", "layout");
    revalidatePath("/minha-conta/emprestimos");
    revalidatePath("/minha-conta/dividas");
    redirect("/minha-conta/emprestimos");
  }

  const saldoDevedor = emprestimo.valorTotal - emprestimo.valorPago;
  const parcelasPagas = emprestimo.parcelas.filter((p) => p.status === "PAGA").length;
  const totalDasParcelas = emprestimo.parcelas.reduce((soma, p) => soma + p.valor, 0);
  const jurosTotal = Math.round((totalDasParcelas - emprestimo.valorTotal) * 100) / 100;

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <Link href="/minha-conta/emprestimos" style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>
          ‹ Empréstimos
        </Link>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "8px 0 0" }}>{emprestimo.credor}</h1>
        <p style={{ color: "var(--ink-dim)", marginTop: 4 }}>
          {parcelasPagas}/{emprestimo.totalParcelas ?? emprestimo.parcelas.length} parcelas pagas
          {emprestimo.status === "QUITADA" && <span style={{ color: "var(--green)", fontWeight: 700 }}> · Quitado 🎉</span>}
        </p>
      </div>

      {erro && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--red-soft)", border: "1px solid rgba(226,59,92,0.25)" }}>
          <p style={{ margin: 0, color: "var(--red)", fontSize: 13.5, fontWeight: 600 }}>{erro}</p>
        </div>
      )}

      <div className="mc-card" style={{ marginBottom: 16, display: "flex", gap: 24 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Saldo devedor</p>
          <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: saldoDevedor > 0 ? "var(--red)" : "var(--green)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtValor(saldoDevedor)}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Total do empréstimo</p>
          <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: "var(--ink)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtValor(emprestimo.valorTotal)}
          </p>
        </div>
        {jurosTotal > 0.01 && (
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Juros total</p>
            <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: "var(--orange)", fontFamily: "'IBM Plex Mono', monospace" }}>
              {fmtValor(jurosTotal)}
            </p>
          </div>
        )}
      </div>

      <div className="card-head">
        <p className="card-title" style={{ fontSize: 14 }}>
          <span className="title-label">Parcelas</span>
        </p>
      </div>
      <div className="mc-card" style={{ maxHeight: "52vh", overflowY: "auto" }}>
        {emprestimo.parcelas.length === 0 ? (
          <p className="mc-empty">Esse empréstimo não tem parcelas cadastradas.</p>
        ) : (
          <div className="mc-list">
            {emprestimo.parcelas.map((p) => (
              <div key={p.id} className="parcela-row">
                <div className="parcela-info">
                  <span className={`parcela-check ${p.status === "PAGA" ? "checked" : ""}`}>
                    {p.status === "PAGA" && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                    )}
                  </span>
                  <div>
                    <div className="mc-list-desc">Parcela {p.numero}</div>
                    <div className="mc-list-meta">Vence {fmtData(p.vencimento)}</div>
                  </div>
                </div>
                {p.status === "PAGA" ? (
                  <form action={desfazerPagamento} className="parcela-acao">
                    <input type="hidden" name="parcelaId" value={p.id} />
                    <span className="parcela-valor-pago">{fmtValor(p.valor)}</span>
                    <button type="submit" className="parcela-desfazer">Desfazer</button>
                  </form>
                ) : (
                  <form action={marcarParcelaPaga} className="parcela-acao">
                    <input type="hidden" name="parcelaId" value={p.id} />
                    <input
                      name="valorPago"
                      type="text"
                      inputMode="decimal"
                      defaultValue={p.valor.toFixed(2).replace(".", ",")}
                      className="parcela-input-valor"
                      aria-label={`Valor pago da parcela ${p.numero}`}
                    />
                    <button type="submit" className="parcela-marcar">Marcar paga</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <ExcluirForm
          action={apagarEmprestimo}
          mensagem={`Apagar o empréstimo "${emprestimo.credor}"? Todas as parcelas (pagas e pendentes) serão apagadas junto. Essa ação não pode ser desfeita.`}
          label="Apagar empréstimo"
          estiloBotao={{
            width: "100%",
            background: "rgba(226, 59, 92, 0.1)",
            border: "1px solid rgba(226, 59, 92, 0.3)",
            color: "#E23B5C",
            borderRadius: 13,
            padding: "13px 20px",
            fontWeight: 700,
            fontSize: 13.5,
          }}
        />
      </div>
    </div>
  );
}
