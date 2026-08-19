-- CreateTable
CREATE TABLE "Tarefa" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'LEMBRETE',
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION,
    "vencimento" TIMESTAMP(3),
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "frequencia" TEXT,
    "diaMes" INTEGER,
    "mesAnual" INTEGER,
    "diaSemana" INTEGER,
    "horarioEnvio" TEXT NOT NULL DEFAULT '08:00',
    "dividaId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "origem" TEXT NOT NULL DEFAULT 'TEXTO',
    "concluidaEm" TIMESTAMP(3),
    "ultimoLembrete" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tarefa_clienteId_status_idx" ON "Tarefa"("clienteId", "status");

-- CreateIndex
CREATE INDEX "Tarefa_vencimento_idx" ON "Tarefa"("vencimento");

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "Divida"("id") ON DELETE SET NULL ON UPDATE CASCADE;
