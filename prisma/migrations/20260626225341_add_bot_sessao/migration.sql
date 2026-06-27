-- CreateTable
CREATE TABLE "BotSessao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telefone" TEXT NOT NULL,
    "clienteId" TEXT,
    "etapa" TEXT NOT NULL DEFAULT 'COLETANDO_DIVIDAS',
    "nome" TEXT,
    "dividasTemp" TEXT NOT NULL DEFAULT '[]',
    "renda" REAL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "BotSessao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "obs" TEXT,
    "statusAtendimento" TEXT NOT NULL DEFAULT 'NOVO',
    "rendaMensal" REAL,
    "despesasFixas" REAL,
    "valorDisponivelMensal" REAL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL
);
INSERT INTO "new_Cliente" ("atualizadoEm", "cpf", "criadoEm", "email", "id", "nome", "obs", "telefone") SELECT "atualizadoEm", "cpf", "criadoEm", "email", "id", "nome", "obs", "telefone" FROM "Cliente";
DROP TABLE "Cliente";
ALTER TABLE "new_Cliente" RENAME TO "Cliente";
CREATE TABLE "new_Divida" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "credor" TEXT NOT NULL,
    "descricao" TEXT,
    "obs" TEXT,
    "valorTotal" REAL NOT NULL,
    "valorPago" REAL NOT NULL DEFAULT 0,
    "tipo" TEXT NOT NULL DEFAULT 'OUTRO',
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "dataReferencia" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "Divida_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Divida" ("atualizadoEm", "clienteId", "credor", "criadoEm", "dataReferencia", "descricao", "id", "obs", "status", "tipo", "valorPago", "valorTotal") SELECT "atualizadoEm", "clienteId", "credor", "criadoEm", "dataReferencia", "descricao", "id", "obs", "status", "tipo", "valorPago", "valorTotal" FROM "Divida";
DROP TABLE "Divida";
ALTER TABLE "new_Divida" RENAME TO "Divida";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BotSessao_telefone_key" ON "BotSessao"("telefone");
