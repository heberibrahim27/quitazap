-- CreateTable
CREATE TABLE "ContaAdmin" (
    "id" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustoMensal" (
    "id" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustoMensal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaFinanceira" (
    "id" TEXT NOT NULL,
    "metrica" TEXT NOT NULL,
    "valorAlvo" DOUBLE PRECISION NOT NULL,
    "dataAlvo" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustoMensal_mes_idx" ON "CustoMensal"("mes");

-- CreateIndex
CREATE UNIQUE INDEX "MetaFinanceira_metrica_key" ON "MetaFinanceira"("metrica");
