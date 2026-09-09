-- AlterTable: Divida ganha vínculo opcional com Cartao (fatura em PDF importada)
ALTER TABLE "Divida" ADD COLUMN "cartaoId" TEXT;

-- AlterTable: BotSessao ganha estado de confirmação da fatura de cartão em PDF
ALTER TABLE "BotSessao" ADD COLUMN "faturaCartaoPendente" JSONB;

-- CreateTable
CREATE TABLE "DocumentoImportado" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoImportado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoImportado_clienteId_hash_key" ON "DocumentoImportado"("clienteId", "hash");

-- AddForeignKey
ALTER TABLE "Divida" ADD CONSTRAINT "Divida_cartaoId_fkey" FOREIGN KEY ("cartaoId") REFERENCES "Cartao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoImportado" ADD CONSTRAINT "DocumentoImportado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
