-- CreateTable
CREATE TABLE "AuditoriaAssistente" (
    "id" TEXT NOT NULL,
    "ferramenta" TEXT NOT NULL,
    "argumentos" JSONB NOT NULL,
    "resumo" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "erro" TEXT,
    "solicitadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaAssistente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditoriaAssistente_ferramenta_idx" ON "AuditoriaAssistente"("ferramenta");

-- CreateIndex
CREATE INDEX "AuditoriaAssistente_criadoEm_idx" ON "AuditoriaAssistente"("criadoEm");
