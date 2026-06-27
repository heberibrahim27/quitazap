import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function EditarParcelaPage({
  params,
}: {
  params: Promise<{ id: string; parcelaId: string }>;
}) {
  const { id, parcelaId } = await params;

  const parcela = await prisma.parcela.findUnique({
    where: { id: parcelaId },
    include: { divida: true },
  });
  if (!parcela || parcela.divida.clienteId !== id) notFound();

  async function salvarParcela(formData: FormData) {
    "use server";
    const numero = Number(formData.get("numero") || "1");
    const valorTexto = String(formData.get("valor") || "0").replace(",", ".");
    const valor = Number(valorTexto);
    const vencimentoTexto = String(formData.get("vencimento") || "");
    const status = String(formData.get("status") || "PENDENTE");
    const obs = String(formData.get("obs") || "").trim();

    if (!numero || !valor || !vencimentoTexto)
      throw new Error("Número, valor e vencimento são obrigatórios.");

    await prisma.parcela.update({
      where: { id: parcelaId },
      data: {
        numero,
        valor,
        vencimento: new Date(`${vencimentoTexto}T00:00:00`),
        status,
        obs: obs || null,
      },
    });

    redirect(`/clientes/${id}`);
  }

  const vencFormatado = new Date(parcela.vencimento).toISOString().split("T")[0];

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Editar parcela</h1>
          <p className="page-subtitle">
            {parcela.divida.credor} — Parcela {parcela.numero}
          </p>
        </div>

        <form action={salvarParcela} style={formStyle}>
          <label style={labelStyle}>
            Número da parcela *
            <input name="numero" required type="number" min="1" defaultValue={parcela.numero} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Valor da parcela *
            <input name="valor" required type="text"
              defaultValue={Number(parcela.valor).toFixed(2).replace(".", ",")}
              style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Vencimento *
            <input name="vencimento" required type="date" defaultValue={vencFormatado} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Status
            <select name="status" defaultValue={parcela.status} style={inputStyle}>
              <option value="PENDENTE">Pendente</option>
              <option value="PAGA">Paga</option>
              <option value="VENCIDA">Vencida</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </label>

          <label style={labelStyle}>
            Observações
            <textarea name="obs" rows={4} defaultValue={parcela.obs ?? ""} style={inputStyle} />
          </label>

          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <button type="submit" style={btnPrimary}>Salvar alterações</button>
            <Link href={`/clientes/${id}`} style={btnSecondary}>Cancelar</Link>
          </div>
        </form>
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
