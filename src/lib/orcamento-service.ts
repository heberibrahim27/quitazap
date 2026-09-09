import { prisma } from "./prisma";
import { enviarPush } from "./push-service";
import { sendWhatsApp } from "./zapi";
import { calcularLimiteSeguro } from "./financeiro/limite-seguro";
import { responderLimiteSeguro } from "./ia/limite-seguro-resolver";

const TIPOS_GASTO = ["DESPESA_FIXA", "DESPESA_VARIAVEL", "COMPRA_CARTAO"] as const;

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const FUSO = "America/Sao_Paulo";

// Mesma âncora em Brasília usada no resto do Controle (ver cartoes/page.tsx,
// movimentacoes/page.tsx, page.tsx da home) — sem isso, um lançamento feito
// entre 21h-23h59 de Brasília (já virado de dia em UTC) contava pro mês
// errado aqui, podendo disparar o push de "orçamento estourado" no mês
// seguinte antes da hora.
function anoMesBrasil(data: Date): { ano: number; mes: number } {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
  })
    .format(data)
    .split("-")
    .map(Number);
  return { ano, mes };
}

function limitesDoMes(data: Date) {
  const { ano, mes } = anoMesBrasil(data);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1, 3, 0, 0, 0));
  return { inicio, fim };
}

// Percentual do limite mensal que dispara o aviso preventivo (antes de
// estourar de fato) — pesquisa de concorrentes (09/09/2026, ChatGPT +
// varredura de apps como FinanBot) mostrou que alertar só DEPOIS de
// estourar chega tarde demais pra o cliente ainda conseguir reagir a
// tempo; um aviso em 80% dá margem pra segurar o pé antes do limite.
export const PERCENTUAL_AVISO_PREVENTIVO = 0.8;

// Chamada logo depois de criar um Lancamento de gasto (despesa fixa,
// variável ou compra no cartão). Se a categoria tiver orçamento definido,
// manda no máximo um push por "faixa" cruzada nesta transação:
// - cruzou 80% do limite (e ainda não tinha estourado): aviso preventivo.
// - cruzou 100% do limite: aviso de estouro (sempre prevalece sobre o
//   preventivo — se uma única compra pular de 50% pra 120% do limite,
//   não faz sentido mandar os dois avisos, só o mais relevante).
// Em ambos os casos só dispara na transação que efetivamente cruzou a
// faixa (não repete a cada nova compra já acima dela).
export async function verificarOrcamentoEAvisar(
  clienteId: string,
  categoria: string | null | undefined,
  valorLancamento: number,
  dataLancamento: Date
): Promise<void> {
  if (!categoria) return;

  const orcamento = await prisma.orcamentoCategoria.findUnique({
    where: { clienteId_categoria: { clienteId, categoria } },
  });
  if (!orcamento || orcamento.limiteMensal <= 0) return;

  const { inicio, fim } = limitesDoMes(dataLancamento);
  const agregado = await prisma.lancamento.aggregate({
    where: { clienteId, categoria, tipo: { in: [...TIPOS_GASTO] }, data: { gte: inicio, lt: fim } },
    _sum: { valor: true },
  });

  const totalDepois = agregado._sum.valor ?? 0;
  const totalAntes = totalDepois - valorLancamento;
  const limite = orcamento.limiteMensal;

  const acabouDeEstourar = totalAntes <= limite && totalDepois > limite;
  if (acabouDeEstourar) {
    await enviarPush(clienteId, {
      titulo: "Orçamento estourado",
      corpo: `Você passou do limite de ${fmtValor(limite)} em ${categoria} este mês (já gastou ${fmtValor(totalDepois)}).`,
      url: "/minha-conta/gastos",
    });
    return;
  }

  const limitePreventivo = limite * PERCENTUAL_AVISO_PREVENTIVO;
  const acabouDeCruzarPreventivo = totalAntes <= limitePreventivo && totalDepois > limitePreventivo && totalDepois <= limite;
  if (acabouDeCruzarPreventivo) {
    await enviarPush(clienteId, {
      titulo: "Orçamento quase no limite",
      corpo: `Você já usou ${Math.round((totalDepois / limite) * 100)}% do limite de ${fmtValor(limite)} em ${categoria} este mês (gastou ${fmtValor(totalDepois)}).`,
      url: "/minha-conta/gastos",
    });
  }
}

// Chamada depois de QUALQUER lançamento confirmado (gasto ou receita) —
// pedido do Ibrahim (2026-09-06): quando o mês tá apertado (sobra prevista
// até o fim do mês já negativa), manda uma dica proativa. Reaproveita o
// motor determinístico que já existe pra isso (calcularLimiteSeguro +
// responderLimiteSeguro, o mesmo usado quando o cliente pergunta "quanto
// tenho até o próximo salário?") em vez de duplicar a lógica de detecção —
// só decide QUANDO mandar, a fórmula e o texto continuam vindo de lá.
//
// Sem controle de "já mandei hoje" — se o cliente lançar vários gastos no
// mesmo dia já no vermelho, pode repetir. Aceitável pra v1 (é sempre um
// aviso verdadeiro, nunca um falso positivo); revisitar se incomodar.
export async function verificarApertoEAvisar(clienteId: string | null | undefined): Promise<void> {
  if (!clienteId) return;

  try {
    const fatos = await calcularLimiteSeguro(clienteId);
    if (fatos.semDadosSuficientes || fatos.saldoLivre >= 0) return;

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { telefone: true, gratuito: true, aceitaProativas: true },
    });
    // Mensagem proativa (não é resposta direta a algo que o cliente acabou
    // de perguntar) — respeita o consentimento, igual lembrete de tarefa.
    if (!cliente || !cliente.aceitaProativas) return;

    const dica = await responderLimiteSeguro(clienteId, cliente.gratuito);
    await sendWhatsApp(cliente.telefone, `⚠️ ${dica}`);
  } catch (err) {
    console.error("[Aperto] Erro ao verificar/avisar:", err);
  }
}
