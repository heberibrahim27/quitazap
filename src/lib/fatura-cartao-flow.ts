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
import { definirCategoriaGasto } from "@/lib/gasto-flow";
import { anoMesDiaBrasil } from "@/lib/financeiro/fatura-cartao";

// ── Tipos ────────────────────────────────────────────────────────────────

/** Uma compra parcelada em aberto, como extraída do PDF pelo gpt-4o. */
export interface ParceladaFatura {
  descricao: string;
  parcelaAtual: number;
  totalParcelas: number;
  valorParcela: number;
  /** Data da compra original (YYYY-MM-DD), quando o print/PDF mostra. */
  dataCompra?: string;
}

/** Qualquer compra da fatura (à vista ou parcelada) — vira gasto no cartão. */
export interface CompraFatura {
  descricao: string;
  valor: number;
  data: string; // YYYY-MM-DD
  /** Só quando a linha é parcelada (ex.: "1/3" → 1). */
  parcelaAtual?: number | null;
}

export interface FaturaCartaoDetectada {
  emissor: string;
  vencimentoFatura: string; // YYYY-MM-DD
  /** Print que só mostra o mês da fatura: o dia do vencimento é um palpite. */
  vencimentoEstimado?: boolean;
  parceladas: ParceladaFatura[];
  /** Só nos prints (o PDF segue só com parceladas). */
  compras?: CompraFatura[];
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
  vencimentoEstimado?: boolean;
  /** Compras novas (ainda não registradas no cartão) que viram gasto na confirmação. */
  compras?: CompraFatura[];
  /** Quantas compras do print já estavam registradas (mesmo cartão, dia e valor). */
  comprasJaRegistradas?: number;
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
  // upsert: o mesmo print pode ser reenviado (a deduplicação por compra
  // já impede duplicar) e a chave clienteId+hash é única.
  await prisma.documentoImportado.upsert({
    where: { clienteId_hash: { clienteId, hash } },
    update: {},
    create: { clienteId, hash, tipo: "FATURA_CARTAO" },
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

// ── Compras da fatura (gasto no cartão) ──────────────────────────────────

function compraValida(c: CompraFatura): boolean {
  if (!c.descricao.trim() || !Number.isFinite(c.valor) || c.valor <= 0) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.data)) return false;
  const d = new Date(`${c.data}T12:00:00`);
  // Compra não pode estar no futuro (leitura com ano errado) nem ser de parcela
  // posterior à 1ª (essa já entrou como Parcela quando a compra foi importada).
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 24 * 3600 * 1000) return false;
  return c.parcelaAtual == null || c.parcelaAtual <= 1;
}

/** Separa o que ainda não está registrado no cartão do que já está. Chave:
 * mesmo cartão + mesmo dia (Brasília) + mesmo valor — a descrição do cliente
 * ("mercado") quase nunca bate com a da fatura ("Atacadao Atakarejo"). */
async function separarComprasNovas(
  clienteId: string,
  cartaoId: string,
  compras: CompraFatura[]
): Promise<{ novas: CompraFatura[]; jaRegistradas: number }> {
  const validas = compras.filter(compraValida);
  if (validas.length === 0) return { novas: [], jaRegistradas: 0 };

  const datas = validas.map((c) => new Date(`${c.data}T12:00:00`).getTime());
  const existentes = await prisma.lancamento.findMany({
    where: {
      clienteId,
      cartaoId,
      data: { gte: new Date(Math.min(...datas) - 36 * 3600 * 1000), lte: new Date(Math.max(...datas) + 36 * 3600 * 1000) },
    },
    select: { valor: true, data: true },
  });
  const usados = new Set<number>();
  const novas: CompraFatura[] = [];
  let jaRegistradas = 0;
  for (const c of validas) {
    const alvo = anoMesDiaBrasil(new Date(`${c.data}T12:00:00`));
    const idx = existentes.findIndex((e, i) => {
      if (usados.has(i) || Math.abs(e.valor - c.valor) > 0.01) return false;
      const d = anoMesDiaBrasil(e.data);
      return d.ano === alvo.ano && d.mes === alvo.mes && d.dia === alvo.dia;
    });
    if (idx >= 0) {
      usados.add(idx);
      jaRegistradas += 1;
    } else {
      novas.push(c);
    }
  }
  return { novas, jaRegistradas };
}

/** Tem algo pra confirmar (compra parcelada futura ou gasto novo no cartão)? */
export function faturaTemNovidade(p: FaturaCartaoPendente): boolean {
  return p.confirmados.length > 0 || (p.compras?.length ?? 0) > 0;
}

// ── Monta o estado pendente a partir da extração ─────────────────────────

export async function montarFaturaCartaoPendente(
  clienteId: string,
  hash: string,
  fatura: FaturaCartaoDetectada
): Promise<FaturaCartaoPendente> {
  const cartao = await resolverCartaoFatura(clienteId, fatura.emissor);

  // Print que só mostra o mês: se o cartão já tem dia de vencimento, usa-o em
  // vez do palpite.
  if (fatura.vencimentoEstimado && cartao.diaVencimento) {
    fatura = {
      ...fatura,
      vencimentoFatura: `${fatura.vencimentoFatura.slice(0, 7)}-${String(cartao.diaVencimento).padStart(2, "0")}`,
      vencimentoEstimado: false,
    };
  }

  const itensValidos = fatura.parceladas.filter(parceladaValida);
  const { novas: comprasNovas, jaRegistradas: comprasJaRegistradas } = await separarComprasNovas(
    clienteId,
    cartao.id,
    fatura.compras ?? []
  );

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
    vencimentoEstimado: fatura.vencimentoEstimado,
    compras: comprasNovas,
    comprasJaRegistradas,
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
  const nCompras = p.compras?.length ?? 0;
  const totalCompras = (p.compras ?? []).reduce((soma, c) => soma + c.valor, 0);
  const linhaCompras = nCompras > 0 ? `Gastos no cartão a registrar: ${nCompras} (${fmt(totalCompras)})\n\n` : "";
  const notaCadastradas = p.jaCadastradas > 0 ? `\n_(${p.jaCadastradas} compra(s) já cadastrada(s) foram ignoradas, sem duplicar.)_` : "";

  return (
    `💳 *Fatura ${p.cartaoNome}* — venc. ${fmtData(p.vencimentoFatura)}\n\n` +
    `Encontrei ${p.confirmados.length} compra(s) com parcelas futuras:\n\n` +
    `${linhas.join("\n")}\n\n` +
    linhaCompras +
    `Compromissos futuros identificados: ${fmt(total)}${notaCadastradas}\n\n` +
    `Quer que eu lance isso no seu Controle? Responda *sim* ou *não*.`
  );
}

export function mensagemLoteConfirmado(p: FaturaCartaoPendente): string {
  const total = p.confirmados.reduce((soma, i) => soma + i.valorParcela, 0);
  const nCompras = p.compras?.length ?? 0;
  const gastos = nCompras > 0 ? ` e registrei ${nCompras} gasto(s) no cartão` : "";
  return `✅ Lancei ${p.confirmados.length} compra(s) parcelada(s) da fatura ${p.cartaoNome} (${fmt(total)} em compromissos futuros)${gastos}. Vou considerar isso no seu Comprometido a partir do mês que vencer cada parcela.`;
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

  // Gastos no cartão (à vista e a 1ª parcela de cada parcelado) — mesmo tipo
  // que o gasto por texto no cartão, com a data da compra. Sem alerta de
  // orçamento: é importação de histórico, não um gasto novo do dia.
  if (pendente.compras && pendente.compras.length > 0) {
    await prisma.lancamento.createMany({
      data: pendente.compras.map((c) => ({
        clienteId,
        tipo: "COMPRA_CARTAO",
        descricao: c.descricao,
        categoria: definirCategoriaGasto(c.descricao),
        valor: c.valor,
        data: new Date(`${c.data}T12:00:00`),
        recorrente: false,
        cartaoId: pendente.cartaoId,
        origem: "FOTO",
      })),
    });
  }

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
        obs: `Importado automaticamente da fatura (${pendente.cartaoNome}, venc. ${fmtData(pendente.vencimentoFatura)}).${item.dataCompra ? ` Compra em ${fmtData(item.dataCompra)}.` : ""} Parcelas 1-${item.parcelaAtual} não incluídas (já refletidas em faturas anteriores).`,
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
