import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
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

    const valorTotalInformado = valorTotalTexto ? Number(valorTotalTexto) : null;
    const valorParcelaInformado = valorParcelaTexto ? Number(valorParcelaTexto) : null;

    if (!credor) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("Digite quem emprestou.")}`);
    }
    if (!Number.isInteger(totalParcelas) || totalParcelas <= 0 || totalParcelas > 360) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("Digite uma quantidade de parcelas válida.")}`);
    }
    if (!primeiraDataTexto) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("Escolha a data da primeira parcela.")}`);
    }
    if (valorTotalTexto && (!Number.isFinite(valorTotalInformado) || (valorTotalInformado as number) <= 0)) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("O valor total tomado emprestado é inválido.")}`);
    }
    if (valorParcelaTexto && (!Number.isFinite(valorParcelaInformado) || (valorParcelaInformado as number) <= 0)) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("O valor da parcela é inválido.")}`);
    }
    if (valorTotalInformado == null && valorParcelaInformado == null) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("Preencha o valor total ou o valor da parcela.")}`);
    }

    // Se o valor da parcela foi informado, ele manda (é o que o contrato do
    // empréstimo realmente cobra por mês, já com juros embutidos — não faz
    // sentido recalcular). Sem ele, cai pro rateio simples do valor total
    // dividido igualmente pelas parcelas (a última absorve o resto do
    // arredondamento, ex: R$1.000 em 3x = 333,33 + 333,33 + 333,34).
    let valorPorParcela: number;
    let valorTotalFinal: number;
    if (valorParcelaInformado != null) {
      valorPorParcela = Math.round(valorParcelaInformado * 100) / 100;
      valorTotalFinal = valorTotalInformado ?? Math.round(valorPorParcela * totalParcelas * 100) / 100;
    } else {
      valorTotalFinal = valorTotalInformado as number;
      valorPorParcela = Math.floor((valorTotalFinal / totalParcelas) * 100) / 100;
    }

    const primeiraData = new Date(`${primeiraDataTexto}T12:00:00`);
    if (Number.isNaN(primeiraData.getTime())) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("Data da primeira parcela inválida.")}`);
    }

    const restoUltimaParcela =
      valorParcelaInformado != null
        ? 0
        : Math.round((valorTotalFinal - valorPorParcela * totalParcelas) * 100) / 100;

    let dividaId: string;
    try {
      const divida = await prisma.divida.create({
        data: {
          clienteId: clienteAtual.id,
          credor,
          tipo: "EMPRESTIMO",
          status: "ATIVA",
          valorTotal: valorTotalFinal,
          totalParcelas,
          diaVencimento: primeiraData.getDate(),
        },
      });
      dividaId = divida.id;

      const parcelasData = Array.from({ length: totalParcelas }, (_, i) => {
        const vencimento = new Date(primeiraData);
        vencimento.setMonth(vencimento.getMonth() + i);
        const ehUltima = i === totalParcelas - 1;
        return {
          dividaId,
          numero: i + 1,
          valor: ehUltima ? Math.round((valorPorParcela + restoUltimaParcela) * 100) / 100 : valorPorParcela,
          vencimento,
          status: "PENDENTE",
        };
      });
      await prisma.parcela.createMany({ data: parcelasData });
    } catch (err) {
      console.error("[MINHA-CONTA] Erro ao criar empréstimo:", err);
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("Não foi possível salvar o empréstimo. Tente de novo.")}`);
    }

    revalidatePath("/minha-conta", "layout");
    redirect(`/minha-conta/emprestimos/${dividaId}`);
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
