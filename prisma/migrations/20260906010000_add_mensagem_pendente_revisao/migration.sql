-- CreateTable
CREATE TABLE "MensagemPendenteRevisao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "telefone" TEXT,
    "nome" TEXT,
    "mensagem" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "resolvida" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidaEm" TIMESTAMP(3),

    CONSTRAINT "MensagemPendenteRevisao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MensagemPendenteRevisao_resolvida_criadoEm_idx" ON "MensagemPendenteRevisao"("resolvida", "criadoEm");

-- CreateIndex
CREATE INDEX "MensagemPendenteRevisao_clienteId_idx" ON "MensagemPendenteRevisao"("clienteId");

-- AddForeignKey
ALTER TABLE "MensagemPendenteRevisao" ADD CONSTRAINT "MensagemPendenteRevisao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
