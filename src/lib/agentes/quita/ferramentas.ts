// ─────────────────────────────────────────
// Ferramentas de LEITURA do agente Quita
// ─────────────────────────────────────────
// Cada ferramenta embrulha uma consulta determinística que já existe (ou lê
// o banco direto) e devolve TEXTO com os números prontos. Nenhuma altera
// dado. Escrita (desfazer, lembrete, depositar em meta) não é exposta ao
// LLM — continua em fluxo determinístico com confirmação.

import { skillRegistry } from "@/lib/agentes/skills";
import { responderConsultaFatura } from "@/lib/financeiro/fatura-cartao-consulta";
import { responderConsultaFinanceira } from "@/lib/ia/consulta-financeira-resolver";
import { responderLimiteSeguro } from "@/lib/ia/limite-seguro-resolver";
import { responderRotaDividas } from "@/lib/ia/rota-dividas-resolver";
import { responderPlanoPagamento } from "@/lib/ia/plano-pagamento-resolver";
import { responderConsultaVazamentos } from "@/lib/ia/vazamentos-resolver";

const LIMITE_TEXTO = 2200;

const SEM_PARAMETROS = { type: "object", properties: {}, additionalProperties: false };

function def(name: string, description: string, parameters: Record<string, unknown> = SEM_PARAMETROS) {
  return { type: "function" as const, function: { name, description, parameters } };
}

export const DEFINICOES_FERRAMENTAS = [
  def("resumo_do_mes", "Entradas, despesas (fixas, variáveis, cartão), parcelas de dívidas, resultado do mês e valor guardado em metas, do mês atual."),
  def("limite_seguro", "Quanto o cliente pode gastar por dia até o fim do mês/próximo salário, e a sobra prevista."),
  def("faturas_dos_cartoes", "Faturas dos cartões pelo ciclo de fechamento (aberta, anterior, próxima), com datas de fechamento e vencimento."),
  def("orcamento_por_categoria", "Orçamento mensal por categoria: quanto já gastou do limite de cada categoria neste mês."),
  def("gastos_por_categoria", "Em quais categorias o cliente mais gasta neste mês."),
  def("compromissos_proximos", "Contas, lembretes de pagamento e parcelas de dívida que vencem nos próximos 30 dias."),
  def("metas", "Metas (cofrinhos) do cliente: quanto já guardou de cada uma."),
  def(
    "posso_gastar",
    "Única autoridade para a pergunta 'posso/consigo gastar R$ X?'. Devolve a conclusão calculada pelo sistema.",
    { type: "object", properties: { valor: { type: "number", description: "Valor em reais que o cliente quer gastar." } }, required: ["valor"], additionalProperties: false }
  ),
  def("rota_dividas", "Qual dívida pagar primeiro e como sair das dívidas."),
  def("plano_pagamento", "Plano de quais contas pagar neste mês e em que ordem."),
  def("dica_de_economia", "Uma dica de economia calculada pelo sistema (maior categoria do mês e quanto 10% dela libera). Use quando o cliente pedir pra economizar ou cortar gastos."),
  def("assinaturas_recorrentes", "Assinaturas e gastos recorrentes que o cliente paga."),
  def("orientar_quitacao", "Orientador de Quitação. Use quando o cliente perguntar como sair das dívidas, o que fazer com a sobra, qual dívida pagar primeiro ou como organizar o pagamento. Devolve o diagnóstico e o que fazer AGORA / DEPOIS / PRÓXIMO ALVO."),
  def(
    "simular_pagamento_extra",
    "Simula 'e se eu pagar R$ X a mais por mês?' na dívida que está na frente da fila: em quantos meses ela termina.",
    { type: "object", properties: { valor: { type: "number", description: "Valor extra por mês, em reais." } }, required: ["valor"], additionalProperties: false }
  ),
];

export const NOMES_FERRAMENTAS = DEFINICOES_FERRAMENTAS.map((d) => d.function.name);

/** Executor de ferramentas pra um cliente. Só leitura. */
export function criarExecutorFerramentas(clienteId: string, gratuito: boolean, agora: Date = new Date()) {
  const ctx = { userId: clienteId, timezone: "America/Sao_Paulo", channel: "app" as const, gratuito };
  // Leituras que também são skills do registro (fonte única, testada).
  const viaRegistro = async (skill: string): Promise<string> => {
    const r = await skillRegistry.run<{ texto: string }>(skill, ctx, { agora: agora.toISOString() });
    return r.ok ? r.data.texto : "Não consegui consultar isso agora.";
  };

  return async function executar(nome: string, args: Record<string, unknown>): Promise<string> {
    let texto: string;
    switch (nome) {
      case "resumo_do_mes":
        texto = await viaRegistro("consultar_resumo_mes");
        break;
      case "limite_seguro":
        texto = await responderLimiteSeguro(clienteId, gratuito);
        break;
      case "faturas_dos_cartoes":
        texto = await responderConsultaFatura(clienteId, "faturas dos cartoes", agora);
        break;
      case "orcamento_por_categoria":
        texto = await viaRegistro("consultar_orcamento");
        break;
      case "gastos_por_categoria":
        texto = await responderConsultaFinanceira("onde_gasto_mais", clienteId, "onde gasto mais", gratuito);
        break;
      case "compromissos_proximos":
        texto = await viaRegistro("consultar_compromissos");
        break;
      case "metas":
        texto = await viaRegistro("consultar_metas");
        break;
      case "dica_de_economia":
        texto = await viaRegistro("consultar_dica_economia");
        break;
      case "posso_gastar": {
        const valor = Number(args.valor);
        if (!Number.isFinite(valor) || valor <= 0) return "Informe o valor em reais (maior que zero).";
        texto = await responderConsultaFinanceira("posso_gastar", clienteId, `posso gastar ${String(valor).replace(".", ",")}`, gratuito);
        break;
      }
      case "rota_dividas":
        texto = await responderRotaDividas(clienteId, gratuito);
        break;
      case "plano_pagamento":
        texto = await responderPlanoPagamento(clienteId, gratuito);
        break;
      case "orientar_quitacao":
        texto = await viaRegistro("orientar_quitacao");
        break;
      case "simular_pagamento_extra": {
        const valor = Number(args.valor);
        if (!Number.isFinite(valor) || valor <= 0) return "Informe o valor extra por mês (maior que zero).";
        const r = await skillRegistry.run<{ texto: string }>("simular_pagamento_extra", ctx, { valor, agora: agora.toISOString() });
        texto = r.ok ? r.data.texto : "Não consegui simular isso agora.";
        break;
      }
      case "assinaturas_recorrentes":
        texto = await responderConsultaVazamentos(clienteId, gratuito);
        break;
      default:
        return "Ferramenta indisponível.";
    }
    return texto.length > LIMITE_TEXTO ? `${texto.slice(0, LIMITE_TEXTO)}…` : texto;
  };
}
