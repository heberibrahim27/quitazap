// "Reivindica" uma confirmação pendente (fatura, boleto ou comprovante) de forma ATÔMICA: lê o
// valor e o zera na mesma instrução, travando a linha. Dois toques simultâneos em "Salvar"
// não gravam em dobro — só o primeiro recebe o pendente, o segundo recebe null (→ 409).
// Antes: ler → zerar → gravar em passos separados deixava uma janela onde as duas
// requisições liam o mesmo pendente (achado no QA de 2026-10-08: 4 lançamentos em vez de 2).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ColunaPendente = "faturaCartaoPendente" | "boletoPendente" | "comprovanteFotoPendente";

const COLUNAS: Record<ColunaPendente, Prisma.Sql> = {
  faturaCartaoPendente: Prisma.raw('"faturaCartaoPendente"'),
  boletoPendente: Prisma.raw('"boletoPendente"'),
  comprovanteFotoPendente: Prisma.raw('"comprovanteFotoPendente"'),
};

export async function reivindicarPendente<T>(sessaoId: string, coluna: ColunaPendente): Promise<T | null> {
  const col = COLUNAS[coluna];
  const linhas = await prisma.$queryRaw<{ p: T }[]>(Prisma.sql`
    WITH velho AS (
      SELECT ${col} AS p FROM "BotSessao"
      WHERE id = ${sessaoId} AND ${col} IS NOT NULL AND ${col} <> 'null'::jsonb
      FOR UPDATE
    )
    UPDATE "BotSessao" b SET ${col} = 'null'::jsonb
    FROM velho WHERE b.id = ${sessaoId}
    RETURNING velho.p AS p
  `);
  return linhas[0]?.p ?? null;
}
