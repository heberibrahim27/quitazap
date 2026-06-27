import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function NovaParcela({
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

  async function criarParcela(fd: FormData) {
    "use server";
    const numero     = Number(fd.get("numero") || proximoNumero);
    const valor      = Number(String(fd.get("valor") || "0").replace(",", "."));
    const vencTxt    = String(fd.get("vencimento") || "");
    const obs        = String(fd.get("obs") || "").trim();

    if (!valor || valor <= 0 || !vencTxt) throw new Error("Valor e vencimento são obrigatórios.");

    await prisma.parcela.create({
      data: {
        dividaId,
        numero,
        valor,
        vencimento: new Date(`${vencTxt}T00:00:00`),
        obs: obs || null,
      },
    });
    redirect(`/clientes/${id}`);
  }

  // Gerar datas para parcelamento automático
  const hoje = new Date().toISOString().split("T")[0];

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Nova parcela</h1>
          <p className="page-subtitle">Dívida: {divida.credor}</p>
          {divida.parcelas.length > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8" }}>
              {divida.parcelas.length} parcela{divida.parcelas.length !== 1 ? "s" : ""} já cadastrada{divida.parcelas.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <form action={criarParcela} style={formStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={labelStyle}>
              Número da parcela
              <input
                name="numero"
                type="number"
                min={1}
                defaultValue={proximoNumero}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Valor *
              <input
                name="valor"
                required
                type="text"
                placeholder="Ex: 250,00"
                style={inputStyle}
              />
            </label>
          </div>

          <label style={labelStyle}>
            Vencimento *
            <input
              name="vencimento"
              required
              type="date"
              defaultValue={hoje}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Observações
            <textarea name="obs" rows={2} placeholder="Ex: parcela do acordo Nubank" style={inputStyle} />
          </label>

          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <button type="submit" style={btnPrimary}>Salvar parcela</button>
            <Link href={`/clientes/${id}`} style={btnSecondary}>Cancelar</Link>
          </div>
        </form>

        {/* Parcelas existentes */}
        {divida.parcelas.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#0f172a" }}>Parcelas existentes</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {divida.parcelas.map((p) => {
                const statusColor = p.status === "PAGA" ? "#16a34a" : p.status === "VENCIDA" ? "#dc2626" : "#64748b";
                return (
                  <div key={p.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff",
                    gap: 12,
                  }}>
                    <span style={{ color: "#64748b", fontSize: 14 }}>Parcela {p.numero}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                      {Number(p.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                    <span style={{ fontSize: 13, color: "#64748b" }}>
                      {new Intl.DateTimeFormat("pt-BR").format(new Date(p.vencimento))}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>
                      {p.status}
                    </span>
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
