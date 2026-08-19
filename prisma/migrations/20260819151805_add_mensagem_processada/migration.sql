-- CreateTable
CREATE TABLE "MensagemProcessada" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemProcessada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MensagemProcessada_messageId_key" ON "MensagemProcessada"("messageId");
