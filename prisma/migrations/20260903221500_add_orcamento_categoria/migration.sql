-- CreateTable
CREATE TABLE "OrcamentoCategoria" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "limiteMensal" DOUBLE PRECISION NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrcamentoCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrcamentoCategoria_clienteId_categoria_key" ON "OrcamentoCategoria"("clienteId", "categoria");

-- AddForeignKey
ALTER TABLE "OrcamentoCategoria" ADD CONSTRAINT "OrcamentoCategoria_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
