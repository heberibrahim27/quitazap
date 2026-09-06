// ─────────────────────────────────────────
// QuitaZAP — Auditoria do Assistente Admin
// ─────────────────────────────────────────
// Toda ação de escrita executada de fato (nunca a proposta, só a
// confirmação — ver api/assistente-admin/confirmar/route.ts) grava uma
// linha aqui. Mesmo padrão defensivo do registrarLogIA em openai-client.ts:
// falha ao gravar auditoria não pode derrubar a resposta ao usuário, só loga.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function registrarAuditoria(opts: {
  ferramenta: string;
  argumentos: unknown;
  resumo: string;
  antes?: unknown;
  depois?: unknown;
  sucesso: boolean;
  erro?: string;
}) {
  try {
    await prisma.auditoriaAssistente.create({
      data: {
        ferramenta: opts.ferramenta,
        argumentos: opts.argumentos as Prisma.InputJsonValue,
        resumo: opts.resumo,
        antes: (opts.antes ?? undefined) as Prisma.InputJsonValue | undefined,
        depois: (opts.depois ?? undefined) as Prisma.InputJsonValue | undefined,
        sucesso: opts.sucesso,
        erro: opts.erro ?? null,
      },
    });
  } catch (e) {
    console.error("[AuditoriaAssistente] Erro ao registrar:", e);
  }
}
