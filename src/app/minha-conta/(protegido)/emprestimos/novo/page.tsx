import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { criarDividaComParcelas } from "@/lib/divida-service";
import { NovoEmprestimoForm } from "./NovoEmprestimoForm";

export default async function NovoEmprestimoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");
  const { erro } = await searchParams;

  async function criarEmprestimo(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const credor = String(formData.get("credor") || "").trim();
    const valorTotalTexto = String(formData.get("valorTotal") || "").replace(",", ".").trim();
    const valorParcelaTexto = String(formData.get("valorParcela") || "").replace(",", ".").trim();
    const totalParcelas = Number(String(formData.get("parcelas") || "").trim());
    const primeiraDataTexto = String(formData.get("primeiraData") || "");
    const descontadoEmFolha = formData.get("descontadoEmFolha") === "on";

    const valorTotalInformado = valorTotalTexto ? Number(valorTotalTexto) : null;
    const valorParcelaInformado = valorParcelaTexto ? Number(valorParcelaTexto) : null;

    if (!primeiraDataTexto) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("Escolha a data da primeira parcela.")}`);
    }

    const resultado = await criarDividaComParcelas({
      clienteId: clienteAtual.id,
      credor,
      totalParcelas,
      primeiraData: new Date(`${primeiraDataTexto}T12:00:00`),
      valorTotal: valorTotalTexto ? valorTotalInformado : null,
      valorParcela: valorParcelaTexto ? valorParcelaInformado : null,
      descontadoEmFolha,
      tipo: "EMPRESTIMO",
    });

    if (!resultado.ok) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent(resultado.erro)}`);
    }

    revalidatePath("/minha-conta", "layout");
    redirect(`/minha-conta/emprestimos/${resultado.dividaId}`);
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link href="/minha-conta/emprestimos" style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>
          ‹ Empréstimos
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "8px 0 0" }}>Novo empréstimo</h1>
      </div>

      {erro && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--red-soft)", border: "1px solid rgba(226,59,92,0.25)" }}>
          <p style={{ margin: 0, color: "var(--red)", fontSize: 13.5, fontWeight: 600 }}>{erro}</p>
        </div>
      )}

      <NovoEmprestimoForm criarEmprestimo={criarEmprestimo} />
    </div>
  );
}
