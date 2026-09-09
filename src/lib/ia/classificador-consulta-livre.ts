// ─────────────────────────────────────────
// QuitaZAP — Classificador de fallback pra consultas em linguagem livre
// (Skill Analista — "treinamento contínuo", pedido do Ibrahim, 09/2026)
// ─────────────────────────────────────────
// Problema real encontrado ao vivo: as 8 skills de consulta (financeira,
// simulador, limite seguro, rota dívidas, meta/prazo, plano pagamento,
// vazamentos, horas trabalho) só disparam se o REGEX de cada uma bater
// (ver detectarX em cada resolver). Se o cliente perguntar o saldo/gasto
// de um jeito que nenhum regex previu, o bot nunca chama IA nenhuma pra
// tentar entender — cai direto no "rescue ladder" (rescue-classificador.ts
// via ai-bot.ts), que é só um menu fixo "1-gasto 2-renda 3-dívida 4-outro"
// e nem tem opção de consulta. Ou seja: fora do vocabulário exato dos
// regex, o bot "não entende só o que já tem pré-programado" — exatamente
// a queixa do Ibrahim.
//
// Consultado com ChatGPT (revisão de arquitetura, 09/2026) antes de
// implementar — decisões que vieram dessa revisão:
//
// 1) NÃO virar "aprendizado automático" (usuário corrige → sistema muda
//    prompt/regra sozinho) — risco real em produto financeiro: um cliente
//    pode ensinar uma interpretação errada e contaminar os próximos. Isso
//    fica pra uma Fase 2 (proposta, não implementada agora): tabela de
//    exemplos aprovados + correção do usuário como sinal de treino +
//    central de aprovação no admin — sempre com humano no loop antes de
//    virar regra nova. O que ESTE arquivo faz é só um roteador de fallback
//    mais inteligente, chamado a cada mensagem — nada fica "aprendido"
//    entre uma mensagem e outra.
//
// 2) Roda por ÚLTIMO na cascata do webhook, não logo após os 8 regex —
//    ver route.ts, chamado só imediatamente antes do rescue ladder. Isso
//    garante que TODO fluxo determinístico (os 8 regex, registro de
//    gasto/renda/dívida, tarefas, lembretes) já teve a chance de resolver
//    a mensagem primeiro. Importante: NÃO filtra por "a mensagem não pode
//    conter gastei/paguei/comprei/recebi" (erro que quase cometi) — isso
//    bloquearia consultas 100% legítimas tipo "quanto gastei esse mês?"
//    ou "quanto paguei de cartão?", que usam esses mesmos verbos. Como
//    esse classificador só roda DEPOIS que o registro determinístico de
//    lançamento já teve sua chance e não encontrou nada concreto pra
//    lançar, não tem risco de "roubar" uma mensagem que devia virar
//    lançamento — nesse ponto da cascata, ela já não é uma.
//
// 3) SÓ pode rotear pra skills de LEITURA PURA (nunca cria/altera
//    Lancamento, Divida, Cartao etc) — pior caso de erro de classificação
//    é mostrar a informação errada uma vez (cliente pergunta de novo),
//    nunca perda ou corrupção de dado financeiro.
//
// 4) Exclui simulador-parcela e meta-prazo desta primeira leva: essas
//    duas exigem parâmetro numérico explícito (ex: "10x de R$180", "quitar
//    em 6 meses") que a classificação de intenção sozinha não resolve —
//    reconhecer a intenção não basta sem os números, e isso pede um
//    mecanismo de "slot filling" (perguntar o que falta) que ainda não
//    existe. Fica pra depois.
//
// 5) Structured Outputs (json_schema, strict) em vez de "responda uma
//    palavra" — a API já garante o formato da resposta, sem parsing de
//    texto livre torcendo pra vir certo.
//
// Custo/latência: só dispara quando (a) nenhum dos 8 regex bateu, (b) o
// fluxo determinístico de registro (gasto/renda/dívida/tarefa/lembrete)
// não reconheceu nada concreto, e (c) a mensagem PARECE uma pergunta
// (heurística barata — ver pareceConsultaLivre). Mensagens declarativas
// puras ("gastei 50 no mercado") nunca chegam aqui: são resolvidas antes,
// mais acima na cascata.

import { chatCompletion } from "@/lib/ai/openai-client";
import { responderConsultaFinanceira, type TipoConsultaFinanceira } from "./consulta-financeira-resolver";
import { responderLimiteSeguro } from "./limite-seguro-resolver";
import { responderRotaDividas } from "./rota-dividas-resolver";
import { responderPlanoPagamento } from "./plano-pagamento-resolver";
import { responderConsultaVazamentos } from "./vazamentos-resolver";
import { responderHorasTrabalho } from "./horas-trabalho-resolver";

type IntentConsultaLivre =
  | "POSSO_GASTAR"
  | "ONDE_GASTO_MAIS"
  | "COMO_ECONOMIZAR"
  | "LIMITE_SEGURO"
  | "ROTA_DIVIDAS"
  | "PLANO_PAGAMENTO"
  | "VAZAMENTOS_SALARIO"
  | "HORAS_TRABALHO"
  | "NENHUM";

const INTENTS_VALIDOS: readonly IntentConsultaLivre[] = [
  "POSSO_GASTAR",
  "ONDE_GASTO_MAIS",
  "COMO_ECONOMIZAR",
  "LIMITE_SEGURO",
  "ROTA_DIVIDAS",
  "PLANO_PAGAMENTO",
  "VAZAMENTOS_SALARIO",
  "HORAS_TRABALHO",
  "NENHUM",
];

// Heurística barata (sem chamar IA) — só decide se VALE A PENA gastar uma
// chamada de IA tentando classificar. Não precisa ser perfeita: falso
// positivo aqui custa só uma chamada de IA que vai responder NENHUM (cai
// no fluxo de sempre, sem efeito colateral); falso negativo significa só
// que essa mensagem específica continua caindo no rescue ladder, ponto de
// partida em que já estava hoje.
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const REGEX_PISTA_PERGUNTA =
  /\?|\b(quanto|quantos|quantas|qual|quais|como|onde|posso|consigo|da\s+pra|de\s+pra|sera\s+que|sobrou|sobra|falta|tenho\s+quanto|cade|queria\s+saber|quero\s+saber|me\s+diz|me\s+fala)\b/;

export function pareceConsultaLivre(mensagem: string): boolean {
  return REGEX_PISTA_PERGUNTA.test(normalizar(mensagem));
}

const SCHEMA_INTENT_CONSULTA_LIVRE = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: INTENTS_VALIDOS as unknown as string[],
    },
  },
  required: ["intent"],
  additionalProperties: false,
};

const INSTRUCAO_CLASSIFICADOR = `Você classifica UMA mensagem de WhatsApp de um cliente do QuitaZAP (app financeiro) em uma destas categorias. Isso é SÓ classificação de intenção — nunca calcule nem responda a pergunta, só devolva a categoria. O cliente pode ter qualquer nível de escolaridade — considere gírias, erros de português, abreviações e frases bem informais.

POSSO_GASTAR — quer saber se cabe gastar um valor específico agora. Ex: "posso gastar 50 hoje?", "da pra comprar uma coisa de 200?", "consigo gastar mais 100 esse mes?", "tenho como comprar um tenis de 150?"
ONDE_GASTO_MAIS — quer saber em que categoria está gastando mais este mês. Ex: "onde meu dinheiro ta indo", "em que eu mais gasto", "qual categoria ta pesando mais", "pra onde meu salario ta indo"
COMO_ECONOMIZAR — quer dicas de como cortar gasto/economizar. Ex: "como eu corto gasto", "onde da pra economizar", "como faço pra sobrar mais dinheiro"
LIMITE_SEGURO — quer saber quanto pode gastar por dia até o fim do mês/próximo salário. Ex: "quanto posso gastar por dia", "quanto sobra ate o salario cair", "quanto da pra gastar por dia sem estourar"
ROTA_DIVIDAS — quer saber qual dívida pagar primeiro ou como ficar livre das dívidas. Ex: "qual divida eu quito primeiro", "como saio das dividas", "por onde começo a pagar"
PLANO_PAGAMENTO — quer um plano de quais contas pagar este mês, ou o que pagar primeiro no mês corrente (não é sobre dívida de longo prazo). Ex: "o que eu pago primeiro esse mes", "monta meu plano de pagamento", "quais contas eu tenho que pagar agora"
VAZAMENTOS_SALARIO — quer saber quais assinaturas/gastos recorrentes tem. Ex: "quais assinatura eu pago", "quanto gasto de assinatura por ano", "tenho gasto fixo que nem lembro"
HORAS_TRABALHO — quer saber quantas horas/dias de trabalho um valor equivale. Ex: "quantas horas de trabalho custa uma tv de 1500", "quanto tempo eu trabalho pra pagar isso"
NENHUM — qualquer outra coisa: saudação, registro de gasto/renda/dívida (ex: "gastei 50 no mercado"), pergunta sobre outro assunto (cobrança, cancelamento, dúvida de uso do app), ou mensagem ambígua demais pra classificar com segurança nas 8 acima.

Na dúvida entre uma das 8 e NENHUM, responda NENHUM — é sempre mais seguro cair no fluxo padrão do que arriscar uma classificação errada.`;

async function classificarIntentLivre(
  mensagem: string,
  clienteId: string,
  gratuito: boolean,
): Promise<IntentConsultaLivre | null> {
  try {
    const { conteudo } = await chatCompletion({
      model: process.env.OPENAI_FINANCEIRO_INTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      mensagens: [
        { role: "system", content: INSTRUCAO_CLASSIFICADOR },
        { role: "user", content: mensagem },
      ],
      temperature: 0,
      maxTokens: 20,
      responseFormat: {
        type: "json_schema",
        json_schema: { name: "intent_consulta_livre", strict: true, schema: SCHEMA_INTENT_CONSULTA_LIVRE },
      },
      telemetria: { clienteId, gratuito, skill: "classificador-consulta-livre" },
    });

    const parsed = JSON.parse(conteudo) as { intent?: string };
    const intent = parsed.intent;
    // Defesa em profundidade: mesmo com schema estrito, nunca confia cegamente
    // — se vier algo fora da lista (ou o parse falhar), trata como NENHUM.
    if (intent && (INTENTS_VALIDOS as readonly string[]).includes(intent)) {
      return intent as IntentConsultaLivre;
    }
    return "NENHUM";
  } catch (e) {
    console.error("[ClassificadorConsultaLivre] Erro ao classificar, caindo no fluxo padrão:", e);
    return null;
  }
}

// Log estruturado (sem tabela nova ainda — proposto como Fase 2) — dá pra
// grepar nos logs do Vercel pra ver o que esse fallback está encontrando
// e alimentar a lista de exemplos/regex no futuro.
function logDecisao(mensagem: string, intent: IntentConsultaLivre | null) {
  console.log(
    "[ConsultaLivre]",
    JSON.stringify({ mensagem, intentDetectado: intent ?? "ERRO_CLASSIFICACAO" }),
  );
}

const MAPA_TIPO_CONSULTA_FINANCEIRA: Partial<Record<IntentConsultaLivre, TipoConsultaFinanceira>> = {
  POSSO_GASTAR: "posso_gastar",
  ONDE_GASTO_MAIS: "onde_gasto_mais",
  COMO_ECONOMIZAR: "como_economizar",
};

// Ponto de entrada único, chamado pelo webhook logo antes do rescue ladder
// (ver route.ts). Devolve null sempre que não deve responder aqui — nesse
// caso o webhook segue pro fluxo de sempre, sem nenhuma mudança de
// comportamento.
export async function tentarResponderConsultaLivre(
  mensagem: string,
  clienteId: string,
  gratuito: boolean,
): Promise<string | null> {
  if (!pareceConsultaLivre(mensagem)) return null;

  const intent = await classificarIntentLivre(mensagem, clienteId, gratuito);
  logDecisao(mensagem, intent);
  if (!intent || intent === "NENHUM") return null;

  const tipoConsultaFinanceira = MAPA_TIPO_CONSULTA_FINANCEIRA[intent];
  if (tipoConsultaFinanceira) {
    return responderConsultaFinanceira(tipoConsultaFinanceira, clienteId, mensagem, gratuito);
  }

  switch (intent) {
    case "LIMITE_SEGURO":
      return responderLimiteSeguro(clienteId, gratuito);
    case "ROTA_DIVIDAS":
      return responderRotaDividas(clienteId, gratuito);
    case "PLANO_PAGAMENTO":
      return responderPlanoPagamento(clienteId, gratuito);
    case "VAZAMENTOS_SALARIO":
      return responderConsultaVazamentos(clienteId, gratuito);
    case "HORAS_TRABALHO":
      return responderHorasTrabalho(clienteId, mensagem, gratuito);
    default:
      return null;
  }
}
