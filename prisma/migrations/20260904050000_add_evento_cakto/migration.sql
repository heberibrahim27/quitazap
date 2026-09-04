-- CreateTable
CREATE TABLE "EventoCakto" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "evento" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DESCONHECIDO',
    "valorPago" DOUBLE PRECISION,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "transacaoId" TEXT,
    "payloadBruto" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoCakto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventoCakto_transacaoId_key" ON "EventoCakto"("transacaoId");

-- CreateIndex
CREATE INDEX "EventoCakto_clienteId_idx" ON "EventoCakto"("clienteId");

-- CreateIndex
CREATE INDEX "EventoCakto_evento_idx" ON "EventoCakto"("evento");

-- CreateIndex
CREATE INDEX "EventoCakto_criadoEm_idx" ON "EventoCakto"("criadoEm");

-- AddForeignKey
ALTER TABLE "EventoCakto" ADD CONSTRAINT "EventoCakto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
