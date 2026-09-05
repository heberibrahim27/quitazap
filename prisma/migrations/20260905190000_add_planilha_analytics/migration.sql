-- CreateTable
CREATE TABLE "PlanilhaAnalytics" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "linhas" JSONB NOT NULL,
    "metricas" JSONB NOT NULL,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanilhaAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanilhaAnalytics_chave_key" ON "PlanilhaAnalytics"("chave");
