-- CreateTable
CREATE TABLE "MarketingParametros" (
    "id" TEXT NOT NULL,
    "investimentoInicialMensal" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "cacProjetado" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "churnMensal" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "horizonteMeses" INTEGER NOT NULL DEFAULT 12,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingParametros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingMesReal" (
    "id" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "investimentoReal" DOUBLE PRECISION NOT NULL,
    "novasAssinaturasPagas" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingMesReal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingMesReal_mes_key" ON "MarketingMesReal"("mes");
