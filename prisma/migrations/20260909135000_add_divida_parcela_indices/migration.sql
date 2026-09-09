-- Achado em auditoria de performance ao vivo (09/09/2026): Divida e Parcela
-- não tinham NENHUM índice além da chave primária. Toda busca por
-- clienteId (Divida) ou dividaId+status (Parcela) -- o caminho mais comum
-- de leitura do app, disparado por praticamente qualquer mensagem de
-- WhatsApp que toca em dívida/plano/resumo -- fazia table scan completo,
-- piorando conforme a base de clientes cresce.
CREATE INDEX IF NOT EXISTS "Divida_clienteId_status_idx" ON "Divida"("clienteId", "status");
CREATE INDEX IF NOT EXISTS "Parcela_dividaId_status_idx" ON "Parcela"("dividaId", "status");
