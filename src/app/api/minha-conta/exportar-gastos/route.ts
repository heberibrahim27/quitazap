// ─────────────────────────────────────────
// QuitaZAP Controle — Exportar meus lançamentos em CSV (cliente final)
// ─────────────────────────────────────────
// Pedido inspirado em pesquisa de concorrentes (09/09/2026 — Financinha,
// FinanBot, Mobills e Organizze todos oferecem exportação de relatório pro
// próprio usuário). Até agora o QuitaZAP só tinha /api/exportar, que é
// backup ADMIN de conta/assinatura (nunca dado financeiro pessoal) — esta
// rota é a versão pro cliente final baixar os PRÓPRIOS lançamentos.
//
// Decisões de segurança (validadas com o ChatGPT antes de subir):
// - Isolamento estrito por clienteId: usa a MESMA sessão de cookie de
//   /minha-conta (getClienteIdDaRequisicao) — nunca aceita um clienteId via
//   query string/body, exatamente pra um cliente nunca conseguir pedir o
//   CSV de outro só trocando um parâmetro.
// - Filtro de período obrigatório: por padrão só o mês atual (mesmo recorte
//   já mostrado em /minha-conta/gastos); `mes=YYYY-MM` exporta um mês
//   específico; `ultimosMeses=N` (máx. 24) exporta uma janela maior. Nunca
//   um "me manda tudo desde sempre" sem limite.
// - Proteção contra CSV injection: descricao/categoria vêm de texto livre
//   digitado pelo cliente no WhatsApp — um campo começando com =, +, -, @
//   é interpretado como fórmula por Excel/Sheets ao abrir o arquivo. Neutraliza
//   prefixando com apóstrofo, técnica padrão da OWASP pra esse caso.
// - Só leitura (nenhum dado é alterado por esta rota).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClienteIdDaRequisicao, erroClienteNaoAutenticado } from "@/lib/get-cliente";

const FUSO = "America/Sao_Paulo";
const MAX_MESES_JANELA = 24;

function anoMesAtualBrasil(agora: Date): { ano: number; mes: number } {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" })
    .format(agora)
    .split("-")
    .map(Number);
  return { ano, mes };
}

// Mesma âncora de "início/fim do mês em Brasília, expresso em UTC" usada em
// orcamento-service.ts e na página /minha-conta/gastos — reaproveitada de
// propósito, não reinventada aqui.
function limitesDoMes(ano: number, mes: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1, 3, 0, 0, 0));
  return { inicio, fim };
}

function subtrairMeses(ano: number, mes: number, n: number): { ano: number; mes: number } {
  const totalMeses = ano * 12 + (mes - 1) - n;
  return { ano: Math.floor(totalMeses / 12), mes: (totalMeses % 12) + 1 };
}

// Neutraliza fórmula (=, +, -, @) e escapa vírgula/aspas/quebra de linha —
// ordem importa: primeiro neutraliza fórmula, só depois decide se precisa
// envolver em aspas (o apóstrofo adicionado não conta pra essa decisão).
function celulaCsv(valor: string): string {
  let v = valor.replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  if (/[",;]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

function fmtValorCsv(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

function fmtDataCsv(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export async function GET(req: NextRequest) {
  const clienteId = getClienteIdDaRequisicao(req);
  if (!clienteId) return erroClienteNaoAutenticado();

  const { searchParams } = new URL(req.url);
  const mesParam = searchParams.get("mes");
  const ultimosMesesParam = searchParams.get("ultimosMeses");

  const agora = new Date();
  const { ano: anoAtual, mes: mesAtual } = anoMesAtualBrasil(agora);

  let inicio: Date;
  let fim: Date;
  let rotuloPeriodo: string;

  const matchMes = mesParam?.match(/^(\d{4})-(\d{2})$/);
  const ultimosMeses = ultimosMesesParam ? Math.min(Math.max(parseInt(ultimosMesesParam, 10) || 0, 1), MAX_MESES_JANELA) : null;

  if (matchMes) {
    const anoInformado = Number(matchMes[1]);
    const mesInformado = Number(matchMes[2]);
    if (anoInformado < 2000 || anoInformado > 2100 || mesInformado < 1 || mesInformado > 12) {
      return NextResponse.json({ error: "Parâmetro 'mes' inválido (use YYYY-MM)." }, { status: 400 });
    }
    ({ inicio } = limitesDoMes(anoInformado, mesInformado));
    ({ fim } = limitesDoMes(anoInformado, mesInformado));
    rotuloPeriodo = mesParam!;
  } else if (ultimosMeses) {
    const inicioJanela = subtrairMeses(anoAtual, mesAtual, ultimosMeses - 1);
    inicio = limitesDoMes(inicioJanela.ano, inicioJanela.mes).inicio;
    fim = limitesDoMes(anoAtual, mesAtual).fim;
    rotuloPeriodo = `ultimos-${ultimosMeses}-meses`;
  } else {
    // Padrão: só o mês atual — mesmo recorte que o cliente já vê em
    // /minha-conta/gastos, nunca "todo o histórico" sem pedir explicitamente.
    ({ inicio, fim } = limitesDoMes(anoAtual, mesAtual));
    rotuloPeriodo = `${anoAtual}-${String(mesAtual).padStart(2, "0")}`;
  }

  const lancamentos = await prisma.lancamento.findMany({
    where: { clienteId, data: { gte: inicio, lt: fim } },
    include: { cartao: { select: { nome: true } } },
    orderBy: { data: "desc" },
    take: 10000, // limite de segurança — nenhum cliente real gera isso num período de até 24 meses
  });

  const cabecalho = ["Data", "Tipo", "Descrição", "Categoria", "Cartão", "Valor (R$)"];
  const linhas = lancamentos.map((l: (typeof lancamentos)[number]) =>
    [
      fmtDataCsv(l.data),
      celulaCsv(l.tipo),
      celulaCsv(l.descricao),
      celulaCsv(l.categoria ?? ""),
      celulaCsv(l.cartao?.nome ?? ""),
      fmtValorCsv(l.valor),
    ].join(";")
  );

  // BOM (﻿) no início — sem isso o Excel abre acentuação (ç, ã, é) como
  // caracteres quebrados por padrão em Windows (achado conhecido de export
  // de CSV em pt-BR); separador ";" em vez de "," pelo mesmo motivo: Excel
  // configurado em pt-BR usa "," como separador decimal do valor, então "," não
  // pode ser o separador de coluna também.
  const csv = "﻿" + [cabecalho.join(";"), ...linhas].join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quitazap-gastos-${rotuloPeriodo}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
