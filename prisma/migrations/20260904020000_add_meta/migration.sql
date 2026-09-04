-- CreateTable
CREATE TABLE "Meta" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valorAlvo" DOUBLE PRECISION NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositoMeta" (
    "id" TEXT NOT NULL,
    "metaId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositoMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meta_clienteId_idx" ON "Meta"("clienteId");

-- CreateIndex
CREATE INDEX "DepositoMeta_metaId_idx" ON "DepositoMeta"("metaId");

-- AddForeignKey
ALTER TABLE "Meta" ADD CONSTRAINT "Meta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositoMeta" ADD CONSTRAINT "DepositoMeta_metaId_fkey" FOREIGN KEY ("metaId") REFERENCES "Meta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
