// ─────────────────────────────────────────
// QuitaZAP — Resumo Automático (via QStash)
// POST /api/cron/resumo
// Disparado 10 min após última mensagem do cliente
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp } from "@/lib/zapi";
import { processarMensagemIA, type Mensagem } from "@/lib/ai-bot";
import { gerarRelatorio } from "@/lib/plano";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { telefone, agendadoEm } = body;

    if (!telefone) return NextResponse.json({ ok: false, erro: "sem telefone" });

    const sessao = await prisma.botSessao.findFirst({ where: { telefone } });
    if (!sessao) return NextResponse.json({ ok: true, msg: "sessão não encontrada" });

    // Se nova mensagem chegou APÓS o agendamento → skip (o novo agendamento vai cuidar)
    const tsAgendado = new Date(agendadoEm).getTime();
    const tsUltima = new Date(sessao.atualizadoEm).getTime();
    if (tsUltima > tsAgendado + 10000) {
      console.log(`[RESUMO] Nova mensagem detectada para ${telefone}, skip.`);
      return NextResponse.json({ ok: true, msg: "nova mensagem, skip" });
    }

    // Só processa se ainda estiver coletando dados
    if (sessao.etapa !== "COLETANDO_DIVIDAS") {
      return NextResponse.json({ ok: true, msg: "etapa não aplicável" });
    }

    // Verifica se tem histórico suficiente (mínimo 2 mensagens do usuário)
    const historico: Mensagem[] = JSON.parse(sessao.dividasTemp || "[]");
    const msgsUsuario = historico.filter((m) => m.role === "user");
    if (msgsUsuario.length < 2) {
      return NextResponse.json({ ok: true, msg: "histórico insuficiente" });
    }

    console.log(`[RESUMO] Gerando diagnóstico automático para ${telefone}`);

    // Pede à IA para gerar o diagnóstico com os dados coletados até agora
    const resultado = await processarMensagemIA(
      historico,
      "O cliente ficou em silêncio por alguns minutos. Gere agora o diagnóstico financeiro completo com todos os dados coletados até aqui, mesmo que alguns campos estejam incompletos.",
      sessao.nome ?? "cliente"
    );

    if (resultado.diagnostico) {
      const diag = resultado.diagnostico;
      const relatorio = gerarRelatorio(diag);
      const rendaTotal = diag.renda?.totalFamiliar ?? diag.renda?.salarioLiquido ?? 0;

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          etapa: "PLANO_GERADO",
          renda: rendaTotal,
          dividasTemp: JSON.stringify([
            ...historico,
            { role: "assistant", content: relatorio },
          ]),
        },
      });

      if (sessao.clienteId) {
        await prisma.cliente.update({
          where: { id: sessao.clienteId },
          data: { rendaMensal: rendaTotal, statusAtendimento: "PLANO_GERADO" },
        });

        for (const d of diag.dividas ?? []) {
          await prisma.divida.create({
            data: {
              clienteId: sessao.clienteId,
              credor: d.credor,
              valorTotal: d.saldoAtual ?? d.valorOriginal ?? 0,
              tipo: d.tipo ?? "OUTRO",
              status: "ATIVA",
              diaVencimento: d.diaVencimento ?? null,
              emAtraso: d.emAtraso ?? false,
              diasAtraso: d.diasAtraso ?? null,
              obs: `${d.parcelasRestantes}x de R$${d.valorParcela} — via resumo automático`,
            },
          });
        }

        await prisma.planoEnviado.create({
          data: { clienteId: sessao.clienteId, texto: relatorio },
        });
      }

      // Envia o relatório (dividido se necessário)
      if (relatorio.length > 3800) {
        const partes = dividirMensagem(relatorio, 3800);
        for (const parte of partes) {
          await sendWhatsApp(telefone, parte);
          await new Promise((r) => setTimeout(r, 1200));
        }
      } else {
        await sendWhatsApp(telefone, relatorio);
      }

      console.log(`[RESUMO] Diagnóstico enviado para ${telefone}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[RESUMO] Erro:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function dividirMensagem(texto: string, maxChars: number): string[] {
  const partes: string[] = [];
  const linhas = texto.split("\n");
  let atual = "";
  for (const linha of linhas) {
    if ((atual + "\n" + linha).length > maxChars) {
      if (atual) partes.push(atual.trim());
      atual = linha;
    } else {
      atual = atual ? atual + "\n" + linha : linha;
    }
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}
