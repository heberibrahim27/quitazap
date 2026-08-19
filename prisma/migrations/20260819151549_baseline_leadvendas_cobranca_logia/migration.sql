-- BASELINE — leia antes de aplicar.
--
-- Estas 3 tabelas (LeadVendas, Cobranca, LogIA) já existem no schema.prisma e já
-- são usadas em produção pelo código (funil de vendas, Cobrador Automático e log
-- de custo de IA), mas nunca tiveram migration versionada — só a migration
-- "20260627010952_init" existia até aqui, cobrindo só Cliente/Divida/Parcela/
-- Pagamento/PlanoEnviado/BotSessao. Isso foi identificado no levantamento técnico
-- (LEVANTAMENTO-QUITAZAP.md, seção 2) como sinal de que o banco real provavelmente
-- foi evoluído por fora do histórico de migrations (via `prisma db push` ou
-- alteração direta no Supabase).
--
-- Ou seja: é MUITO PROVÁVEL que estas tabelas já existam no banco de produção.
--
-- NÃO rode `prisma migrate deploy` direto com esta migration sem antes conferir:
--
--   1. Rode `npx prisma migrate status` contra o banco real.
--   2. Se `LeadVendas`/`Cobranca`/`LogIA` já existirem lá (bem provável):
--        npx prisma migrate resolve --applied 20260819151549_baseline_leadvendas_cobranca_logia
--      Isso marca esta migration como "já aplicada" sem rodar o SQL abaixo,
--      evitando erro de "relation already exists" — e destrava o histórico pra
--      migrations futuras (como a da Tarefa) rodarem normalmente.
--   3. Se por algum motivo elas NÃO existirem no banco real, aí sim rode
--      `prisma migrate deploy` normalmente e este SQL vai criá-las.
--
-- Ver CONTINUIDADE.md, seção "Checklist de deploy", pro passo a passo completo.

-- CreateTable
CREATE TABLE "LeadVendas" (
    "id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "etapa" TEXT NOT NULL DEFAULT 'QUALIFICACAO',
    "cupomEnviado" BOOLEAN NOT NULL DEFAULT false,
    "msgCount" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadVendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobranca" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "credorNome" TEXT NOT NULL,
    "devedorNome" TEXT NOT NULL,
    "devedorFone" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "mensagem" TEXT,
    "pixChave" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "etapa" INTEGER NOT NULL DEFAULT 1,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimoEnvio" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogIA" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "gratuito" BOOLEAN NOT NULL DEFAULT false,
    "tipo" TEXT NOT NULL,
    "tokensInput" INTEGER NOT NULL DEFAULT 0,
    "tokensOutput" INTEGER NOT NULL DEFAULT 0,
    "custoUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadVendas_telefone_key" ON "LeadVendas"("telefone");

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
