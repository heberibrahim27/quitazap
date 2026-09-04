import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { NOMES_CARTOES_CONHECIDOS } from "@/lib/cartoes-conhecidos";

export default async function NovoCartaoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");
  const { erro } = await searchParams;

  async function criarCartao(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const banco = String(formData.get("banco") || "").trim();
    const nomePersonalizado = String(formData.get("nomePersonalizado") || "").trim();
    const nome = banco === "Outro" ? nomePersonalizado : banco;

    if (!nome) {
      redirect("/minha-conta/cartoes/novo?erro=Digite o nome do cartão.");
    }

    const diaFechamentoTexto = String(formData.get("diaFechamento") || "").trim();
    const diaVencimentoTexto = String(formData.get("diaVencimento") || "").trim();
    const limiteTexto = String(formData.get("limite") || "").trim().replace(",", ".");
    const diaFechamento = diaFechamentoTexto ? Number(diaFechamentoTexto) : null;
    const diaVencimento = diaVencimentoTexto ? Number(diaVencimentoTexto) : null;
    const limite = limiteTexto ? Number(limiteTexto) : null;

    // O <input min/max> só protege contra digitação normal — sem isso aqui,
    // um POST manual (ou DevTools) com dia fora de 1-31 ou limite negativo
    // ia parar direto no banco, e telas como "fatura fechada"/"disponível"
    // do Cartões passam a se comportar de forma sem sentido com esses
    // valores (ex: fatura sempre "fechada" com diaFechamento <= 0).
    if (diaFechamento != null && (!Number.isInteger(diaFechamento) || diaFechamento < 1 || diaFechamento > 31)) {
      redirect(`/minha-conta/cartoes/novo?erro=${encodeURIComponent("Dia de fechamento precisa ser um número entre 1 e 31.")}`);
    }
    if (diaVencimento != null && (!Number.isInteger(diaVencimento) || diaVencimento < 1 || diaVencimento > 31)) {
      redirect(`/minha-conta/cartoes/novo?erro=${encodeURIComponent("Dia de vencimento precisa ser um número entre 1 e 31.")}`);
    }
    if (limite != null && (!Number.isFinite(limite) || limite <= 0)) {
      redirect(`/minha-conta/cartoes/novo?erro=${encodeURIComponent("Limite precisa ser maior que zero.")}`);
    }

    try {
      await prisma.cartao.create({
        data: { clienteId: clienteAtual.id, nome, diaFechamento, diaVencimento, limite },
      });
    } catch (err: unknown) {
      // P2002: já existe um cartão com esse nome pra esse cliente (constraint única).
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        redirect(`/minha-conta/cartoes/novo?erro=${encodeURIComponent(`Você já tem um cartão chamado "${nome}".`)}`);
      }
      console.error("[MINHA-CONTA] Erro ao criar cartão:", err);
      redirect("/minha-conta/cartoes/novo?erro=Não foi possível salvar o cartão. Tente de novo.");
    }

    revalidatePath("/minha-conta", "layout");
    redirect("/minha-conta/cartoes");
  }

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>
          </span>
          <span className="title-label">Novo cartão</span>
        </p>
      </div>

      {erro && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--red-soft)", border: "1px solid rgba(226,59,92,0.25)" }}>
          <p style={{ margin: 0, color: "var(--red)", fontSize: 13.5, fontWeight: 600 }}>{erro}</p>
        </div>
      )}

      <form action={criarCartao} className="mc-form-card">
        <label className="mc-label">
          Banco / instituição
          <select name="banco" required defaultValue="" className="mc-input">
            <option value="" disabled>Selecione o banco do cartão</option>
            {NOMES_CARTOES_CONHECIDOS.map((nome) => (
              <option key={nome} value={nome}>{nome}</option>
            ))}
            <option value="Outro">Outro banco</option>
          </select>
        </label>

        <label className="mc-label">
          Nome personalizado (só se escolheu &ldquo;Outro banco&rdquo; acima)
          <input name="nomePersonalizado" placeholder="Ex: Cartão da loja X" className="mc-input" />
        </label>

        <label className="mc-label">
          Dia de fechamento da fatura
          <input name="diaFechamento" type="number" min={1} max={31} placeholder="Ex: 20" className="mc-input" />
        </label>

        <label className="mc-label">
          Dia de vencimento da fatura
          <input name="diaVencimento" type="number" min={1} max={31} placeholder="Ex: 27" className="mc-input" />
        </label>

        <label className="mc-label">
          Limite total do cartão
          <input name="limite" type="text" inputMode="decimal" placeholder="Ex: 3.000,00" className="mc-input" />
        </label>

        <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
          <button type="submit" className="mc-btn-primary" style={{ border: "none" }}>
            Salvar cartão
          </button>
          <Link href="/minha-conta/cartoes" className="mc-btn-secondary">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
