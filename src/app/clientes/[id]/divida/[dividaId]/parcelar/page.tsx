import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function ParcelarEmLotePage({
  params,
}: {
  params: Promise<{ id: string; dividaId: string }>;
}) {
  const { id, dividaId } = await params;

  const divida = await prisma.divida.findUnique({
    where: { id: dividaId },
    include: { parcelas: { orderBy: { numero: "asc" } } },
  });
  if (!divida || divida.clienteId !== id) notFound();

  const proximoNumero = divida.parcelas.length + 1;
  const hoje = new Date().toISOString().split("T")[0];

  async function gerarParcelas(fd: FormData) {
    "use server";
    const qtd         = Math.min(Number(fd.get("quantidade") || "1"), 120);
    const valor       = Number(String(fd.get("valor") || "0").replace(",", "."));
    const primeiraVenc = String(fd.get("primeiraVencimento") || "");
    const inicio      = Number(fd.get("numeroinicial") || proximoNumero);

    if (!qtd || qtd < 1 || !valor || valor <= 0 || !primeiraVenc)
      throw new Error("Quantidade, valor e data da primeira parcela são obrigatórios.");

    const base = new Date(`${primeiraVenc}T00:00:00`);

    const data = Array.from({ length: qtd }, (_, i) => {
      const venc = new Date(base);
      venc.setMonth(venc.getMonth() + i);
      return {
        dividaId,
        numero: inicio + i,
        valor,
        vencimento: venc,
      };
    });

    await prisma.parcela.createMany({ data });
    redirect(`/clientes/${id}`);
  }

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Parcelar em lote</h1>
          <p className="page-subtitle">Dívida: {divida.credor}</p>
          {divida.parcelas.length > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8" }}>
              Já existem {divida.parcelas.length} parcela{divida.parcelas.length !== 1 ? "s" : ""}.
              As novas serão adicionadas a partir da parcela {proximoNumero}.
            </p>
          )}
        </div>

        <form action={gerarParcelas} style={formStyle}>
          {/* Dica visual */}
          <div style={{
            background: "#f0fdf4", border: "1px solid #bbf7d0",
            borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#166534",
          }}>
            💡 Preencha o valor de cada parcela, quantas parcelas quer gerar e a data da primeira.
            As demais serão geradas mês a mês automaticamente.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={labelStyle}>
              Quantidade de parcelas *
              <input
                name="quantidade"
                required
                type="number"
                min={1}
                max={120}
                defaultValue={1}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Valor de cada parcela (R$) *
              <input
                name="valor"
                required
                type="text"
                placeholder="Ex: 250,00"
                defaultValue={
                  divida.parcelas.length === 0
                    ? Number(divida.valorTotal).toFixed(2).replace(".", ",")
                    : ""
                }
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={labelStyle}>
              Vencimento da 1ª parcela *
              <input name="primeiraVencimento" required type="date" defaultValue={hoje} style={inputStyle} />
            </label>

            <label style={labelStyle}>
              Número inicial
              <input
                name="numeroinicial"
                type="number"
                min={1}
                defaultValue={proximoNumero}
                style={inputStyle}
              />
              <span style={{ fontSize: 12, color: "#94a3b8", marginTop: -2 }}>
                Primeira parcela terá este número
              </span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <button type="submit" style={btnPrimary}>Gerar parcelas</button>
            <Link href={`/clientes/${id}`} style={btnSecondary}>Cancelar</Link>
          </div>
        </form>

        {/* Preview das parcelas já existentes */}
        {divida.parcelas.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#0f172a" }}>
              Parcelas existentes ({divida.parcelas.length})
            </h2>
            <div style={{ display: "grid", gap: 6 }}>
              {divida.parcelas.map((p) => {
                const statusColor =
                  p.status === "PAGA"    ? "#16a34a" :
                  p.status === "VENCIDA" ? "#dc2626" : "#64748b";
                return (
                  <div key={p.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 14px", border: "1px solid #e2e8f0",
                    borderRadius: 10, background: "#fff", gap: 12, fontSize: 13,
                  }}>
                    <span style={{ color: "#64748b" }}>Parcela {p.numero}</span>
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>
                      {Number(p.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                    <span style={{ color: "#64748b" }}>
                      {new Intl.DateTimeFormat("pt-BR").format(new Date(p.vencimento))}
                    </span>
                    <span style={{ fontWeight: 700, color: statusColor }}>{p.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

const formStyle: React.CSSProperties = {
  background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 20,
  padding: 32, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", display: "grid", gap: 16,
};
const labelStyle: React.CSSProperties = { display: "grid", gap: 6, color: "#0f172a", fontWeight: 700, fontSize: 14 };
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #cbd5e1", borderRadius: 12,
  padding: "11px 14px", fontSize: 15, outline: "none", background: "#fff", color: "#0f172a",
};
const btnPrimary: React.CSSProperties = {
  background: "#16a34a", color: "#fff", border: "none",
  padding: "12px 20px", borderRadius: 12, fontWeight: 700, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  background: "#e2e8f0", color: "#0f172a", padding: "12px 20px", borderRadius: 12, fontWeight: 700,
};
