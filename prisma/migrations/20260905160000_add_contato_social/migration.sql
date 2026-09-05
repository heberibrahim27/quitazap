-- CreateTable
CREATE TABLE "ContatoSocial" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valorBruto" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContatoSocial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContatoSocial_ativo_ordem_idx" ON "ContatoSocial"("ativo", "ordem");
