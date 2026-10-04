import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { ExcluirForm } from "@/components/ExcluirForm";
import { ParcelasAccordion } from "./ParcelasAccordion";
import { ParcelasLista } from "./ParcelasLista";
import { marcarParcelasPagasAte } from "@/lib/divida-service";
import { diasCalendarioBrasil } from "@/lib/financeiro/dias-brasil";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Mesmo cuidado das outras telas de editar: nunca confia só no id, sempre
// confere o dono (via a dívida) antes de deixar ler/mexer na parcela.
async function carregarParcelaDoDono(parcelaId: string, clienteId: string) {
  const parcela = await prisma.parcela.findUnique({ where: { id: parcelaId }, include: { divida: true } });
  if (!parcela || parcela.divida.clienteId !== clienteId) return null;
  return parcela;
}

async function atualizarStatusSeQuitado(dividaId: string) {
  const restantes = await prisma.parcela.count({ where: { dividaId, status: { not: "PAGA" } } });
  if (restantes === 0) {
    await prisma.divida.update({ where: { id: dividaId }, data: { status: "QUITADA" } });
  }
}

export default async function DetalheEmprestimoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; parcelasAbertas?: string }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { id } = await params;
  const { erro, parcelasAbertas } = await searchParams;

  const emprestimo = await prisma.divida.findUnique({
    where: { id },
    include: { parcelas: { orderBy: { numero: "asc" } } },
  });
  if (!emprestimo || emprestimo.clienteId !== cliente.id || emprestimo.tipo !== "EMPRESTIMO") notFound();

  async function marcarParcelaPaga(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const parcelaId = String(formData.get("parcelaId") || "");
    const valorPago = Number(String(formData.get("valorPago") || "").replace(",", "."));
    const parcela = await carregarParcelaDoDono(parcelaId, clienteAtual.id);
    if (!parcela) notFound();

    if (!Number.isFinite(valorPago) || valorPago <= 0) {
      redirect(`/minha-conta/emprestimos/${parcela.dividaId}?parcelasAbertas=1&erro=${encodeURIComponent("Digite um valor pago válido.")}`);
    }

    // updateMany com status na cláusula where evita corrida de duplo toque:
    // se "marcar paga" disparar duas vezes rápido (ex: conexão lenta), só a
    // primeira chamada realmente encontra a parcela ainda não-paga e soma
    // no valorPago da dívida — a segunda não acha nada pra atualizar e não
    // soma de novo (sem isso, o saldo devedor ficava artificialmente baixo).
    const jaEstavaPaga = await prisma.$transaction(async (tx) => {
      const resultado = await tx.parcela.updateMany({
        where: { id: parcelaId, status: { not: "PAGA" } },
        data: { status: "PAGA", valor: valorPago },
      });
      if (resultado.count === 0) return true;
      await tx.divida.update({ where: { id: parcela.dividaId }, data: { valorPago: { increment: valorPago } } });
      return false;
    });

    if (jaEstavaPaga) {
      redirect(`/minha-conta/emprestimos/${parcela.dividaId}?parcelasAbertas=1&erro=${encodeURIComponent("Essa parcela já estava marcada como paga.")}`);
    }

    await atualizarStatusSeQuitado(parcela.dividaId);

    // "layout" já cobre emprestimos, a dívida específica e dividas — todos
    // nested sob /minha-conta. parcelasAbertas=1 mantém o accordion de
    // parcelas aberto depois do redirect — sem isso, o cliente marcava uma
    // parcela paga e a lista fechava sozinha, tendo que abrir de novo pra
    // conferir o resultado.
    revalidatePath("/minha-conta", "layout");
    redirect(`/minha-conta/emprestimos/${parcela.dividaId}?parcelasAbertas=1`);
  }

  // Paga várias parcelas PENDENTES de uma vez, cada uma pelo valor já
  // agendado (sem pedir valor customizado por parcela, que não faria
  // sentido numa seleção múltipla). Mesmo padrão race-safe do pagamento
  // individual, uma parcela por vez dentro da mesma transação.
  async function pagarVariasParcelas(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const parcelaIds = formData.getAll("parcelaId").map((v) => String(v)).filter(Boolean);
    if (parcelaIds.length === 0) redirect(`/minha-conta/emprestimos/${id}?parcelasAbertas=1`);

    let dividaId: string | null = null;
    let algumaPaga = false;

    await prisma.$transaction(async (tx) => {
      for (const parcelaId of parcelaIds) {
        const parcela = await tx.parcela.findUnique({ where: { id: parcelaId }, include: { divida: true } });
        if (!parcela || parcela.divida.clienteId !== clienteAtual.id) continue;
        dividaId = parcela.dividaId;

        const resultado = await tx.parcela.updateMany({
          where: { id: parcelaId, status: { not: "PAGA" } },
          data: { status: "PAGA" },
        });
        if (resultado.count === 0) continue;
        await tx.divida.update({ where: { id: parcela.dividaId }, data: { valorPago: { increment: parcela.valor } } });
        algumaPaga = true;
      }
    });

    if (!dividaId) redirect(`/minha-conta/emprestimos/${id}?parcelasAbertas=1`);
    if (algumaPaga) await atualizarStatusSeQuitado(dividaId);

    revalidatePath("/minha-conta", "layout");
    redirect(`/minha-conta/emprestimos/${dividaId}?parcelasAbertas=1`);
  }

  // "Já paguei até a parcela N": marca 1..N de uma vez (empréstimo cadastrado depois
  // de andar um tempo, ou parcelas que o cliente pagou fora do app).
  async function pagarAteParcela(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const resultado = await marcarParcelasPagasAte({
      clienteId: clienteAtual.id,
      dividaId: id,
      ate: Number(String(formData.get("ate") || "").trim()),
    });
    if (!resultado.ok) {
      redirect(`/minha-conta/emprestimos/${id}?parcelasAbertas=1&erro=${encodeURIComponent(resultado.erro)}`);
    }

    revalidatePath("/minha-conta", "layout");
    redirect(`/minha-conta/emprestimos/${id}?parcelasAbertas=1`);
  }

  // Consignado = desconto direto na folha: o valor já está fora do salário líquido, então o
  // plano de pagamento e a sobra do mês não contam essa parcela de novo. Dá pra ligar/desligar
  // depois de cadastrado (contratos antigos foram criados sem essa marcação).
  async function definirConsignado(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const atual = await prisma.divida.findUnique({ where: { id } });
    if (!atual || atual.clienteId !== clienteAtual.id || atual.tipo !== "EMPRESTIMO") notFound();

    await prisma.divida.update({ where: { id }, data: { descontadoEmFolha: String(formData.get("consignado")) === "1" } });

    revalidatePath("/minha-conta", "layout");
    redirect(`/minha-conta/emprestimos/${id}`);
  }

  async function desfazerPagamento(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const parcelaId = String(formData.get("parcelaId") || "");
    const parcela = await carregarParcelaDoDono(parcelaId, clienteAtual.id);
    if (!parcela) notFound();

    // Mesma trava do marcarParcelaPaga, no sentido contrário: só decrementa
    // se a parcela realmente estava PAGA no momento do update.
    await prisma.$transaction(async (tx) => {
      const resultado = await tx.parcela.updateMany({
        where: { id: parcelaId, status: "PAGA" },
        data: { status: "PENDENTE" },
      });
      if (resultado.count === 0) return;
      await tx.divida.update({ where: { id: parcela.dividaId }, data: { valorPago: { decrement: parcela.valor } } });
    });
    await prisma.divida.update({ where: { id: parcela.dividaId }, data: { status: "ATIVA" } });

    revalidatePath("/minha-conta", "layout");
    redirect(`/minha-conta/emprestimos/${parcela.dividaId}?parcelasAbertas=1`);
  }

  async function apagarEmprestimo(_fd: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");
    const atual = await prisma.divida.findUnique({ where: { id } });
    if (!atual || atual.clienteId !== clienteAtual.id) notFound();

    await prisma.divida.delete({ where: { id } });

    revalidatePath("/minha-conta", "layout");
    redirect("/minha-conta/emprestimos");
  }

  const saldoDevedor = emprestimo.valorTotal - emprestimo.valorPago;
  const parcelasPagas = emprestimo.parcelas.filter((p) => p.status === "PAGA").length;
  const totalDasParcelas = emprestimo.parcelas.reduce((soma, p) => soma + p.valor, 0);
  const jurosTotal = Math.round((totalDasParcelas - emprestimo.valorTotal) * 100) / 100;
  const proximaParcela = emprestimo.parcelas
    .filter((p) => p.status === "PENDENTE")
    .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())[0];

  // Parcelas em aberto cujo vencimento já passou: provavelmente já foram pagas, só não foram marcadas.
  const hojeRef = new Date();
  const vencidasAbertas = emprestimo.parcelas.filter((p) => p.status !== "PAGA" && diasCalendarioBrasil(p.vencimento, hojeRef) < 0);
  const ultimaVencida = vencidasAbertas[vencidasAbertas.length - 1];

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <Link href="/minha-conta/emprestimos" style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>
          ‹ Empréstimos
        </Link>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "8px 0 0" }}>{emprestimo.credor}</h1>
        <p style={{ color: "var(--ink-dim)", marginTop: 4 }}>
          {parcelasPagas}/{emprestimo.totalParcelas ?? emprestimo.parcelas.length} parcelas pagas
          {emprestimo.status === "QUITADA" && <span style={{ color: "var(--green)", fontWeight: 700 }}> · Quitado 🎉</span>}
        </p>
      </div>

      {erro && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--red-soft)", border: "1px solid rgba(226,59,92,0.25)" }}>
          <p style={{ margin: 0, color: "var(--red)", fontSize: 13.5, fontWeight: 600 }}>{erro}</p>
        </div>
      )}

      {vencidasAbertas.length > 0 && ultimaVencida && (
        <section className="emp-vencidas">
          <p className="emp-vencidas-titulo">
            {vencidasAbertas.length} parcela{vencidasAbertas.length === 1 ? "" : "s"} já venceu{vencidasAbertas.length === 1 ? "" : "ram"} e {vencidasAbertas.length === 1 ? "está" : "estão"} em aberto
          </p>
          <p className="emp-vencidas-texto">
            De {fmtData(vencidasAbertas[0].vencimento)} a {fmtData(ultimaVencida.vencimento)}. Se você já pagou essas parcelas, marque todas de uma vez em vez de uma por uma.
          </p>
          <form action={pagarAteParcela} className="emp-vencidas-form">
            <label>
              Já paguei até a parcela
              <input name="ate" type="number" min={1} max={emprestimo.parcelas.length} defaultValue={ultimaVencida.numero} className="mc-input" />
            </label>
            <button type="submit" className="mc-btn-primary" style={{ border: "none" }}>Marcar como pagas</button>
          </form>
          <p className="emp-vencidas-nota">Se alguma ainda está em atraso, deixe em aberto — dá para marcar uma por uma na lista de parcelas.</p>
        </section>
      )}

      <div className="mc-card" style={{ marginBottom: 16, display: "flex", gap: 24, flexWrap: "wrap" }}>
        {proximaParcela && (
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Parcela mensal</p>
            <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: "var(--blue)" }}>
              {fmtValor(proximaParcela.valor)}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--ink-faint)" }}>
              vence {proximaParcela.vencimento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </p>
          </div>
        )}
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Falta pagar</p>
          <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: saldoDevedor > 0 ? "var(--red)" : "var(--green)" }}>
            {fmtValor(saldoDevedor)}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Total do empréstimo</p>
          <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: "var(--ink)" }}>
            {fmtValor(emprestimo.valorTotal)}
          </p>
        </div>
        {jurosTotal > 0.01 && (
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Juros total</p>
            <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: "var(--orange)" }}>
              {fmtValor(jurosTotal)}
            </p>
          </div>
        )}
      </div>

      <section className="emp-consignado">
        <div>
          <p className="emp-consignado-titulo">
            {emprestimo.descontadoEmFolha ? "Consignado (desconto em folha)" : "Pago por fora da folha"}
          </p>
          <p className="emp-consignado-texto">
            {emprestimo.descontadoEmFolha
              ? "A parcela já sai do seu salário, então não é contada de novo na sua sobra do mês."
              : "A parcela é contada no seu plano de pagamento e na sobra do mês. Se ela é descontada direto no contracheque, marque como consignado."}
          </p>
        </div>
        <form action={definirConsignado}>
          <input type="hidden" name="consignado" value={emprestimo.descontadoEmFolha ? "0" : "1"} />
          <button type="submit" className="mc-btn-secondary" style={{ whiteSpace: "nowrap" }}>
            {emprestimo.descontadoEmFolha ? "Desmarcar" : "Marcar consignado"}
          </button>
        </form>
      </section>

      <div className="card-head">
        <p className="card-title" style={{ fontSize: 14 }}>
          <span className="title-label">Parcelas</span>
        </p>
      </div>
      <ParcelasAccordion
        defaultAberto={parcelasAbertas === "1"}
        resumo={
          emprestimo.parcelas.length === 0
            ? "Nenhuma parcela cadastrada"
            : `${parcelasPagas} de ${emprestimo.parcelas.length} parcelas pagas — toque para ver`
        }
      >
        <ParcelasLista
          parcelas={emprestimo.parcelas.map((p) => ({
            id: p.id,
            numero: p.numero,
            valor: p.valor,
            vencimentoFmt: fmtData(p.vencimento),
            status: p.status,
          }))}
          marcarParcelaPaga={marcarParcelaPaga}
          desfazerPagamento={desfazerPagamento}
          pagarVariasParcelas={pagarVariasParcelas}
        />
      </ParcelasAccordion>

      <div style={{ marginTop: 16 }}>
        <ExcluirForm
          action={apagarEmprestimo}
          mensagem={`Apagar o empréstimo "${emprestimo.credor}"? Todas as parcelas (pagas e pendentes) serão apagadas junto. Essa ação não pode ser desfeita.`}
          label="Apagar empréstimo"
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
    </div>
  );
}
