// Prévia e confirmação do "Empréstimo por print", compartilhadas por chat e WhatsApp.
// Estado pendente fica na própria mensagem de prévia (MensagemChat.dadosEstruturados),
// sem coluna nova: canal-agnóstico e sem migração de banco. Nada é gravado em Divida
// antes da confirmação; ao confirmar, usa criarDividaComParcelas (mesmo caminho do
// cadastro manual em /minha-conta/emprestimos/novo).

import { prisma } from "@/lib/prisma";
import { criarDividaComParcelas } from "@/lib/divida-service";
import type { EmprestimoDetectado } from "@/lib/emprestimo-imagem";

type Canal = "APP" | "WHATSAPP";

export interface EmprestimoPendente extends EmprestimoDetectado {
  tipo: "emprestimo_detectado";
  mensagemId: string;
  resolvido: boolean;
}

const JANELA_MS = 24 * 3600 * 1000;

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
}

export function textoPreviaEmprestimo(e: EmprestimoDetectado): string {
  const restantes = e.totalParcelas - e.parcelasPagas;
  return (
    `🏦 Encontrei um empréstimo:\n\n` +
    `*${e.credor}*\n` +
    `💰 ${e.totalParcelas}x de ${fmt(e.valorParcela)} — ${e.parcelasPagas} paga(s), faltam ${restantes}\n` +
    `📅 1ª parcela em ${fmtData(e.primeiraData)}\n` +
    (e.valorRestanteImpresso ? `Valor restante na tela: ${fmt(e.valorRestanteImpresso)}\n` : "") +
    `\nQuer que eu lance isso como empréstimo no seu Controle? Responda *sim* ou *não*.`
  );
}

/** Texto curto do chat (a confirmação é por botão no card, não por "sim/não"). */
export function textoPreviaEmprestimoApp(e: EmprestimoDetectado): string {
  return `Li o empréstimo ${e.credor}: ${e.totalParcelas}x de ${fmt(e.valorParcela)}, ${e.parcelasPagas} já paga(s). Confere e confirma?`;
}

/** Já existe um empréstimo com o mesmo cronograma (nº de parcelas, valor e mês da 1ª)? */
export async function emprestimoJaCadastrado(clienteId: string, e: EmprestimoDetectado): Promise<boolean> {
  const candidatas = await prisma.divida.findMany({
    where: { clienteId, tipo: "EMPRESTIMO", status: { not: "CANCELADA" }, totalParcelas: e.totalParcelas },
    include: { parcelas: { where: { numero: 1 }, take: 1 } },
  });
  const alvo = e.primeiraData.slice(0, 7);
  return candidatas.some((d) => {
    const p = d.parcelas[0];
    return p != null && Math.abs(p.valor - e.valorParcela) <= 0.02 && p.vencimento.toISOString().slice(0, 7) === alvo;
  });
}

/** Guarda a prévia (mensagem do bot) e devolve o pendente com o id da mensagem. */
export async function criarPendenteEmprestimo(
  clienteId: string,
  canal: Canal,
  e: EmprestimoDetectado
): Promise<EmprestimoPendente> {
  const msg = await prisma.mensagemChat.create({
    data: { clienteId, canal, direcao: "BOT", texto: canal === "APP" ? textoPreviaEmprestimoApp(e) : textoPreviaEmprestimo(e) },
  });
  const pendente: EmprestimoPendente = { ...e, tipo: "emprestimo_detectado", mensagemId: msg.id, resolvido: false };
  await prisma.mensagemChat.update({ where: { id: msg.id }, data: { dadosEstruturados: pendente as unknown as object } });
  return pendente;
}

function comoPendente(dados: unknown): EmprestimoPendente | null {
  if (!dados || typeof dados !== "object") return null;
  const d = dados as Partial<EmprestimoPendente>;
  if (d.tipo !== "emprestimo_detectado" || d.resolvido) return null;
  if (typeof d.credor !== "string" || typeof d.totalParcelas !== "number" || typeof d.valorParcela !== "number" || typeof d.primeiraData !== "string") return null;
  return d as EmprestimoPendente;
}

export async function buscarPendenteEmprestimoPorId(clienteId: string, mensagemId: string): Promise<EmprestimoPendente | null> {
  const msg = await prisma.mensagemChat.findFirst({ where: { id: mensagemId, clienteId, direcao: "BOT" }, select: { dadosEstruturados: true } });
  return msg ? comoPendente(msg.dadosEstruturados) : null;
}

/** Última prévia ainda não resolvida do canal (resposta "sim/não" por texto no WhatsApp). */
export async function buscarPendenteEmprestimoRecente(clienteId: string, canal: Canal): Promise<EmprestimoPendente | null> {
  const msgs = await prisma.mensagemChat.findMany({
    where: {
      clienteId,
      canal,
      direcao: "BOT",
      criadoEm: { gte: new Date(Date.now() - JANELA_MS) },
      dadosEstruturados: { path: ["tipo"], equals: "emprestimo_detectado" },
    },
    orderBy: { criadoEm: "desc" },
    take: 1,
    select: { dadosEstruturados: true },
  });
  return msgs[0] ? comoPendente(msgs[0].dadosEstruturados) : null;
}

/** Resolve a prévia. Race-safe: só quem marca `resolvido` primeiro grava (toque duplo não duplica). */
export async function resolverPendenteEmprestimo(
  clienteId: string,
  p: EmprestimoPendente,
  acao: "confirmar" | "negar"
): Promise<{ ok: true; mensagem: string } | { ok: false; erro: string }> {
  const marcou = await prisma.mensagemChat.updateMany({
    where: { id: p.mensagemId, clienteId, NOT: { dadosEstruturados: { path: ["resolvido"], equals: true } } },
    data: { dadosEstruturados: { ...p, resolvido: true } as unknown as object },
  });
  if (marcou.count === 0) return { ok: false, erro: "Esse empréstimo já foi resolvido." };

  if (acao === "negar") return { ok: true, mensagem: "Sem problema, não lancei esse empréstimo." };

  const r = await criarDividaComParcelas({
    clienteId,
    credor: p.credor,
    totalParcelas: p.totalParcelas,
    primeiraData: new Date(`${p.primeiraData}T12:00:00`),
    valorParcela: p.valorParcela,
    tipo: "EMPRESTIMO",
    parcelasJaPagas: p.parcelasPagas,
  });
  if (!r.ok) {
    // devolve a pendência pra poder tentar de novo
    await prisma.mensagemChat.updateMany({ where: { id: p.mensagemId, clienteId }, data: { dadosEstruturados: { ...p, resolvido: false } as unknown as object } });
    return { ok: false, erro: r.erro };
  }
  const restantes = p.totalParcelas - p.parcelasPagas;
  return {
    ok: true,
    mensagem: `✅ Lancei o empréstimo ${p.credor}: ${restantes} parcela(s) de ${fmt(p.valorParcela)} em aberto${p.parcelasPagas > 0 ? ` (${p.parcelasPagas} já paga(s))` : ""}. Vou te lembrar antes de cada vencimento.`,
  };
}
