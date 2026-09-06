-- AlterTable
ALTER TABLE "LeadVendas" ADD COLUMN     "motivoDesistencia" TEXT;

-- CreateTable
CREATE TABLE "MensagemLeadVendas" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "direcao" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemLeadVendas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MensagemLeadVendas_leadId_criadoEm_idx" ON "MensagemLeadVendas"("leadId", "criadoEm");

-- AddForeignKey
ALTER TABLE "MensagemLeadVendas" ADD CONSTRAINT "MensagemLeadVendas_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "LeadVendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
