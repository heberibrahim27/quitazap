import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { NOMES_CATEGORIAS_GASTO, NOMES_CATEGORIAS_RECEITA } from "@/lib/gasto-flow";
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

// O Dashboard, Receitas, Despesas, Movimentações e Cartões cada um calcula
// seu próprio total a partir dos mesmos lançamentos — sem revalidar,
// continuariam servindo o RSC em cache com os totais antigos depois do
// redirect. O modo "layout" já cobre toda essa subárvore de uma vez, sem
// precisar de uma chamada por rota (cada chamada extra só atrasa o redirect
// à toa, sem revalidar nada a mais).
function revalidarTelasDependentes() {
  revalidatePath("/minha-conta", "layout");
}

export default async function EditarLancamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { id } = await params;
  const { erro } = await searchParams;
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
      redirect(`/minha-conta/lancamento/${id}/editar?erro=${encodeURIComponent("Descrição e valor (maior que zero) são obrigatórios.")}`);
    }

    const novaData = dataTexto ? new Date(`${dataTexto}T12:00:00`) : undefined;
    if (novaData && Number.isNaN(novaData.getTime())) {
      redirect(`/minha-conta/lancamento/${id}/editar?erro=${encodeURIComponent("Data inválida.")}`);
    }

    try {
      await prisma.lancamento.update({
        where: { id },
        data: {
          descricao,
          categoria: categoria || null,
          valor,
          data: novaData,
          recorrente,
        },
      });
    } catch (err) {
      // P2025 (registro não existe mais) pode acontecer numa corrida rara —
      // outra aba/o admin apagou entre a checagem acima e o update aqui.
      // Só esse caso específico é tratado como "já não existe"; qualquer
      // outro erro (conexão, constraint etc.) volta pro formulário com
      // aviso em vez de fingir sucesso e mandar o cliente pro dashboard
      // achando que salvou.
      console.error("[MINHA-CONTA] Erro ao salvar lançamento:", err);
      if ((err as { code?: string } | null)?.code === "P2025") {
        redirect("/minha-conta");
      }
      redirect(`/minha-conta/lancamento/${id}/editar?erro=${encodeURIComponent("Não foi possível salvar agora. Tente de novo.")}`);
    }

    revalidarTelasDependentes();
    redirect("/minha-conta");
  }

  async function apagarLancamento(_fd: FormData) {
    "use server";
    await carregarLancamentoDoDono(id);

    try {
      await prisma.lancamento.delete({ where: { id } });
      revalidarTelasDependentes();
    } catch (err) {
      console.error("[MINHA-CONTA] Erro ao apagar lançamento:", err);
    }

    redirect("/minha-conta");
  }

  const dataInput = new Date(lancamento.data).toISOString().split("T")[0];
  // Receita e despesa têm listas de categoria totalmente diferentes —
  // "Salário"/"Prêmio" não fazem sentido ao lado de "Mercado"/"Apostas".
  const nomesCategorias = lancamento.tipo === "RECEITA" ? NOMES_CATEGORIAS_RECEITA : NOMES_CATEGORIAS_GASTO;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Editar lançamento</h1>
        <p style={{ color: "var(--mc-ink-dim)", marginTop: 4 }}>{ROTULO_TIPO[lancamento.tipo] ?? lancamento.tipo}</p>
      </div>

      {erro && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--red-soft)", border: "1px solid rgba(226,59,92,0.25)" }}>
          <p style={{ margin: 0, color: "var(--red)", fontSize: 13.5, fontWeight: 600 }}>{erro}</p>
        </div>
      )}

      <form action={salvarLancamento} className="mc-form-card" style={{ marginBottom: 16 }}>
        <label className="mc-label">
          Descrição *
          <input name="descricao" required defaultValue={lancamento.descricao} className="mc-input" />
        </label>

        <label className="mc-label">
          Valor *
          <input
            name="valor"
            required
            type="text"
            defaultValue={Number(lancamento.valor).toFixed(2).replace(".", ",")}
            className="mc-input"
          />
        </label>

        <label className="mc-label">
          Categoria
          <select name="categoria" defaultValue={lancamento.categoria ?? ""} className="mc-input">
            <option value="">Sem categoria</option>
            {nomesCategorias.map((categoria) => (
              <option key={categoria} value={categoria}>{categoria}</option>
            ))}
          </select>
        </label>

        <label className="mc-label">
          Data
          <input name="data" type="date" defaultValue={dataInput} className="mc-input" />
        </label>

        <label className="mc-label" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input name="recorrente" type="checkbox" defaultChecked={lancamento.recorrente} style={{ width: 16, height: 16 }} />
          Recorrente (despesa fixa mensal)
        </label>

        <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
          <button type="submit" className="mc-btn-primary" style={{ border: "none" }}>
            Salvar alterações
          </button>
          <Link href="/minha-conta" className="mc-btn-secondary">
            Cancelar
          </Link>
        </div>
      </form>

      <ExcluirForm
        action={apagarLancamento}
        mensagem={`Apagar o lançamento "${lancamento.descricao}"? Essa ação não pode ser desfeita.`}
        label="Apagar lançamento"
        estiloBotao={{
          width: "100%",
          background: "rgba(226, 59, 92, 0.1)",
          border: "1px solid rgba(226, 59, 92, 0.3)",
          color: "#E23B5C",
          borderRadius: 13,
          padding: "13px 20px",
          fontWeight: 700,
          fontSize: 13.5,
        }}
      />
    </div>
  );
}
