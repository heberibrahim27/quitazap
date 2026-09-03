import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";

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
    const valorTotal = Number(String(formData.get("valorTotal") || "").replace(",", "."));
    const totalParcelas = Number(String(formData.get("parcelas") || "").trim());
    const primeiraDataTexto = String(formData.get("primeiraData") || "");

    if (!credor || !Number.isFinite(valorTotal) || valorTotal <= 0) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("Digite quem emprestou e um valor total válido.")}`);
    }
    if (!Number.isInteger(totalParcelas) || totalParcelas <= 0 || totalParcelas > 360) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("Digite uma quantidade de parcelas válida.")}`);
    }
    if (!primeiraDataTexto) {
      redirect(`/minha-conta/emprestimos/novo?erro=${encodeURIComponent("Escolha a data da primeira parcela.")}`);
    }

    const primeiraData = new Date(`${primeiraDataTexto}T12:00:00`);

    const divida = await prisma.divida.create({
      data: {
        clienteId: clienteAtual.id,
        credor,
        tipo: "EMPRESTIMO",
        status: "ATIVA",
        valorTotal,
        totalParcelas,
        diaVencimento: primeiraData.getDate(),
      },
    });

    // Parcelas mensais iguais; a última absorve o resto do arredondamento
    // (ex: R$1.000 em 3x = 333,33 + 333,33 + 333,34) pra fechar exatamente
    // o valor total.
    const valorBase = Math.floor((valorTotal / totalParcelas) * 100) / 100;
    const resto = Math.round((valorTotal - valorBase * totalParcelas) * 100) / 100;
    const parcelasData = Array.from({ length: totalParcelas }, (_, i) => {
      const vencimento = new Date(primeiraData);
      vencimento.setMonth(vencimento.getMonth() + i);
      return {
        dividaId: divida.id,
        numero: i + 1,
        valor: i === totalParcelas - 1 ? Math.round((valorBase + resto) * 100) / 100 : valorBase,
        vencimento,
        status: "PENDENTE",
      };
    });
    await prisma.parcela.createMany({ data: parcelasData });

    revalidatePath("/minha-conta", "layout");
    revalidatePath("/minha-conta/emprestimos");
    revalidatePath("/minha-conta/dividas");
    redirect(`/minha-conta/emprestimos/${divida.id}`);
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

      <form action={criarEmprestimo} className="mc-form-card">
        <label className="mc-label">
          Quem emprestou *
          <input name="credor" required placeholder="Ex: Banco Inter, Nubank, João" className="mc-input" />
        </label>
        <label className="mc-label">
          Valor total tomado emprestado *
          <input name="valorTotal" required type="text" inputMode="decimal" placeholder="Ex: 5000,00" className="mc-input" />
        </label>
        <label className="mc-label">
          Quantidade de parcelas *
          <input name="parcelas" required type="number" min={1} max={360} placeholder="Ex: 12" className="mc-input" />
        </label>
        <label className="mc-label">
          Data da primeira parcela *
          <input name="primeiraData" required type="date" className="mc-input" />
        </label>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.5 }}>
          As parcelas são geradas mensais e iguais a partir da primeira data — a data da última parcela é calculada
          automaticamente (primeira parcela + número de parcelas). Depois de criado, você pode marcar cada parcela
          como paga, adiantar o pagamento de qualquer uma (inclusive a última) e ajustar o valor pago em caso de
          desconto por antecipação.
        </p>
        <div>
          <button type="submit" className="mc-btn-primary" style={{ border: "none", width: "100%" }}>
            Criar empréstimo
          </button>
        </div>
      </form>
    </div>
  );
}
