-- AlterTable
ALTER TABLE "MensagemPendenteRevisao" ADD COLUMN     "criticidade" TEXT NOT NULL DEFAULT 'MONITORAMENTO',
ADD COLUMN     "categoria" TEXT;

-- CreateIndex
CREATE INDEX "MensagemPendenteRevisao_criticidade_resolvida_criadoEm_idx" ON "MensagemPendenteRevisao"("criticidade", "resolvida", "criadoEm");
