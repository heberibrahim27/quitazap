-- AlterTable: Divida ganha quantidade de parcelas
ALTER TABLE "Divida" ADD COLUMN "totalParcelas" INTEGER;

-- CreateTable
CREATE TABLE "Cartao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "diaFechamento" INTEGER,
    "diaVencimento" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cartao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "cartaoId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'TEXTO',
    "comprovanteUrl" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cartao_clienteId_nome_key" ON "Cartao"("clienteId", "nome");

-- CreateIndex
CREATE INDEX "Lancamento_clienteId_data_idx" ON "Lancamento"("clienteId", "data");

-- CreateIndex
CREATE INDEX "Lancamento_clienteId_tipo_idx" ON "Lancamento"("clienteId", "tipo");

-- AddForeignKey
ALTER TABLE "Cartao" ADD CONSTRAINT "Cartao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_cartaoId_fkey" FOREIGN KEY ("cartaoId") REFERENCES "Cartao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mantem consistencia de seguranca com o resto do banco (RLS ligado em tudo)
ALTER TABLE "Cartao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lancamento" ENABLE ROW LEVEL SECURITY;
