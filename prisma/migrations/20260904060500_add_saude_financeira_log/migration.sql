-- CreateTable
CREATE TABLE "SaudeFinanceiraLog" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "versaoFormula" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "classificacao" TEXT NOT NULL,
    "dadosInsuficientes" BOOLEAN NOT NULL DEFAULT false,
    "componentes" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaudeFinanceiraLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaudeFinanceiraLog_clienteId_dia_key" ON "SaudeFinanceiraLog"("clienteId", "dia");

-- CreateIndex
CREATE INDEX "SaudeFinanceiraLog_clienteId_idx" ON "SaudeFinanceiraLog"("clienteId");

-- AddForeignKey
ALTER TABLE "SaudeFinanceiraLog" ADD CONSTRAINT "SaudeFinanceiraLog_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
