// ─────────────────────────────────────────
// QuitaZAP Controle — "Boleto Inteligente" (leitura de boleto em PDF)
// ─────────────────────────────────────────
// Reaproveita o pipeline de extração de PDF já existente (extrairPDF, em
// src/app/api/webhook/zapi/route.ts) — este módulo só cuida da prévia de
// confirmação e da persistência como Divida/Parcela, sem duplicar nenhuma
// extração ou cálculo. Fica isolado do state machine grande de
// controle-financeiro-flow.ts (ConfirmacaoPendenteControle) de propósito:
// é um fluxo de confirmação simples e único (sim/não sobre um documento),
// não uma continuação de conversa de texto — por isso guarda seu próprio
// estado em BotSessao.boletoPendente em vez de entrar no dividasTemp/
// confirmacaoPendente já usado por aquele fluxo.

import { prisma } from "@/lib/prisma";
import { normalizarTextoBusca } from "@/lib/descricao-financeira";
import { parseMoneyBR } from "@/lib/money";

export interface BoletoDetectado {
  beneficiario: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  linhaDigitavel: string | null;
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(vencimento: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(`${vencimento}T12:00:00`)
  );
}

export function boletoValido(b: Partial<BoletoDetectado>): b is BoletoDetectado {
  return (
    typeof b.beneficiario === "string" &&
    b.beneficiario.trim().length > 0 &&
    typeof b.valor === "number" &&
    b.valor > 0 &&
    typeof b.vencimento === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(b.vencimento) &&
    !Number.isNaN(new Date(`${b.vencimento}T12:00:00`).getTime())
  );
}

export function mensagemPreviaBoleto(b: BoletoDetectado): string {
  const linha = b.linhaDigitavel ? `\n🔢 Linha digitável: ${b.linhaDigitavel}` : "";
  return (
    `📄 Encontrei um boleto:\n\n` +
    `*${b.beneficiario}*\n` +
    `💰 ${fmt(b.valor)}\n` +
    `📅 Vence em ${fmtData(b.vencimento)}${linha}\n\n` +
    `Quer que eu salve isso como um compromisso no seu Controle? Responda *sim* ou *não*.`
  );
}

export function detectarRespostaBoleto(mensagem: string): "confirmar" | "negar" | null {
  const texto = normalizarTextoBusca(mensagem);
  if (/^(1|sim|s|confirmar|pode salvar|salvar|isso)$/.test(texto)) return "confirmar";
  if (/^(2|nao|n|cancelar|nao salvar|deixa)$/.test(texto)) return "negar";
  return null;
}

export async function salvarBoletoComoDivida(clienteId: string, b: BoletoDetectado): Promise<void> {
  const divida = await prisma.divida.create({
    data: {
      clienteId,
      credor: b.beneficiario,
      tipo: "BOLETO",
      status: "ATIVA",
      valorTotal: b.valor,
      totalParcelas: 1,
      obs: b.linhaDigitavel ? `Linha digitável: ${b.linhaDigitavel}` : null,
    },
  });
  await prisma.parcela.create({
    data: {
      dividaId: divida.id,
      numero: 1,
      valor: b.valor,
      vencimento: new Date(`${b.vencimento}T12:00:00`),
      status: "PENDENTE",
    },
  });
}

// parseMoneyBR reexportado só pra quem monta o BoletoDetectado a partir do
// texto solto que a IA às vezes devolve (ex: valor vindo como "R$ 150,00"
// em vez de número) sem precisar importar de dois lugares.
export { parseMoneyBR };
