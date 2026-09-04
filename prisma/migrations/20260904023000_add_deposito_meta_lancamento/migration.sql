-- AlterTable
ALTER TABLE "DepositoMeta" ADD COLUMN "lancamentoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DepositoMeta_lancamentoId_key" ON "DepositoMeta"("lancamentoId");

-- AddForeignKey
ALTER TABLE "DepositoMeta" ADD CONSTRAINT "DepositoMeta_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
