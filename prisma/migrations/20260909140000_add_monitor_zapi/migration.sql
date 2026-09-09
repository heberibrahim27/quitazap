-- CreateTable
CREATE TABLE "MonitorZapi" (
    "id" TEXT NOT NULL,
    "instancia" TEXT NOT NULL,
    "conectado" BOOLEAN NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorZapi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitorZapi_instancia_key" ON "MonitorZapi"("instancia");
