// Categoria das compras importadas de fatura (print, PDF, OFX/CSV). Camadas, da mais
// confiável pra menos:
//  1. estrutura do banco e dicionário de estabelecimentos → definirCategoriaGasto (regra fixa);
//  2. o que ESTE cliente já usou pro mesmo estabelecimento (histórico dele, sem coluna nova) — vence o
//     dicionário, exceto a estrutura do banco;
//  3. IA (gpt-4o-mini, saída restrita às categorias que o app já tem) só pro que sobrou;
//  4. "Outros".
// Falha da IA nunca derruba a importação: cai em "Outros" e o cliente edita no extrato.

import { prisma } from "@/lib/prisma";
import { chatCompletion } from "@/lib/ai/openai-client";
import { definirCategoriaGasto, NOMES_CATEGORIAS_GASTO } from "@/lib/gasto-flow";

// A IA nunca escolhe estas: uma é só por estrutura do banco, a outra tem fluxo próprio
// (apostas pedem aviso) e dívidas/cartões já têm onde viver.
const FORA_DA_IA = new Set(["Pix/Boleto no crédito", "Apostas", "Dívidas/Cartões"]);

function chave(descricao: string): string {
  return descricao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export async function categorizarCompras(
  clienteId: string,
  gratuito: boolean,
  descricoes: string[]
): Promise<string[]> {
  const resultado = descricoes.map((d) => definirCategoriaGasto(d) as string);

  // Histórico do PRÓPRIO cliente pro mesmo estabelecimento: a escolha dele vale mais que o
  // dicionário genérico (ex.: ChatGPT é "Assinaturas" pra maioria, mas "Trabalho/Negócio" pra
  // quem usa no trabalho). Só a estrutura do banco (Pix/Boleto no crédito) não é sobrescrita.
  const anteriores = await prisma.lancamento.findMany({
    where: { clienteId, categoria: { not: null }, NOT: { categoria: "Outros" } },
    select: { descricao: true, categoria: true },
    orderBy: { atualizadoEm: "desc" },
    take: 2000,
  });
  const historico = new Map<string, string>();
  for (const a of anteriores) {
    const k = chave(a.descricao);
    if (k && a.categoria && !historico.has(k)) historico.set(k, a.categoria);
  }
  for (let i = 0; i < descricoes.length; i++) {
    if (resultado[i] === "Pix/Boleto no crédito") continue;
    const escolhida = historico.get(chave(descricoes[i]));
    if (escolhida) resultado[i] = escolhida;
  }
  const aindaOutros = resultado.map((c, i) => (c === "Outros" ? i : -1)).filter((i) => i >= 0);
  if (aindaOutros.length === 0) return resultado;

  // 3) IA só pro que sobrou — um estabelecimento por vez, sem repetir nomes iguais
  const unicos = [...new Map(aindaOutros.map((i) => [chave(descricoes[i]), descricoes[i]])).values()];
  const permitidas = NOMES_CATEGORIAS_GASTO.filter((c) => !FORA_DA_IA.has(c));
  try {
    const r = await chatCompletion({
      model: "gpt-4o-mini",
      temperature: 0,
      maxTokens: 800,
      mensagens: [
        {
          role: "system",
          content:
            "Você classifica compras de fatura de cartão de um brasileiro em UMA categoria da lista. " +
            "Use o nome do estabelecimento. Se não houver indício razoável do que é, responda \"Outros\" — nunca chute. " +
            "Nome de empresa que não diz o ramo (Ltda, S.A., Holdings, Comercial, Com de, siglas, nomes de pessoa) é \"Outros\": o cliente escolhe a categoria depois. " +
            "Ferramentas de software, nuvem, hospedagem e anúncios usados no trabalho são Trabalho/Negócio.",
        },
        { role: "user", content: JSON.stringify(unicos.map((d, indice) => ({ indice, estabelecimento: d }))) },
      ],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "categorias_compras",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["resultados"],
            properties: {
              resultados: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["indice", "categoria"],
                  properties: { indice: { type: "integer" }, categoria: { type: "string", enum: permitidas } },
                },
              },
            },
          },
        },
      },
      telemetria: { clienteId, gratuito, skill: "categorizacao-compras" },
    });
    const dados = JSON.parse(r.conteudo) as { resultados: { indice: number; categoria: string }[] };
    const porChave = new Map<string, string>();
    for (const x of dados.resultados) {
      const d = unicos[x.indice];
      if (d && permitidas.includes(x.categoria as never)) porChave.set(chave(d), x.categoria);
    }
    for (const i of aindaOutros) resultado[i] = porChave.get(chave(descricoes[i])) ?? "Outros";
  } catch (err) {
    console.error("[CATEGORIZACAO] IA indisponível, mantendo 'Outros':", err instanceof Error ? err.message : err);
  }
  return resultado;
}
