import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { CATEGORIAS } from "@/lib/gasto-flow";
import { ExcluirForm } from "@/components/ExcluirForm";
import type { Lancamento } from "@prisma/client";

const ROTULO_TIPO: Record<string, string> = {
  RECEITA: "Receita",
  DESPESA_FIXA: "Despesa fixa",
  DESPESA_VARIAVEL: "Despesa variável",
  COMPRA_CARTAO: "Compra no cartão",
  FATURA_FECHADA: "Fatura fechada",
};

// Reaproveitada no carregamento da página e nas duas Server Actions —
// nunca confia só em achar o lançamento pelo id, sempre confere o dono,
// senão um cliente logado poderia editar/apagar o lançamento de outro só
// sabendo (ou adivinhando) o id.
async function carregarLancamentoDoDono(id: string): Promise<Lancamento> {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const lancamento = await prisma.lancamento.findUnique({ where: { id } });
  if (!lancamento || lancamento.clienteId !== cliente.id) notFound();

  return lancamento;
}

export default async function EditarLancamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lancamento = await carregarLancamentoDoDono(id);

  async function salvarLancamento(formData: FormData) {
    "use server";
    await carregarLancamentoDoDono(id);

    const descricao = String(formData.get("descricao") || "").trim();
    const categoria = String(formData.get("categoria") || "").trim();
    const valorTexto = String(formData.get("valor") || "0").replace(",", ".");
    const valor = Number(valorTexto);
    const dataTexto = String(formData.get("data") || "");
    const recorrente = formData.get("recorrente") === "on";

    if (!descricao || !Number.isFinite(valor) || valor <= 0) {
      throw new Error("Descrição e valor (maior que zero) são obrigatórios.");
    }

    try {
      await prisma.lancamento.update({
        where: { id },
        data: {
          descricao,
          categoria: categoria || null,
          valor,
          data: dataTexto ? new Date(`${dataTexto}T12:00:00`) : undefined,
          recorrente,
        },
      });
    } catch (err) {
      // P2025 (registro não existe mais) pode acontecer numa corrida rara —
      // outra aba/o admin apagou entre a checagem acima e o update aqui.
      // Trata como "já não existe" em vez de deixar o erro estourar pro
      // usuário como uma tela de erro genérica.
      console.error("[MINHA-CONTA] Erro ao salvar lançamento:", err);
      redirect("/minha-conta");
    }

    redirect("/minha-conta");
  }

  async function apagarLancamento(_fd: FormData) {
    "use server";
    await carregarLancamentoDoDono(id);

    try {
      await prisma.lancamento.delete({ where: { id } });
    } catch (err) {
      console.error("[MINHA-CONTA] Erro ao apagar lançamento:", err);
    }

    redirect("/minha-conta");
  }

  const dataInput = new Date(lancamento.data).toISOString().split("T")[0];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Editar lançamento</h1>
        <p style={{ color: "#64748b" }}>{ROTULO_TIPO[lancamento.tipo] ?? lancamento.tipo}</p>
      </div>

      <form
        action={salvarLancamento}
        style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
          padding: 24, display: "grid", gap: 16, marginBottom: 16,
        }}
      >
        <label style={labelStyle}>
          Descrição *
          <input name="descricao" required defaultValue={lancamento.descricao} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Valor *
          <input
            name="valor"
            required
            type="text"
            defaultValue={Number(lancamento.valor).toFixed(2).replace(".", ",")}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Categoria
          <select name="categoria" defaultValue={lancamento.categoria ?? ""} style={inputStyle}>
            <option value="">Sem categoria</option>
            {CATEGORIAS.map(({ categoria }) => (
              <option key={categoria} value={categoria}>{categoria}</option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Data
          <input name="data" type="date" defaultValue={dataInput} style={inputStyle} />
        </label>

        <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input name="recorrente" type="checkbox" defaultChecked={lancamento.recorrente} style={{ width: 16, height: 16 }} />
          Recorrente (despesa fixa mensal)
        </label>

        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          <button
            type="submit"
            style={{
              background: "#0f172a", color: "#fff", border: "none",
              padding: "12px 20px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            Salvar alterações
          </button>
          <Link
            href="/minha-conta"
            style={{
              background: "#e2e8f0", color: "#0f172a", padding: "12px 20px",
              borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: "none",
            }}
          >
            Cancelar
          </Link>
        </div>
      </form>

      <ExcluirForm
        action={apagarLancamento}
        mensagem={`Apagar o lançamento "${lancamento.descricao}"? Essa ação não pode ser desfeita.`}
        label="🗑️ Apagar lançamento"
      />
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 6, color: "#0f172a", fontWeight: 700, fontSize: 14 };
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #cbd5e1", borderRadius: 12,
  padding: "11px 14px", fontSize: 15, outline: "none", background: "#fff", color: "#0f172a", boxSizing: "border-box",
};
