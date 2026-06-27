import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

async function criarParcela(formData: FormData) {
  "use server";

  const clienteId = String(formData.get("clienteId") || "");
  const dividaId = String(formData.get("dividaId") || "");
  const numero = Number(formData.get("numero") || "1");
  const valorTexto = String(formData.get("valor") || "0").replace(",", ".");
  const valor = Number(valorTexto);
  const vencimentoTexto = String(formData.get("vencimento") || "");
  const status = String(formData.get("status") || "PENDENTE");
  const obs = String(formData.get("obs") || "").trim();

  if (!clienteId || !dividaId || !numero || !valor || !vencimentoTexto) {
    throw new Error("Divida, numero, valor e vencimento sao obrigatorios.");
  }

  await prisma.parcela.create({
    data: {
      dividaId,
      numero,
      valor,
      vencimento: new Date(`${vencimentoTexto}T00:00:00`),
      status,
      obs: obs || null,
    },
  });

  redirect(`/clientes/${clienteId}`);
}

export default async function NovaParcelaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      dividas: {
        orderBy: {
          criadoEm: "desc",
        },
      },
    },
  });

  if (!cliente) {
    redirect("/clientes");
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px" }}>
      <section style={{ maxWidth: "760px", margin: "0 auto" }}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: "32px" }}>
            Nova parcela
          </h1>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>
            Cliente: {cliente.nome}
          </p>
        </div>

        {cliente.dividas.length === 0 ? (
          <div style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "20px",
            padding: "32px",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)"
          }}>
            <h2 style={{ margin: "0 0 8px", color: "#0f172a" }}>
              Nenhuma divida cadastrada
            </h2>
            <p style={{ margin: "0 0 20px", color: "#64748b" }}>
              Cadastre uma divida antes de adicionar parcelas.
            </p>

            <Link href={`/clientes/${cliente.id}/divida/nova`} style={{
              background: "#16a34a",
              color: "#ffffff",
              padding: "12px 18px",
              borderRadius: "12px",
              fontWeight: "bold"
            }}>
              Cadastrar divida
            </Link>
          </div>
        ) : (
          <form action={criarParcela} style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "20px",
            padding: "32px",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
            display: "grid",
            gap: "18px"
          }}>
            <input type="hidden" name="clienteId" value={cliente.id} />

            <label style={labelStyle}>
              Divida *
              <select name="dividaId" required style={inputStyle}>
                {cliente.dividas.map((divida) => (
                  <option key={divida.id} value={divida.id}>
                    {divida.credor} - R$ {Number(divida.valorTotal).toFixed(2)}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Numero da parcela *
              <input name="numero" required type="number" min="1" defaultValue="1" style={inputStyle} />
            </label>

            <label style={labelStyle}>
              Valor da parcela *
              <input name="valor" required type="text" placeholder="Ex: 180,00" style={inputStyle} />
            </label>

            <label style={labelStyle}>
              Vencimento *
              <input name="vencimento" required type="date" style={inputStyle} />
            </label>

            <label style={labelStyle}>
              Status
              <select name="status" style={inputStyle} defaultValue="PENDENTE">
                <option value="PENDENTE">Pendente</option>
                <option value="PAGA">Paga</option>
                <option value="VENCIDA">Vencida</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </label>

            <label style={labelStyle}>
              Observacoes
              <textarea name="obs" placeholder="Ex: parcela do acordo, boleto do mes, vencimento negociado" rows={4} style={inputStyle} />
            </label>

            <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
              <button type="submit" style={{
                background: "#16a34a",
                color: "#ffffff",
                border: "none",
                padding: "12px 18px",
                borderRadius: "12px",
                fontWeight: "bold",
                cursor: "pointer"
              }}>
                Salvar parcela
              </button>

              <Link href={`/clientes/${cliente.id}`} style={{
                background: "#e2e8f0",
                color: "#0f172a",
                padding: "12px 18px",
                borderRadius: "12px",
                fontWeight: "bold"
              }}>
                Cancelar
              </Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
  color: "#0f172a",
  fontWeight: "bold",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  outline: "none",
  background: "#ffffff",
  color: "#0f172a",
};
