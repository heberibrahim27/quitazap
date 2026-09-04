"use server";

import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { verificarOrcamentoEAvisar } from "@/lib/orcamento-service";

// Ações "rápidas" chamadas pelo sheet do botão "+" (BottomNav), disponível
// em qualquer página — por isso não usam redirect nem dependem de
// searchParams de uma página específica (mês/aba): devolvem {erro} pro
// componente decidir o que mostrar, e quem chama decide se atualiza a
// página atual (router.refresh()) depois de fechar o sheet.

export async function criarDespesaRapida(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const descricao = String(formData.get("descricao") || "").trim();
  const categoria = String(formData.get("categoria") || "Outros").trim();
  const valorTexto = String(formData.get("valor") || "").replace(",", ".").trim();
  const valor = Number(valorTexto);
  const dataTexto = String(formData.get("data") || "");
  const recorrente = formData.get("recorrente") === "on";
  const tipoSelecionado = String(formData.get("tipo") || "DESPESA_VARIAVEL");
  const cartaoIdTexto = String(formData.get("cartaoId") || "").trim();
  const parcelasTexto = String(formData.get("parcelas") || "1").trim();
  const parcelas = Math.round(Number(parcelasTexto)) || 1;

  if (!descricao || !Number.isFinite(valor) || valor <= 0) {
    return { erro: "Descrição e valor (maior que zero) são obrigatórios." };
  }
  if (parcelas < 1 || parcelas > 48) {
    return { erro: "Quantidade de parcelas inválida (entre 1 e 48)." };
  }

  let cartaoId: string | null = null;
  if (cartaoIdTexto) {
    const cartao = await prisma.cartao.findUnique({ where: { id: cartaoIdTexto } });
    if (!cartao || cartao.clienteId !== cliente.id) return { erro: "Cartão inválido." };
    cartaoId = cartaoIdTexto;
  }

  const tipo = cartaoId ? "COMPRA_CARTAO" : tipoSelecionado === "DESPESA_FIXA" ? "DESPESA_FIXA" : "DESPESA_VARIAVEL";
  const dataLancamento = dataTexto ? new Date(`${dataTexto}T12:00:00`) : new Date();

  // Compra parcelada no cartão vira N lançamentos, um por mês — cada fatura
  // futura já mostra a parcela certa sem precisar duma lógica separada de
  // "compra parcelada" nas telas de Cartões/Gastos/Plano (elas só somam
  // lançamentos por mês). O valor é dividido em centavos e o resto da
  // divisão inteira fica na última parcela, pra soma bater exatamente com
  // o valor total digitado.
  const parcelarNoCartao = cartaoId != null && parcelas > 1;
  const totalCentavos = Math.round(valor * 100);
  const centavosPorParcela = Math.floor(totalCentavos / parcelas);
  const restoCentavos = totalCentavos - centavosPorParcela * parcelas;

  if (parcelarNoCartao) {
    await prisma.lancamento.createMany({
      data: Array.from({ length: parcelas }, (_, i) => {
        const dataParcela = new Date(dataLancamento);
        dataParcela.setMonth(dataParcela.getMonth() + i);
        const valorParcela = (centavosPorParcela + (i === parcelas - 1 ? restoCentavos : 0)) / 100;
        return {
          clienteId: cliente.id,
          tipo,
          descricao: `${descricao} (${i + 1}/${parcelas})`,
          categoria,
          valor: valorParcela,
          data: dataParcela,
          recorrente: false,
          cartaoId,
          origem: "WEB",
        };
      }),
    });
  } else {
    await prisma.lancamento.create({
      data: {
        clienteId: cliente.id,
        tipo,
        descricao,
        categoria,
        valor,
        data: dataLancamento,
        recorrente,
        cartaoId,
        origem: "WEB",
      },
    });
  }

  // No caso parcelado, só a 1ª parcela pesa no orçamento deste mês — as
  // demais só vão contar quando o mês delas chegar.
  const valorParaOrcamento = parcelarNoCartao ? centavosPorParcela / 100 : valor;
  await verificarOrcamentoEAvisar(cliente.id, categoria, valorParaOrcamento, dataLancamento).catch((err) =>
    console.error("[LANCAMENTO] Erro ao verificar orçamento:", err)
  );

  revalidatePath("/minha-conta", "layout");
  revalidatePath("/minha-conta/despesas");
  revalidatePath("/minha-conta/plano");
  revalidatePath("/minha-conta/movimentacoes");
  revalidatePath("/minha-conta/gastos");
  if (cartaoId) revalidatePath("/minha-conta/cartoes");
  return {};
}

export async function criarReceitaRapida(formData: FormData): Promise<{ erro?: string }> {
  const cliente = await getClienteAtual();
  if (!cliente) return { erro: "Sessão expirada. Entre novamente." };

  const descricao = String(formData.get("descricao") || "").trim();
  const valorTexto = String(formData.get("valor") || "").replace(",", ".").trim();
  const valor = Number(valorTexto);
  const dataTexto = String(formData.get("data") || "");
  const recorrente = formData.get("recorrente") === "on";

  if (!descricao || !Number.isFinite(valor) || valor <= 0) {
    return { erro: "Descrição e valor (maior que zero) são obrigatórios." };
  }

  await prisma.lancamento.create({
    data: {
      clienteId: cliente.id,
      tipo: "RECEITA",
      descricao,
      valor,
      data: dataTexto ? new Date(`${dataTexto}T12:00:00`) : new Date(),
      recorrente,
      origem: "WEB",
    },
  });

  // Receita alimenta a Renda usada no Dashboard e no Plano de Pagamento
  // inteiro — sem isso, os dois continuam mostrando os números antigos
  // até o cache expirar sozinho.
  revalidatePath("/minha-conta", "layout");
  revalidatePath("/minha-conta/receitas");
  revalidatePath("/minha-conta/plano");
  revalidatePath("/minha-conta/movimentacoes");
  return {};
}
