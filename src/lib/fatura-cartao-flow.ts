// ─────────────────────────────────────────
// QuitaZAP Controle — Leitura de fatura de cartão em PDF
// ─────────────────────────────────────────
// Pedido do Ibrahim (09/09/2026): quando o cliente manda a fatura do cartão
// em PDF, ler as compras parceladas ainda em aberto (parcelas futuras) e
// lançar como compromisso — sem nunca duplicar o mesmo parcelamento entre
// faturas de meses diferentes nem lançar nada sem confirmação explícita do
// cliente (mesmo mandamento do "Boleto Inteligente", ver boleto-flow.ts).
//
// Arquitetura alinhada com o ChatGPT (consultoria de 09/09/2026):
// - Reaproveita Divida+Parcela (tipoDivida "CARTAO") em vez de inventar um
//   mecanismo novo de parcelamento — só esse já tem suporte a parcela.
// - Só cria parcelas FUTURAS (da parcela atual da fatura em diante) — a
//   parcela do mês corrente já está coberta pelo que quer que o cliente use
//   pra registrar o pagamento da fatura em si; recriar do zero (1/N)
//   contaria dinheiro que já foi gasto em meses anteriores como se fosse
//   compromisso novo.
// - Deduplicação em duas camadas:
//   1) Mesmo PDF reenviado → hash SHA-256 por cliente (DocumentoImportado),
//      nunca processa de novo (ver hashJaProcessado/registrarDocumentoImportado).
//   2) Mesma compra aparecendo em faturas de meses diferentes → nunca
//      decide sozinho por "descrição parecida" só — cartão + valor da
//      parcela + total de parcelas batendo exatamente é match forte (ignora
//      silenciosamente, já está cadastrada); só valor+total batendo mas
//      descrição diferente é "provável" e pergunta ao cliente antes de
//      decidir (ver buscarDividaSemelhante).
// - Cartão: resolve pelo catálogo conhecido (mesma normalização usada no
//   fluxo de texto) e cria automaticamente se não achar — mesmo
//   comportamento já usado pra gasto no cartão via texto (upsertCartao),
//   baixo risco por ser reversível em Minha Conta > Cartões (diferente de
//   duplicar uma dívida, que mexe em dinheiro).
//
// Fica isolado do state machine grande de controle-financeiro-flow.ts de
// propósito (mesmo motivo do boleto-flow.ts): confirmação de documento é
// uma conversa própria, sim/não sobre UM assunto por vez, não uma
// continuação do fluxo de texto — por isso guarda estado em
// BotSessao.faturaCartaoPendente.

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizarTextoBusca } from "@/lib/descricao-financeira";
import { normalizarNomeCartaoControle } from "@/lib/controle-financeiro-flow";
import { upsertCartao } from "@/lib/controle-financeiro-service";

// ── Tipos ────────────────────────────────────────────────────────────────

/** Uma compra parcelada em aberto, como extraída do PDF pelo gpt-4o. */
export interface ParceladaFatura {
  descricao: string;
  parcelaAtual: number;
  totalParcelas: number;
  valorParcela: number;
}

export interface FaturaCartaoDetectada {
  emissor: string;
  vencimentoFatura: string; // YYYY-MM-DD
  parceladas: ParceladaFatura[];
}

type ItemConfirmado = ParceladaFatura;

type ItemAmbiguo = ParceladaFatura & {
  dividaExistenteId: string;
  dividaExistenteDescricao: string;
  dividaExistenteValor: number;
};

export interface FaturaCartaoPendente {
  cartaoId: string;
  cartaoNome: string;
  hash: string;
  vencimentoFatura: string; // YYYY-MM-DD
  /** Compras com match "provável" (mesmo valor/total, descrição diferente)
   * aguardando resolução uma por uma, na ordem — só depois de zerada essa
   * fila é que a confirmação em lote (etapa final) é oferecida. */
  filaAmbiguos: ItemAmbiguo[];
  /** Posição da fila ainda não perguntada. */
  indice: number;
  /** Itens já certos que vão virar Divida+Parcela na confirmação final —
   * começa com as compras "novas" (sem nenhuma dívida parecida) e recebe
   * mais uma a cada "não, é diferente" respondido na fila de ambíguos. */
  confirmados: ItemConfirmado[];
  /** Só informativo, pra prévia — quantas compras já estavam cadastradas
   * (match forte) e por isso nem entraram na fila. */
  jaCadastradas: number;
}

// ── Formatação ───────────────────────────────────────────────────────────

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(`${iso}T12:00:00`)
  );
}

function normalizar(s: string): string {
  return normalizarTextoBusca(s);
}

// ── Validação da extração ────────────────────────────────────────────────

function parceladaValida(p: unknown): p is ParceladaFatura {
  if (!p || typeof p !== "object") return false;
  const item = p as Record<string, unknown>;
  return (
    typeof item.descricao === "string" &&
    item.descricao.trim().length > 0 &&
    typeof item.parcelaAtual === "number" &&
    Number.isInteger(item.parcelaAtual) &&
    item.parcelaAtual >= 1 &&
    typeof item.totalParcelas === "number" &&
    Number.isInteger(item.totalParcelas) &&
    item.totalParcelas > item.parcelaAtual &&
    typeof item.valorParcela === "number" &&
    item.valorParcela > 0
  );
}

/** Só valida o essencial pra prosseguir (emissor + data + parceladas bem
 * formadas) — fatura sem NENHUMA compra parcelada em aberto também é
 * válida (ex: fatura só com compras à vista), só não gera nada pra
 * confirmar. Itens malformados são descartados individualmente em vez de
 * invalidar a fatura toda (mais seguro do que arriscar não processar uma
 * fatura real por causa de 1 item ruim). */
export function faturaCartaoValida(f: Partial<FaturaCartaoDetectada>): f is FaturaCartaoDetectada {
  return (
    typeof f.emissor === "string" &&
    f.emissor.trim().length > 0 &&
    typeof f.vencimentoFatura === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.vencimentoFatura) &&
    !Number.isNaN(new Date(`${f.vencimentoFatura}T12:00:00`).getTime()) &&
    Array.isArray(f.parceladas)
  );
}

// ── Hash do PDF (dedupe de reenvio do mesmo arquivo) ─────────────────────

export async function hashPDF(pdfUrl: string): Promise<string> {
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`Falha ao baixar PDF pra hash: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function hashJaProcessado(clienteId: string, hash: string): Promise<boolean> {
  const existente = await prisma.documentoImportado.findUnique({
    where: { clienteId_hash: { clienteId, hash } },
  });
  return existente != null;
}

async function registrarDocumentoImportado(clienteId: string, hash: string): Promise<void> {
  await prisma.documentoImportado.create({
    data: { clienteId, hash, tipo: "FATURA_CARTAO" },
  });
}

// ── Resolução do cartão ──────────────────────────────────────────────────

/** Canonicaliza o emissor extraído do PDF contra o catálogo de bancos
 * conhecidos (mesma normalização do fluxo de texto) — assim "Nu Pagamentos"
 * dito pela IA de forma diferente de uma fatura pra outra ainda cai no
 * mesmo Cartao "Nubank" já cadastrado, em vez de criar um duplicado. Sem
 * match no catálogo, usa o texto da IA como veio (o prompt já pede o nome
 * popular, não a razão social). */
async function resolverCartaoFatura(clienteId: string, emissor: string) {
  const nomeCanonico = normalizarNomeCartaoControle(emissor) ?? emissor.trim();
  const cartao = await upsertCartao(clienteId, nomeCanonico);
  return cartao;
}

// ── Deduplicação entre faturas de meses diferentes ───────────────────────

type ResultadoBusca =
  | { match: "forte"; divida: { id: string; credor: string } }
  | { match: "provavel"; divida: { id: string; credor: string; valor: number } }
  | { match: "nenhum" };

/** Procura uma Divida CARTAO já cadastrada pro mesmo cliente+cartão que
 * pareça ser a MESMA compra parcelada vinda da fatura. Critério (alinhado
 * com o ChatGPT): valor da parcela e total de parcelas batendo exatamente é
 * o par mais confiável (dificilmente duas compras distintas têm as duas
 * coisas idênticas) — daí a descrição decide se é match "forte" (ignora,
 * já está cadastrada) ou só "provável" (pergunta antes de decidir, nunca
 * assume sozinho). */
async function buscarDividaSemelhante(
  clienteId: string,
  cartaoId: string,
  item: ParceladaFatura
): Promise<ResultadoBusca> {
  // Também considera dívidas CARTAO sem cartaoId (compra parcelada
  // declarada por TEXTO antes — "comprei uma TV em 10x" não pergunta qual
  // cartão, ver rescue-financeiro-service.ts) — sem isso, a mesma compra
  // declarada primeiro por texto e depois vista na fatura em PDF nunca
  // seria reconhecida como a mesma, e duplicaria.
  const candidatas = await prisma.divida.findMany({
    where: {
      clienteId,
      OR: [{ cartaoId }, { cartaoId: null }],
      tipo: "CARTAO",
      status: { not: "CANCELADA" },
      totalParcelas: item.totalParcelas,
    },
    include: { parcelas: { orderBy: { numero: "asc" }, take: 1 } },
  });

  const alvo = normalizar(item.descricao);
  let provavel: ResultadoBusca | null = null;

  for (const divida of candidatas) {
    const valorTipico = divida.parcelas[0]?.valor;
    if (valorTipico == null || Math.abs(valorTipico - item.valorParcela) > 0.02) continue;

    const nomeNormalizado = normalizar(divida.credor);
    const descricaoBate = nomeNormalizado === alvo;
    // Match "forte" (ignora sem perguntar) só quando também veio do MESMO
    // cartão já resolvido pra essa fatura — sem esse anexo (dívida antiga
    // do fluxo de texto, sem cartaoId), mesmo com descrição idêntica, ainda
    // pede confirmação: é a única checagem cruzada texto×PDF que temos.
    if (descricaoBate && divida.cartaoId === cartaoId) {
      return { match: "forte", divida: { id: divida.id, credor: divida.credor } };
    }
    if (!provavel && (descricaoBate || nomeNormalizado.includes(alvo) || alvo.includes(nomeNormalizado))) {
      provavel = { match: "provavel", divida: { id: divida.id, credor: divida.credor, valor: valorTipico } };
    }
  }

  return provavel ?? { match: "nenhum" };
}

// ── Monta o estado pendente a partir da extração ─────────────────────────

export async function montarFaturaCartaoPendente(
  clienteId: string,
  hash: string,
  fatura: FaturaCartaoDetectada
): Promise<FaturaCartaoPendente> {
  const cartao = await resolverCartaoFatura(clienteId, fatura.emissor);

  const itensValidos = fatura.parceladas.filter(parceladaValida);

  const filaAmbiguos: ItemAmbiguo[] = [];
  const confirmados: ItemConfirmado[] = [];
  let jaCadastradas = 0;

  for (const item of itensValidos) {
    const resultado = await buscarDividaSemelhante(clienteId, cartao.id, item);
    if (resultado.match === "forte") {
      jaCadastradas += 1;
    } else if (resultado.match === "provavel") {
      filaAmbiguos.push({
        ...item,
        dividaExistenteId: resultado.divida.id,
        dividaExistenteDescricao: resultado.divida.credor,
        dividaExistenteValor: resultado.divida.valor,
      });
    } else {
      confirmados.push(item);
    }
  }

  return {
    cartaoId: cartao.id,
    cartaoNome: cartao.nome,
    hash,
    vencimentoFatura: fatura.vencimentoFatura,
    filaAmbiguos,
    indice: 0,
    confirmados,
    jaCadastradas,
  };
}

// ── Mensagens ────────────────────────────────────────────────────────────

export function mensagemPerguntaAmbiguo(item: ItemAmbiguo): string {
  return (
    `🔎 Encontrei uma compra parecida já cadastrada no seu Controle:\n\n` +
    `*${item.dividaExistenteDescricao}* — ${fmt(item.dividaExistenteValor)}\n\n` +
    `Na fatura veio:\n*${item.descricao}* — ${fmt(item.valorParcela)} (parcela ${item.parcelaAtual} de ${item.totalParcelas})\n\n` +
    `É a mesma compra? Responda *sim* (não lança de novo) ou *não* (é uma compra diferente).`
  );
}

/** Nenhuma compra pra confirmar (nem novas, nem no meio da fila de
 * ambíguos) — só avisa e não deixa nada pendente. */
export function mensagemFaturaSemNovidade(jaCadastradas: number): string {
  if (jaCadastradas > 0) {
    return `📄 Li a fatura — as ${jaCadastradas} compra(s) parcelada(s) que encontrei já estavam no seu Controle, não lancei de novo.`;
  }
  return `📄 Li a fatura, mas não encontrei nenhuma compra parcelada em aberto pra lançar.`;
}

export function mensagemResumoLote(p: FaturaCartaoPendente): string {
  const total = p.confirmados.reduce((soma, i) => soma + i.valorParcela, 0);
  const linhas = p.confirmados.map(
    (i) => `• ${i.descricao} — ${fmt(i.valorParcela)} — restam ${i.totalParcelas - i.parcelaAtual}x`
  );
  const notaCadastradas = p.jaCadastradas > 0 ? `\n_(${p.jaCadastradas} compra(s) já cadastrada(s) foram ignoradas, sem duplicar.)_` : "";

  return (
    `💳 *Fatura ${p.cartaoNome}* — venc. ${fmtData(p.vencimentoFatura)}\n\n` +
    `Encontrei ${p.confirmados.length} compra(s) com parcelas futuras:\n\n` +
    `${linhas.join("\n")}\n\n` +
    `Compromissos futuros identificados: ${fmt(total)}${notaCadastradas}\n\n` +
    `Quer que eu lance isso no seu Controle? Responda *sim* ou *não*.`
  );
}

export function mensagemLoteConfirmado(p: FaturaCartaoPendente): string {
  const total = p.confirmados.reduce((soma, i) => soma + i.valorParcela, 0);
  return `✅ Lancei ${p.confirmados.length} compra(s) parcelada(s) da fatura ${p.cartaoNome} (${fmt(total)} em compromissos futuros). Vou considerar isso no seu Comprometido a partir do mês que vencer cada parcela.`;
}

// ── Resposta sim/não (mesmo padrão do Boleto Inteligente) ────────────────

export function detectarRespostaFaturaCartao(mensagem: string): "confirmar" | "negar" | null {
  const texto = normalizar(mensagem);
  if (/^(1|sim|s|confirmar|pode|pode lancar|pode lançar|isso)$/.test(texto)) return "confirmar";
  if (/^(2|nao|n|cancelar|nao lancar|nao lançar|deixa)$/.test(texto)) return "negar";
  return null;
}

// ── Vencimento das parcelas futuras ──────────────────────────────────────

/** i-ésima parcela futura (i=1,2,...) a partir do vencimento desta fatura —
 * mesmo padrão de incremento por mês usado em criarDividaComParcelas
 * (divida-service.ts). A parcela da própria fatura atual (i=0) nunca é
 * criada aqui: já é responsabilidade de como o cliente registra o
 * pagamento da fatura em si, não desse import. */
function calcularVencimentoParcelaFutura(vencimentoFatura: Date, i: number): Date {
  const d = new Date(vencimentoFatura);
  d.setMonth(d.getMonth() + i);
  return d;
}

// ── Persistência final ───────────────────────────────────────────────────

/** Cria uma Divida+Parcela por compra confirmada, só com as parcelas AINDA
 * NÃO vencidas (parcelaAtual+1 em diante) — preserva o totalParcelas real
 * da compra (pra exibir "parcela 4 de 10" certinho), mas valorTotal reflete
 * só o que falta, que é o que importa pro Comprometido. Registra o hash do
 * PDF por último, só depois de tudo criado com sucesso. */
export async function salvarComprasParceladasFatura(
  clienteId: string,
  pendente: FaturaCartaoPendente
): Promise<void> {
  const vencimentoFatura = new Date(`${pendente.vencimentoFatura}T12:00:00`);

  for (const item of pendente.confirmados) {
    const parcelasRestantes = item.totalParcelas - item.parcelaAtual;
    if (parcelasRestantes <= 0) continue; // já quitada, nada futuro a lançar

    const divida = await prisma.divida.create({
      data: {
        clienteId,
        cartaoId: pendente.cartaoId,
        credor: item.descricao,
        descricao: `Fatura ${pendente.cartaoNome} — parcela ${item.parcelaAtual}/${item.totalParcelas} em diante`,
        tipo: "CARTAO",
        status: "ATIVA",
        valorTotal: Math.round(item.valorParcela * parcelasRestantes * 100) / 100,
        totalParcelas: item.totalParcelas,
        diaVencimento: vencimentoFatura.getDate(),
        obs: `Importado automaticamente da fatura em PDF (${pendente.cartaoNome}, venc. ${fmtData(pendente.vencimentoFatura)}). Parcelas 1-${item.parcelaAtual} não incluídas (já refletidas em faturas anteriores).`,
      },
    });

    const parcelasData = Array.from({ length: parcelasRestantes }, (_, i) => ({
      dividaId: divida.id,
      numero: item.parcelaAtual + 1 + i,
      valor: item.valorParcela,
      vencimento: calcularVencimentoParcelaFutura(vencimentoFatura, i + 1),
      status: "PENDENTE",
      obs: "Importado de fatura em PDF",
    }));
    await prisma.parcela.createMany({ data: parcelasData });
  }

  await registrarDocumentoImportado(clienteId, pendente.hash);
}
