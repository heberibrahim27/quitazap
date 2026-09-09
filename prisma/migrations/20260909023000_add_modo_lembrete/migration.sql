-- Lembrete/tarefa também pode sair como nota de voz (Fatura Inteligente-style
-- opt-in, padrão TEXTO pra ninguém mudar de comportamento sem pedir).
ALTER TABLE "Cliente" ADD COLUMN "modoLembrete" TEXT NOT NULL DEFAULT 'TEXTO';
