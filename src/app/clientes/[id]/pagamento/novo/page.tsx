import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

async function registrarPagamento(formData: FormData) {
  "use server";

  const clienteId  = String(formData.get("clienteId") || "");
  const dividaId   = String(formData.get("dividaId") || "");
  const parcelaId  = String(formData.get("parcelaId") || "");
  const valorTexto = String(formData.get("valor") || "0").replace(",", ".");
  const valor      = Number(valorTexto);
  const dataTexto  = String(formData.get("data") || "");
  const obs        = String(formData.get("obs") || "").trim();

  if (!clienteId || !dividaId || !valor || valor <= 0 || !dataTexto) {
    throw new Error("Dívida, valor e data são obrigatórios.");
  }

  // Busca a dívida para verificar se ficou quitada após o pagamento
  const divida = await prisma.divida.findUnique({ where: { id: dividaId } });
  const novoTotalPago = Number(divida?.valorPago ?? 0) + valor;
  const ficouQuitada  = divida && novoTotalPago >= Number(divida.valorTotal);

  await prisma.$transaction(async (tx) => {
    // Registra o pagamento
    await tx.pagamento.create({
      data: {
        clienteId,
        dividaId,
        valor,
        data: new Date(`${dataTexto}T00:00:00`),
        obs: obs || null,
      },
    });

    // Atualiza o valorPago da dívida
    await tx.divida.update({
      where: { id: dividaId },
      data: {
        valorPago: { increment: valor },
        // Se ficou quitada, atualiza o status automaticamente
        ...(ficouQuitada ? { status: "QUITADA" } : {}),
      },
    });

    // Se uma parcela foi selecionada, marca como PAGA
    if (parcelaId) {
      await tx.parcela.update({
        where: { id: parcelaId },
        data: { status: "PAGA" },
      });
    }
  });

  redirect(`/clientes/${clienteId}?ok=pagamento`);
}

export default async function NovoPagamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      dividas: {
        where: { status: { not: "QUITADA" } },
        include: {
          parcelas: {
            where: { status: "PENDENTE" },
            orderBy: { vencimento: "asc" },
          },
        },
        orderBy: { criadoEm: "desc" },
      },
    },
  });

  if (!cliente) redirect("/clientes");

  // Todas as parcelas pendentes para o select
  const todasParcelas = cliente!.dividas.flatMap((d) =>
    d.parcelas.map((p) => ({
      ...p,
      credorNome: d.credor,
    }))
  );

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Registrar pagamento</h1>
          <p className="page-subtitle">Cliente: {cliente!.nome}</p>
        </div>

        {cliente!.dividas.length === 0 ? (
          <div className="content-card">
            <h2 style={{ margin: "0 0 8px", color: "#0f172a" }}>Nenhuma dívida ativa</h2>
            <p style={{ margin: "0 0 20px", color: "#64748b" }}>
              Cadastre uma dívida antes de registrar pagamentos.
            </p>
            <Link href={`/clientes/${id}/divida/nova`} className="btn-primary">
              Cadastrar dívida
            </Link>
          </div>
        ) : (
          <form action={registrarPagamento} style={formStyle}>
            <input type="hidden" name="clienteId" value={cliente!.id} />

            <label style={labelStyle}>
              Dívida *
              <select name="dividaId" required style={inputStyle}>
                {cliente!.dividas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.credor} — saldo R${" "}
                    {(Number(d.valorTotal) - Number(d.valorPago)).toFixed(2).replace(".", ",")}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Valor pago *
              <input name="valor" required type="text" placeholder="Ex: 300,00" style={inputStyle} />
            </label>

            <label style={labelStyle}>
              Data do pagamento *
              <input name="data" required type="date" style={inputStyle} />
            </label>

            {todasParcelas.length > 0 && (
              <label style={labelStyle}>
                Marcar parcela como paga{" "}
                <span style={{ fontWeight: 400, color: "#64748b", fontSize: 13 }}>(opcional)</span>
                <select name="parcelaId" style={inputStyle} defaultValue="">
                  <option value="">— Nenhuma parcela específica —</option>
                  {todasParcelas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.credorNome} · Parcela {p.numero} ·{" "}
                      R$ {Number(p.valor).toFixed(2).replace(".", ",")} · venc.{" "}
                      {new Intl.DateTimeFormat("pt-BR").format(new Date(p.vencimento))}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 12, color: "#94a3b8", marginTop: -4 }}>
                  Se selecionada, a parcela será marcada como Paga automaticamente.
                </span>
              </label>
            )}

            <label style={labelStyle}>
              Observações
              <textarea
                name="obs"
                placeholder="Ex: pagamento via Pix, comprovante recebido, parcela 1 paga"
                rows={3}
                style={inputStyle}
              />
            </label>

            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <button type="submit" style={btnPrimary}>Salvar pagamento</button>
              <Link href={`/clientes/${id}`} style={btnSecondary}>Cancelar</Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

const formStyle: React.CSSProperties = {
  background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 20,
  padding: 32, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", display: "grid", gap: 18,
};
const labelStyle: React.CSSProperties = { display: "grid", gap: 8, color: "#0f172a", fontWeight: "bold" };
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #cbd5e1", borderRadius: 12,
  padding: "12px 14px", fontSize: 15, outline: "none", background: "#ffffff", color: "#0f172a",
};
const btnPrimary: React.CSSProperties = {
  background: "#16a34a", color: "#ffffff", border: "none",
  padding: "12px 18px", borderRadius: 12, fontWeight: "bold", cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  background: "#e2e8f0", color: "#0f172a",
  padding: "12px 18px", borderRadius: 12, fontWeight: "bold",
};
