import Link from "next/link";
import { redirect, notFound } from "next/navigation";
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
    const statusAtendimento    = String(formData.get("statusAtendimento") || "NOVO");
    const rendaMensalTxt       = String(formData.get("rendaMensal") || "").replace(",", ".");
    const despesasFixasTxt     = String(formData.get("despesasFixas") || "").replace(",", ".");
    const valorDisponivelTxt   = String(formData.get("valorDisponivelMensal") || "").replace(",", ".");

    if (!nome || !telefone) throw new Error("Nome e telefone são obrigatórios.");

    await prisma.cliente.update({
      where: { id },
      data: {
        nome,
        telefone,
        cpf:   cpf   || null,
        email: email || null,
        obs:   obs   || null,
        statusAtendimento,
        rendaMensal:           rendaMensalTxt     ? Number(rendaMensalTxt)     : null,
        despesasFixas:         despesasFixasTxt   ? Number(despesasFixasTxt)   : null,
        valorDisponivelMensal: valorDisponivelTxt ? Number(valorDisponivelTxt) : null,
      },
    });

    redirect(`/clientes/${id}?ok=editado`);
  }

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Editar cliente</h1>
          <p className="page-subtitle">{cliente.nome}</p>
        </div>

        <form action={salvarCliente} style={formStyle}>

          {/* ── Dados básicos ── */}
          <h3 style={sectionTitle}>Dados básicos</h3>

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
            Status do atendimento
            <select name="statusAtendimento" defaultValue={cliente.statusAtendimento ?? "NOVO"} style={inputStyle}>
              <option value="NOVO">🆕 Novo</option>
              <option value="AGUARDANDO_INFORMACOES">⏳ Aguardando informações</option>
              <option value="PLANO_GERADO">📋 Plano gerado</option>
              <option value="ACOMPANHAMENTO">🔄 Acompanhamento</option>
              <option value="ENCERRADO">✅ Encerrado</option>
            </select>
          </label>

          <label style={labelStyle}>
            Observações
            <textarea name="obs" rows={3} defaultValue={cliente.obs ?? ""} style={inputStyle} />
          </label>

          {/* ── Contexto financeiro ── */}
          <h3 style={{ ...sectionTitle, marginTop: 8 }}>
            Contexto financeiro
            <span style={{ fontWeight: 400, fontSize: 13, color: "#94a3b8", marginLeft: 8 }}>
              (opcional — melhora os cenários de quitação)
            </span>
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <label style={labelStyle}>
              Renda mensal (R$)
              <input
                name="rendaMensal"
                type="text"
                inputMode="decimal"
                placeholder="Ex: 3000,00"
                defaultValue={cliente.rendaMensal != null ? String(Number(cliente.rendaMensal).toFixed(2)).replace(".", ",") : ""}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Despesas fixas mensais (R$)
              <input
                name="despesasFixas"
                type="text"
                inputMode="decimal"
                placeholder="Ex: 1500,00"
                defaultValue={cliente.despesasFixas != null ? String(Number(cliente.despesasFixas).toFixed(2)).replace(".", ",") : ""}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Valor disponível p/ dívidas (R$)
              <input
                name="valorDisponivelMensal"
                type="text"
                inputMode="decimal"
                placeholder="Ex: 500,00"
                defaultValue={cliente.valorDisponivelMensal != null ? String(Number(cliente.valorDisponivelMensal).toFixed(2)).replace(".", ",") : ""}
                style={inputStyle}
              />
            </label>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
            Esses valores são usados para calcular os cenários Leve, Realista e Agressivo no plano do cliente.
          </p>

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
const sectionTitle: React.CSSProperties = {
  margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a",
  paddingBottom: 8, borderBottom: "1px solid #f1f5f9",
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
