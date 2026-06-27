import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function EditarDividaPage({
  params,
}: {
  params: Promise<{ id: string; dividaId: string }>;
}) {
  const { id, dividaId } = await params;

  const divida = await prisma.divida.findUnique({ where: { id: dividaId } });
  if (!divida || divida.clienteId !== id) notFound();

  async function salvarDivida(formData: FormData) {
    "use server";
    const credor       = String(formData.get("credor") || "").trim();
    const tipo         = String(formData.get("tipo") || "OUTRO");
    const status       = String(formData.get("status") || "ATIVA");
    const prioridade   = Number(formData.get("prioridade") || "0");
    const valorTexto   = String(formData.get("valorTotal") || "0").replace(",", ".");
    const valorTotal   = Number(valorTexto);
    const descricao    = String(formData.get("descricao") || "").trim();
    const obs          = String(formData.get("obs") || "").trim();
    const dataRefTxt   = String(formData.get("dataReferencia") || "");

    if (!credor || !valorTotal || valorTotal <= 0)
      throw new Error("Credor e valor total são obrigatórios.");

    await prisma.divida.update({
      where: { id: dividaId },
      data: {
        credor, tipo, status, prioridade, valorTotal,
        descricao: descricao || null,
        obs:       obs       || null,
        dataReferencia: dataRefTxt ? new Date(`${dataRefTxt}T00:00:00`) : null,
      },
    });

    redirect(`/clientes/${id}`);
  }

  const dataRef = divida.dataReferencia
    ? new Date(divida.dataReferencia).toISOString().split("T")[0]
    : "";

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Editar dívida</h1>
          <p className="page-subtitle">{divida.credor}</p>
        </div>

        <form action={salvarDivida} style={formStyle}>
          <label style={labelStyle}>
            Credor *
            <input name="credor" required defaultValue={divida.credor} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Valor total *
            <input
              name="valorTotal"
              required
              type="text"
              defaultValue={Number(divida.valorTotal).toFixed(2).replace(".", ",")}
              style={inputStyle}
            />
          </label>

          <div style={gridDois}>
            <label style={labelStyle}>
              Tipo
              <select name="tipo" defaultValue={divida.tipo} style={inputStyle}>
                <option value="CARTAO">Cartão de crédito</option>
                <option value="EMPRESTIMO">Empréstimo</option>
                <option value="BOLETO">Boleto</option>
                <option value="ACORDO">Acordo</option>
                <option value="OUTRO">Outro</option>
              </select>
            </label>

            <label style={labelStyle}>
              Status
              <select name="status" defaultValue={divida.status} style={inputStyle}>
                <option value="ATIVA">Ativa</option>
                <option value="NEGOCIANDO">Negociando</option>
                <option value="QUITADA">Quitada</option>
              </select>
            </label>
          </div>

          <label style={labelStyle}>
            Prioridade
            <select name="prioridade" defaultValue={String(divida.prioridade ?? 0)} style={inputStyle}>
              <option value="0">Sem prioridade definida</option>
              <option value="1">1 — Baixa</option>
              <option value="2">2 — Média</option>
              <option value="3">3 — Alta</option>
              <option value="4">4 — Urgente</option>
            </select>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Dívidas com maior prioridade aparecem primeiro no plano.
            </span>
          </label>

          <label style={labelStyle}>
            Data de referência / vencimento
            <input name="dataReferencia" type="date" defaultValue={dataRef} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Descrição
            <input name="descricao" defaultValue={divida.descricao ?? ""} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Observações
            <textarea name="obs" rows={3} defaultValue={divida.obs ?? ""} style={inputStyle} />
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
  padding: 32, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", display: "grid", gap: 16,
};
const gridDois: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
const labelStyle: React.CSSProperties = { display: "grid", gap: 6, color: "#0f172a", fontWeight: "bold", fontSize: 14 };
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #cbd5e1", borderRadius: 12,
  padding: "11px 14px", fontSize: 15, outline: "none", background: "#ffffff", color: "#0f172a",
};
const btnPrimary: React.CSSProperties = {
  background: "#16a34a", color: "#ffffff", border: "none",
  padding: "12px 20px", borderRadius: 12, fontWeight: "bold", cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  background: "#e2e8f0", color: "#0f172a", padding: "12px 20px", borderRadius: 12, fontWeight: "bold",
};
