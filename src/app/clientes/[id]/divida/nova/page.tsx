import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

async function criarDivida(formData: FormData) {
  "use server";

  const clienteId        = String(formData.get("clienteId") || "");
  const credor           = String(formData.get("credor") || "").trim();
  const tipo             = String(formData.get("tipo") || "OUTRO");
  const status           = String(formData.get("status") || "ATIVA");
  const prioridade       = Number(formData.get("prioridade") || "0");
  const valorTexto       = String(formData.get("valorTotal") || "0").replace(",", ".");
  const descricao        = String(formData.get("descricao") || "").trim();
  const obs              = String(formData.get("obs") || "").trim();
  const dataRefTexto     = String(formData.get("dataReferencia") || "");
  const valorTotal       = Number(valorTexto);

  if (!clienteId || !credor || !valorTotal || valorTotal <= 0)
    throw new Error("Cliente, credor e valor total são obrigatórios.");

  await prisma.divida.create({
    data: {
      clienteId, credor, tipo, status, prioridade, valorTotal,
      descricao: descricao || null,
      obs:       obs       || null,
      dataReferencia: dataRefTexto ? new Date(`${dataRefTexto}T00:00:00`) : null,
    },
  });

  redirect(`/clientes/${clienteId}?ok=divida`);
}

export default async function NovaDividaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente) redirect("/clientes");

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Nova dívida</h1>
          <p className="page-subtitle">Cliente: {cliente!.nome}</p>
        </div>

        <form action={criarDivida} style={formStyle}>
          <input type="hidden" name="clienteId" value={cliente!.id} />

          <label style={labelStyle}>
            Credor *
            <input name="credor" required placeholder="Ex: Nubank, Serasa, faculdade, Casas Bahia" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Valor total *
            <input name="valorTotal" required type="text" placeholder="Ex: 1200,00" style={inputStyle} />
          </label>

          <div style={gridDois}>
            <label style={labelStyle}>
              Tipo
              <select name="tipo" style={inputStyle} defaultValue="OUTRO">
                <option value="CARTAO">Cartão de crédito</option>
                <option value="EMPRESTIMO">Empréstimo</option>
                <option value="BOLETO">Boleto</option>
                <option value="ACORDO">Acordo</option>
                <option value="OUTRO">Outro</option>
              </select>
            </label>

            <label style={labelStyle}>
              Status
              <select name="status" style={inputStyle} defaultValue="ATIVA">
                <option value="ATIVA">Ativa</option>
                <option value="NEGOCIANDO">Negociando</option>
                <option value="QUITADA">Quitada</option>
              </select>
            </label>
          </div>

          <label style={labelStyle}>
            Prioridade
            <select name="prioridade" style={inputStyle} defaultValue="0">
              <option value="0">Sem prioridade definida</option>
              <option value="1">1 — Baixa</option>
              <option value="2">2 — Média</option>
              <option value="3">3 — Alta</option>
              <option value="4">4 — Urgente</option>
            </select>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Dívidas com maior prioridade aparecem primeiro no plano.</span>
          </label>

          <label style={labelStyle}>
            Data de referência / vencimento
            <input name="dataReferencia" type="date" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Descrição
            <input name="descricao" placeholder="Ex: Cartão atrasado, acordo em aberto" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Observações
            <textarea name="obs" placeholder="Informações importantes sobre essa dívida" rows={3} style={inputStyle} />
          </label>

          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <button type="submit" style={btnPrimary}>Salvar dívida</button>
            <Link href={`/clientes/${cliente!.id}`} style={btnSecondary}>Cancelar</Link>
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
