import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { ExcluirForm } from "@/components/ExcluirForm";
import { NOMES_CARTOES_CONHECIDOS } from "@/lib/cartoes-conhecidos";
import type { Cartao } from "@prisma/client";

// Mesmo cuidado do editar-lançamento: nunca confia só no id, sempre confere
// o dono, pra um cliente não conseguir editar/apagar cartão de outro.
async function carregarCartaoDoDono(id: string): Promise<Cartao> {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const cartao = await prisma.cartao.findUnique({ where: { id } });
  if (!cartao || cartao.clienteId !== cliente.id) notFound();

  return cartao;
}

export default async function EditarCartaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { id } = await params;
  const cartao = await carregarCartaoDoDono(id);
  const { erro } = await searchParams;

  async function salvarCartao(formData: FormData) {
    "use server";
    await carregarCartaoDoDono(id);

    const banco = String(formData.get("banco") || "").trim();
    const nomePersonalizado = String(formData.get("nomePersonalizado") || "").trim();
    const nome = banco === "Outro" ? nomePersonalizado : banco;
    if (!nome) {
      redirect(`/minha-conta/cartoes/${id}/editar?erro=${encodeURIComponent("Digite o nome do cartão.")}`);
    }

    const diaFechamentoTexto = String(formData.get("diaFechamento") || "").trim();
    const diaVencimentoTexto = String(formData.get("diaVencimento") || "").trim();
    const limiteTexto = String(formData.get("limite") || "").trim().replace(",", ".");
    const diaFechamento = diaFechamentoTexto ? Number(diaFechamentoTexto) : null;
    const diaVencimento = diaVencimentoTexto ? Number(diaVencimentoTexto) : null;
    const limite = limiteTexto ? Number(limiteTexto) : null;

    // Mesma trava do cadastro (cartoes/novo) — o <input min/max> só protege
    // contra digitação normal, não contra um POST manual fora da faixa.
    if (diaFechamento != null && (!Number.isInteger(diaFechamento) || diaFechamento < 1 || diaFechamento > 31)) {
      redirect(`/minha-conta/cartoes/${id}/editar?erro=${encodeURIComponent("Dia de fechamento precisa ser um número entre 1 e 31.")}`);
    }
    if (diaVencimento != null && (!Number.isInteger(diaVencimento) || diaVencimento < 1 || diaVencimento > 31)) {
      redirect(`/minha-conta/cartoes/${id}/editar?erro=${encodeURIComponent("Dia de vencimento precisa ser um número entre 1 e 31.")}`);
    }
    if (limite != null && (!Number.isFinite(limite) || limite <= 0)) {
      redirect(`/minha-conta/cartoes/${id}/editar?erro=${encodeURIComponent("Limite precisa ser maior que zero.")}`);
    }

    try {
      await prisma.cartao.update({
        where: { id },
        data: { nome, diaFechamento, diaVencimento, limite },
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        redirect(`/minha-conta/cartoes/${id}/editar?erro=${encodeURIComponent(`Você já tem um cartão chamado "${nome}".`)}`);
      }
      console.error("[MINHA-CONTA] Erro ao salvar cartão:", err);
      redirect(`/minha-conta/cartoes/${id}/editar?erro=${encodeURIComponent("Não foi possível salvar. Tente de novo.")}`);
    }

    revalidatePath("/minha-conta/cartoes");
    revalidatePath("/minha-conta");
    redirect("/minha-conta/cartoes");
  }

  async function apagarCartao(_fd: FormData) {
    "use server";
    await carregarCartaoDoDono(id);
    // Lançamentos que apontavam pra esse cartão ficam com cartaoId nulo
    // (onDelete: SetNull no schema) — não é preciso apagar nada mais.
    try {
      await prisma.cartao.delete({ where: { id } });
      revalidatePath("/minha-conta/cartoes");
      revalidatePath("/minha-conta");
    } catch (err) {
      console.error("[MINHA-CONTA] Erro ao apagar cartão:", err);
    }
    redirect("/minha-conta/cartoes");
  }

  const nomeConhecido = NOMES_CARTOES_CONHECIDOS.includes(cartao.nome) ? cartao.nome : "Outro";

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Editar cartão</h1>
        <p style={{ color: "var(--ink-dim)", marginTop: 4 }}>{cartao.nome}</p>
      </div>

      {erro && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--red-soft)", border: "1px solid rgba(226,59,92,0.25)" }}>
          <p style={{ margin: 0, color: "var(--red)", fontSize: 13.5, fontWeight: 600 }}>{erro}</p>
        </div>
      )}

      <form action={salvarCartao} className="mc-form-card" style={{ marginBottom: 16 }}>
        <label className="mc-label">
          Banco / instituição
          <select name="banco" defaultValue={nomeConhecido} className="mc-input">
            {NOMES_CARTOES_CONHECIDOS.map((nome) => (
              <option key={nome} value={nome}>{nome}</option>
            ))}
            <option value="Outro">Outro banco</option>
          </select>
        </label>

        <label className="mc-label">
          Nome personalizado (só se escolheu &ldquo;Outro banco&rdquo; acima)
          <input name="nomePersonalizado" defaultValue={nomeConhecido === "Outro" ? cartao.nome : ""} placeholder="Ex: Cartão da loja X" className="mc-input" />
        </label>

        <label className="mc-label">
          Dia de fechamento da fatura
          <input name="diaFechamento" type="number" min={1} max={31} defaultValue={cartao.diaFechamento ?? ""} className="mc-input" />
        </label>

        <label className="mc-label">
          Dia de vencimento da fatura
          <input name="diaVencimento" type="number" min={1} max={31} defaultValue={cartao.diaVencimento ?? ""} className="mc-input" />
        </label>

        <label className="mc-label">
          Limite total do cartão
          <input
            name="limite"
            type="text"
            inputMode="decimal"
            placeholder="Ex: 3.000,00"
            defaultValue={cartao.limite != null ? cartao.limite.toFixed(2).replace(".", ",") : ""}
            className="mc-input"
          />
        </label>

        <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
          <button type="submit" className="mc-btn-primary" style={{ border: "none" }}>
            Salvar alterações
          </button>
          <Link href="/minha-conta/cartoes" className="mc-btn-secondary">
            Cancelar
          </Link>
        </div>
      </form>

      <ExcluirForm
        action={apagarCartao}
        mensagem={`Apagar o cartão "${cartao.nome}"? Os lançamentos já registrados continuam, só deixam de estar ligados a este cartão.`}
        label="Apagar cartão"
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
