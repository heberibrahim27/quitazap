import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente) notFound();

  async function salvarCliente(formData: FormData) {
    "use server";
    const nome     = String(formData.get("nome") || "").trim();
    const telefone = String(formData.get("telefone") || "").trim();
    const cpf      = String(formData.get("cpf") || "").trim();
    const email    = String(formData.get("email") || "").trim();
    const obs      = String(formData.get("obs") || "").trim();
    const gratuito = formData.get("gratuito") === "on";

    if (!nome || !telefone) throw new Error("Nome e telefone são obrigatórios.");

    await prisma.cliente.update({
      where: { id },
      data: {
        nome,
        telefone,
        cpf:   cpf   || null,
        email: email || null,
        obs:   obs   || null,
        gratuito,
      },
    });

    revalidatePath("/");
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${id}`);
    redirect(`/clientes/${id}?ok=editado`);
  }

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Editar cliente</h1>
          <p className="page-subtitle">{cliente.nome}</p>
        </div>

        <form action={salvarCliente} style={formStyle}>

          <label style={labelStyle}>
            Nome *
            <input name="nome" required defaultValue={cliente.nome} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Telefone / WhatsApp *
            <input name="telefone" required defaultValue={cliente.telefone} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            CPF
            <input name="cpf" defaultValue={cliente.cpf ?? ""} placeholder="Opcional" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            E-mail
            <input name="email" type="email" defaultValue={cliente.email ?? ""} placeholder="Opcional" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Observações
            <textarea name="obs" rows={3} defaultValue={cliente.obs ?? ""} placeholder="Anotações internas" style={inputStyle} />
          </label>

          {/* ── Gratuito ── */}
          <div style={{
            background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12,
            padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <input
              type="checkbox"
              name="gratuito"
              id="gratuito"
              defaultChecked={(cliente as { gratuito?: boolean }).gratuito ?? false}
              style={{ marginTop: 2, width: 18, height: 18, cursor: "pointer", accentColor: "#2563eb" }}
            />
            <label htmlFor="gratuito" style={{ cursor: "pointer" }}>
              <strong style={{ fontSize: 14, color: "#1e40af", display: "block", marginBottom: 2 }}>
                🎁 Acesso gratuito
              </strong>
              <span style={{ fontSize: 13, color: "#1d4ed8" }}>
                Família e amigos — não contabiliza na receita.
              </span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
const labelStyle: React.CSSProperties = { display: "grid", gap: 8, color: "#0f172a", fontWeight: 600, fontSize: 14 };
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #cbd5e1", borderRadius: 12,
  padding: "11px 14px", fontSize: 15, outline: "none", background: "#ffffff", color: "#0f172a",
};
const btnPrimary: React.CSSProperties = {
  background: "#16a34a", color: "#ffffff", border: "none",
  padding: "12px 20px", borderRadius: 12, fontWeight: 700, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  background: "#e2e8f0", color: "#0f172a", padding: "12px 20px", borderRadius: 12, fontWeight: 700,
};
