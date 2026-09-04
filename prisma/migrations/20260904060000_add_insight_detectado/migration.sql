-- CreateTable
CREATE TABLE "InsightDetectado" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ANOMALIA_CATEGORIA',
    "categoria" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "totalMesAtual" DOUBLE PRECISION NOT NULL,
    "mediaUltimosMeses" DOUBLE PRECISION NOT NULL,
    "multiplicador" DOUBLE PRECISION NOT NULL,
    "textoGerado" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SOMBRA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightDetectado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsightDetectado_clienteId_categoria_mes_key" ON "InsightDetectado"("clienteId", "categoria", "mes");

-- CreateIndex
CREATE INDEX "InsightDetectado_clienteId_idx" ON "InsightDetectado"("clienteId");

-- CreateIndex
CREATE INDEX "InsightDetectado_criadoEm_idx" ON "InsightDetectado"("criadoEm");

-- AddForeignKey
ALTER TABLE "InsightDetectado" ADD CONSTRAINT "InsightDetectado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
